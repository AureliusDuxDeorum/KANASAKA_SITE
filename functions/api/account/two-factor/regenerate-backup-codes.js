import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
  verifyPassword,
} from "../../../lib/auth.js";
import { generateBackupCodes } from "../../../lib/two-factor.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const password = String(body.currentPassword || "");
  const row = await env.DB.prepare("SELECT password_hash, totp_enabled FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  if (!row || !row.totp_enabled) {
    return errorResponse("Two-factor authentication is not enabled.", 400);
  }

  const validPassword = await verifyPassword(password, row.password_hash, env);
  if (!validPassword) {
    return errorResponse("Current password is incorrect.", 401);
  }

  const backupCodes = await generateBackupCodes(env, user.id);
  await logAuthEvent(env, "twofa_backup_codes_regenerated", { ip: clientIp(request), userId: user.id });

  return jsonResponse({
    success: true,
    backupCodes,
    message: "New backup codes generated. Your old ones no longer work.",
  });
}
