import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { normalizeAccountId } from "../../lib/ks-stocks-access.js";
import { requireAdminAccess, requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const url = new URL(request.url);
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) {
    return errorResponse("Provide an email or account ID to look up.");
  }

  const user = await env.DB.prepare(
    `SELECT id, email, account_id, role, email_verified, totp_enabled, phone_e164, created_at
     FROM users
     WHERE email = ? COLLATE NOCASE OR account_id = ? COLLATE NOCASE`
  )
    .bind(query, normalizeAccountId(query))
    .first();

  if (!user) {
    return errorResponse("No account found.", 404);
  }

  return jsonResponse({
    id: user.id,
    email: user.email,
    accountId: user.account_id,
    role: user.role,
    emailVerified: Boolean(user.email_verified),
    twoFactorEnabled: Boolean(user.totp_enabled),
    hasPhone: Boolean(user.phone_e164),
    createdAt: user.created_at,
  });
}
