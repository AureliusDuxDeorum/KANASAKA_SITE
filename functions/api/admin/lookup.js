import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { normalizeAccountId } from "../../lib/ks-stocks-access.js";
import { applyDuePendingRoleChanges, getPendingRoleChange } from "../../lib/pending-changes.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const actor = adminActorLabel(user);
  const ip = clientIp(request);

  // Even a legitimate admin session shouldn't be able to enumerate every
  // account without limit -- caps this well above normal use, low enough to
  // blunt abuse of a compromised session/device.
  if (await throttleAdminAction(env, "admin_lookup", actor, { max: 30, windowMinutes: 10 })) {
    return errorResponse("Too many lookups. Try again later.", 429);
  }

  const url = new URL(request.url);
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) {
    return errorResponse("Provide an email or account ID to look up.");
  }

  const user_ = await env.DB.prepare(
    `SELECT id, email, account_id, role, email_verified, totp_enabled, phone_e164, created_at
     FROM users
     WHERE email = ? COLLATE NOCASE OR account_id = ? COLLATE NOCASE`
  )
    .bind(query, normalizeAccountId(query))
    .first();

  await logAuthEvent(env, "admin_lookup", { ip, email: actor, query, found: Boolean(user_) });

  if (!user_) {
    return errorResponse("No account found.", 404);
  }

  const applied = await applyDuePendingRoleChanges(env, user_.id);
  if (applied) {
    user_.role = applied.role;
  }
  const pending = await getPendingRoleChange(env, user_.id);

  return jsonResponse({
    id: user_.id,
    email: user_.email,
    accountId: user_.account_id,
    role: user_.role,
    emailVerified: Boolean(user_.email_verified),
    twoFactorEnabled: Boolean(user_.totp_enabled),
    hasPhone: Boolean(user_.phone_e164),
    createdAt: user_.created_at,
    pendingRoleChange: pending
      ? { newRole: pending.new_role, previousRole: pending.previous_role, effectiveAt: pending.effective_at }
      : null,
  });
}
