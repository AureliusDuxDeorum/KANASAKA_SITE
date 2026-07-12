import {
  consumeEmailToken,
  deleteAllUserSessions,
  errorResponse,
  hashPassword,
  jsonResponse,
  passwordValidationError,
  readJson,
} from "../../lib/auth.js";
import {
  clientIp,
  enforceRateLimit,
  logAuthEvent,
  requireSameOrigin,
} from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);
  const rateLimited = await enforceRateLimit(env, `reset:ip:${ip}`, "resetIp");
  if (rateLimited) return rateLimited;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token) {
    return errorResponse("Reset token is required.", 400);
  }

  const passwordError = passwordValidationError(password);
  if (passwordError) {
    return errorResponse(passwordError);
  }

  const record = await consumeEmailToken(env, token, "reset");
  if (!record) {
    await logAuthEvent(env, "password_reset_failed", { ip, reason: "invalid_token" });
    return errorResponse("Reset link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(password);

  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, record.user_id)
    .run();

  await deleteAllUserSessions(env, record.user_id);
  await logAuthEvent(env, "password_reset_success", { ip, userId: record.user_id });

  return jsonResponse({
    success: true,
    message: "Password updated. You can now sign in with your new password.",
  });
}
