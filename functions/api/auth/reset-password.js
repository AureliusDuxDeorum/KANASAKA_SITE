import {
  consumeEmailToken,
  deleteAllUserSessions,
  errorResponse,
  hashPassword,
  jsonResponse,
  normalizeEmail,
  passwordValidationError,
  readJson,
  validateEmail,
} from "../../lib/auth.js";
import {
  clientIp,
  logAuthEvent,
  requireSameOrigin,
  tooManyRecentFailures,
} from "../../lib/security.js";

const CODE_RE = /^[0-9]{6}$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);
  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  const password = String(body.password || "");

  if (!validateEmail(email) || !CODE_RE.test(code)) {
    return errorResponse("Enter the 6-digit code sent to your email.", 400);
  }

  const passwordError = passwordValidationError(password);
  if (passwordError) {
    return errorResponse(passwordError);
  }

  if (await tooManyRecentFailures(env, "password_reset_failed", email)) {
    await logAuthEvent(env, "password_reset_failed", { ip, email, reason: "rate_limited" });
    return errorResponse("Too many attempts. Request a new code and try again.", 429);
  }

  const record = await consumeEmailToken(env, code, "reset");
  if (!record || String(record.email || "").toLowerCase() !== email) {
    await logAuthEvent(env, "password_reset_failed", { ip, email, reason: "invalid_code" });
    return errorResponse("That code is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(password, env);

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
