import {
  consumeEmailToken,
  createSession,
  errorResponse,
  jsonResponse,
  readJson,
  sessionCookieHeader,
  sessionPayload,
} from "../../lib/auth.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

async function verifyWithToken(env, token, ip) {
  const record = await consumeEmailToken(env, token, "verify");
  if (!record) {
    await logAuthEvent(env, "verify_failed", { ip, reason: "invalid_token" });
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
  await logAuthEvent(env, "verify_success", { ip, userId: user.id });

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

  const token = String(body.token || "").trim();
  if (!token) {
    return errorResponse("Verification token is required.", 400);
  }

  return verifyWithToken(env, token, ip);
}

export async function onRequestGet(context) {
  return errorResponse(
    "Open the verification link from your email in a browser.",
    405
  );
}
