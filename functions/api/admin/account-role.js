import { errorResponse, jsonResponse, readJson, verifyPassword } from "../../lib/auth.js";
import { normalizeAccountId, validateAccountId } from "../../lib/account-id.js";
import { normalizeRole, ROLES } from "../../lib/roles.js";
import {
  sendPendingRoleChangeAdminCopyEmail,
  sendPendingRoleChangeEmail,
  sendRoleChangedEmail,
  siteUrl,
} from "../../lib/email.js";
import { getSecurityPhrase } from "../../lib/security-phrase.js";
import { schedulePendingRoleChange } from "../../lib/pending-changes.js";
import {
  adminActorLabel,
  approxLocation,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user: actingUser, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const actor = adminActorLabel(actingUser);
  const ip = clientIp(request);
  const location = approxLocation(request);

  if (await throttleAdminAction(env, "admin_role_updated", actor, { max: 10, windowMinutes: 10 })) {
    return errorResponse("Too many role changes. Try again later.", 429);
  }

  // Step-up re-authentication: a session cookie alone is not enough to
  // change someone else's privilege level, even from an already-logged-in
  // admin session (mitigates a stolen/hijacked session or an unattended,
  // unlocked device). Bearer-secret access is a separate, already-strong
  // trust channel and skips this -- there's no "current password" to check.
  // A wrong password here also counts toward the escalating admin lockout
  // in requireAdminAccess (keyed on the same admin_role_update_failed event).
  if (actingUser) {
    const password = String(body.currentPassword || "");
    if (!password) {
      return errorResponse("Enter your current password to confirm this change.");
    }

    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
      .bind(actingUser.id)
      .first();

    const validPassword = row && (await verifyPassword(password, row.password_hash, env));
    if (!validPassword) {
      await logAuthEvent(env, "admin_role_update_failed", {
        ip,
        email: actor,
        reason: "bad_step_up_password",
      });
      return errorResponse("Current password is incorrect.", 401);
    }
  }

  const accountId = normalizeAccountId(body.accountId);
  const validated = validateAccountId(accountId);
  if (!validated.ok) {
    return errorResponse(validated.error);
  }

  const role = normalizeRole(body.role);
  if (!Object.values(ROLES).includes(role)) {
    return errorResponse(
      "Role must be one of: " + Object.values(ROLES).join(", ") + "."
    );
  }

  const user = await env.DB.prepare(
    "SELECT id, email, account_id, role FROM users WHERE account_id = ? COLLATE NOCASE"
  )
    .bind(validated.value)
    .first();

  if (!user) {
    return errorResponse("No account found with that ID.", 404);
  }

  if (role === user.role) {
    return jsonResponse({
      success: true,
      accountId: validated.value,
      role,
      message: "@" + validated.value + " already has that role.",
    });
  }

  // Vault-style time lock (Coinbase Vault / Kraken Global Settings Lock):
  // the change is scheduled, not applied immediately. Both the target and
  // the requesting admin get a cancel link; if nothing cancels it, it
  // applies automatically once the delay elapses (see pending-changes.js
  // for how "elapsed" is detected without a cron trigger).
  const scheduled = await schedulePendingRoleChange(env, {
    userId: user.id,
    previousRole: user.role,
    newRole: role,
    requestedBy: actor,
  });

  await logAuthEvent(env, "admin_role_change_scheduled", {
    ip,
    email: actor,
    userId: user.id,
    targetEmail: user.email,
    accountId: validated.value,
    previousRole: user.role,
    role,
    immediate: !scheduled,
  });

  if (!scheduled) {
    // migrations/016_admin_hardening.sql hasn't been run yet -- fail back to
    // the pre-hardening immediate-apply behavior rather than silently
    // dropping the request.
    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, user.id).run();

    try {
      const securityPhrase = await getSecurityPhrase(env, user.id);
      await sendRoleChangedEmail(env, user.email, { role, location, securityPhrase });
    } catch (err) {
      console.error("Role change notification email failed:", err);
    }

    return jsonResponse({
      success: true,
      accountId: validated.value,
      role,
      message: "Role updated for @" + validated.value + " (migration 016 not applied yet -- applied immediately).",
    });
  }

  const cancelUrl = siteUrl(env) + "/admin/cancel-role-change/?token=" + encodeURIComponent(scheduled.cancelToken);

  try {
    const securityPhrase = await getSecurityPhrase(env, user.id);
    await sendPendingRoleChangeEmail(env, user.email, {
      previousRole: user.role,
      role,
      effectiveAt: scheduled.effectiveAt,
      cancelUrl,
      location,
      securityPhrase,
    });
  } catch (err) {
    console.error("Pending role change email failed:", err);
  }

  if (actingUser && actingUser.email !== user.email) {
    try {
      await sendPendingRoleChangeAdminCopyEmail(env, actingUser.email, {
        targetAccountId: validated.value,
        previousRole: user.role,
        role,
        effectiveAt: scheduled.effectiveAt,
        cancelUrl,
      });
    } catch (err) {
      console.error("Admin copy email failed:", err);
    }
  }

  return jsonResponse({
    success: true,
    accountId: validated.value,
    role,
    pending: true,
    effectiveAt: scheduled.effectiveAt,
    message:
      "Role change to " + role + " for @" + validated.value + " is scheduled for " +
      scheduled.effectiveAt + ". Both the account and you were emailed a cancel link.",
  });
}
