import {
  createSession,
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  sessionCookieHeader,
  sessionPayload,
  validateEmail,
  validatePassword,
  verifyPassword,
} from "../../lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!validateEmail(email) || !validatePassword(password)) {
    return errorResponse("Invalid email or password.", 401);
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
    return errorResponse("Invalid email or password.", 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorResponse("Invalid email or password.", 401);
  }

  if (!user.email_verified) {
    return errorResponse(
      "Confirm your email address before signing in. Check your inbox for the verification link.",
      403
    );
  }

  const session = await createSession(env, user.id);

  return jsonResponse(sessionPayload(user), 200, {
    "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
  });
}
