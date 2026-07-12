import {
  consumeEmailToken,
  createSession,
  errorResponse,
  jsonResponse,
  sessionCookieHeader,
  sessionPayload,
} from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  if (!token) {
    return errorResponse("Verification token is required.", 400);
  }

  const record = await consumeEmailToken(env, token, "verify");
  if (!record) {
    return errorResponse("Verification link is invalid or has expired.", 400);
  }

  await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?")
    .bind(record.user_id)
    .run();

  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.email_verified, u.display_name,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM users u
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE u.id = ?`
  )
    .bind(record.user_id)
    .first();

  const session = await createSession(env, user.id);

  return jsonResponse(
    {
      ...sessionPayload(user),
      message: "Email verified successfully.",
    },
    200,
    {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    }
  );
}
