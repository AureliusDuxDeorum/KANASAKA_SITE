import {
  createSession,
  deleteAllUserSessions,
  errorResponse,
  jsonResponse,
  LOGIN_FAILURE_MESSAGE,
  normalizeEmail,
  passwordValidationError,
  readJson,
  sessionCookieHeader,
  sessionPayload,
  validateEmail,
  verifyPassword,
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
  const rateLimited = await enforceRateLimit(env, `login:ip:${ip}`, "loginIp");
  if (rateLimited) return rateLimited;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const passwordError = passwordValidationError(password);

  if (!validateEmail(email) || passwordError) {
    await logAuthEvent(env, "login_failed", { ip, reason: "invalid_input" });
    return errorResponse(LOGIN_FAILURE_MESSAGE, 401);
  }

  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.email_verified, u.display_name,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM users u
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE u.email = ? COLLATE NOCASE`
  )
    .bind(email)
    .first();

  if (!user) {
    await logAuthEvent(env, "login_failed", { ip, reason: "unknown_user" });
    return errorResponse(LOGIN_FAILURE_MESSAGE, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await logAuthEvent(env, "login_failed", { ip, reason: "bad_password" });
    return errorResponse(LOGIN_FAILURE_MESSAGE, 401);
  }

  if (!user.email_verified) {
    await logAuthEvent(env, "login_failed", { ip, reason: "unverified" });
    return errorResponse(LOGIN_FAILURE_MESSAGE, 401);
  }

  await deleteAllUserSessions(env, user.id);
  const session = await createSession(env, user.id);
  await logAuthEvent(env, "login_success", { ip, userId: user.id });

  return jsonResponse(sessionPayload(user), 200, {
    "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
  });
}
