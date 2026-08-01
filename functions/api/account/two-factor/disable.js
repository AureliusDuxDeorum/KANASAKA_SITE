import {
  deleteAllUserSessions,
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
  verifyPassword,
} from "../../../lib/auth.js";
import { decryptTotpSecret, disableTotp } from "../../../lib/two-factor.js";
import { verifyTotpCode } from "../../../lib/totp.js";
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

  const password = String(body.password || "");
  const code = String(body.code || "");

  const row = await env.DB.prepare(
    "SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first();

  if (!row || !row.totp_enabled) {
    return errorResponse("Two-factor authentication is not enabled.", 400);
  }

  const validPassword = await verifyPassword(password, row.password_hash, env);
  if (!validPassword) {
    return errorResponse("Current password is incorrect.", 401);
  }

  const secret = await decryptTotpSecret(row.totp_secret, env);
  const validCode = secret ? await verifyTotpCode(secret, code) : false;
  if (!validCode) {
    return errorResponse("Invalid authenticator code.", 401);
  }

  await disableTotp(env, user.id);
  await deleteAllUserSessions(env, user.id);
  await logAuthEvent(env, "twofa_disabled", { ip: clientIp(request), userId: user.id });

  return jsonResponse({
    success: true,
    message: "Two-factor authentication disabled. Sign in again on each device.",
  });
}
