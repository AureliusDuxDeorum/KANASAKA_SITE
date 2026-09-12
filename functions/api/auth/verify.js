import {
  consumeEmailToken,
  createSession,
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  sessionCookieHeader,
  sessionPayload,
  validateEmail,
} from "../../lib/auth.js";
import {
  clientIp,
  logAuthEvent,
  requireSameOrigin,
  tooManyRecentFailures,
} from "../../lib/security.js";

const CODE_RE = /^[0-9]{6}$/;

async function verifyWithCode(env, email, code, ip) {
  const record = await consumeEmailToken(env, code, "verify");
  if (!record || String(record.email || "").toLowerCase() !== email) {
    await logAuthEvent(env, "verify_failed", { ip, email });
    return errorResponse("That code is invalid or has expired.", 400);
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
      ...sessionPayload(user, env),
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

  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();

  if (!validateEmail(email) || !CODE_RE.test(code)) {
    return errorResponse("Enter the 6-digit code sent to your email.", 400);
  }

  if (await tooManyRecentFailures(env, "verify_failed", email)) {
    await logAuthEvent(env, "verify_failed", { ip, email, reason: "rate_limited" });
    return errorResponse("Too many attempts. Request a new code and try again.", 429);
  }

  return verifyWithCode(env, email, code, ip);
}

export async function onRequestGet(context) {
  return errorResponse(
    "Enter your verification code on the /verify/ page.",
    405
  );
}
