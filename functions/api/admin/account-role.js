import { errorResponse, jsonResponse, readJson, verifyPassword } from "../../lib/auth.js";
import { normalizeAccountId, validateAccountId } from "../../lib/account-id.js";
import { normalizeRole, ROLES } from "../../lib/roles.js";
import { sendRoleChangedEmail } from "../../lib/email.js";
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

  if (await throttleAdminAction(env, "admin_role_updated", actor, { max: 10, windowMinutes: 10 })) {
    return errorResponse("Too many role changes. Try again later.", 429);
  }

  // Step-up re-authentication: a session cookie alone is not enough to
  // change someone else's privilege level, even from an already-logged-in
  // admin session (mitigates a stolen/hijacked session or an unattended,
  // unlocked device). Bearer-secret access is a separate, already-strong
  // trust channel and skips this -- there's no "current password" to check.
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

  await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?")
    .bind(role, user.id)
    .run();

  await logAuthEvent(env, "admin_role_updated", {
    ip,
    email: actor,
    userId: user.id,
    targetEmail: user.email,
    accountId: validated.value,
    previousRole: user.role,
    role,
  });

  if (role !== user.role) {
    try {
      await sendRoleChangedEmail(env, user.email, { role, location: approxLocation(request) });
    } catch (err) {
      console.error("Role change notification email failed:", err);
    }
  }

  return jsonResponse({
    success: true,
    accountId: validated.value,
    role,
    message: "Role updated for @" + validated.value + ".",
  });
}
