import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { isAdminUser, normalizeRole } from "../../lib/roles.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

// Hard ceiling so one request can never pull an unbounded table.
const MAX_USERS = 5000;

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

  // Listing every account is the most sensitive read here, so it is audited
  // and throttled like the single-account lookup (just with a lower ceiling:
  // one list load serves a whole browsing session).
  if (await throttleAdminAction(env, "admin_user_list", actor, { max: 20, windowMinutes: 10 })) {
    return errorResponse("Too many requests. Try again later.", 429);
  }

  let rows = [];
  try {
    const result = await env.DB.prepare(
      `SELECT id, email, display_name, account_id, role, email_verified, totp_enabled, created_at
       FROM users
       ORDER BY LOWER(COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(account_id, ''), email)), id
       LIMIT ?`
    )
      .bind(MAX_USERS)
      .all();
    rows = result.results || [];
  } catch (err) {
    return errorResponse("Could not read users: " + (err.message || "unknown error"), 500);
  }

  await logAuthEvent(env, "admin_user_list", { ip, email: actor, count: rows.length });

  const users = rows.map(function (row) {
    return {
      id: row.id,
      displayName: row.display_name || null,
      accountId: row.account_id || null,
      email: row.email,
      // dev_ks counts as an admin everywhere else (isAdminUser), so it is
      // shown as one here too.
      role: isAdminUser(row) ? "admin" : normalizeRole(row.role),
      emailVerified: Boolean(row.email_verified),
      twoFactorEnabled: Boolean(row.totp_enabled),
      createdAt: row.created_at,
    };
  });

  return jsonResponse({ users, total: users.length });
}
