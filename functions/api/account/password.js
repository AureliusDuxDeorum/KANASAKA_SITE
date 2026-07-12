import {
  createSession,
  deleteAllUserSessions,
  errorResponse,
  getSessionUser,
  hashPassword,
  jsonResponse,
  passwordValidationError,
  readJson,
  sessionCookieHeader,
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

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to change your password.", 401);
  }

  const ip = clientIp(request);
  const rateLimited = await enforceRateLimit(env, `password:ip:${ip}`, "passwordIp");
  if (rateLimited) return rateLimited;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  const passwordError = passwordValidationError(newPassword);
  if (passwordError) {
    return errorResponse(passwordError);
  }

  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  if (!row) {
    return errorResponse("Account not found.", 404);
  }

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) {
    await logAuthEvent(env, "password_change_failed", {
      ip,
      userId: user.id,
      reason: "bad_current_password",
    });
    return errorResponse("Current password is incorrect.", 401);
  }

  const samePassword = await verifyPassword(newPassword, row.password_hash);
  if (samePassword) {
    return errorResponse("Choose a different password than your current one.");
  }

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, user.id)
    .run();

  await deleteAllUserSessions(env, user.id);
  const session = await createSession(env, user.id);
  await logAuthEvent(env, "password_change_success", { ip, userId: user.id });

  return jsonResponse(
    {
      success: true,
      message: "Password updated. Other devices have been signed out.",
    },
    200,
    {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    }
  );
}
