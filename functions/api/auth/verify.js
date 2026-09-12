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
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

const CODE_RE = /^[0-9]{6}$/;
// Codes have far less entropy than the old 32-byte link token (1 in a
// million vs. effectively unguessable), so unlike the old flow this one
// needs a basic brute-force throttle. Best-effort: reuses the existing
// auth_events log rather than a new table/column, and never blocks a
// legitimate attempt if the check itself fails for any reason.
const MAX_RECENT_FAILURES = 8;
const FAILURE_WINDOW_MINUTES = 15;

async function tooManyRecentFailures(env, email) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM auth_events
       WHERE event_type = 'verify_failed'
         AND json_extract(meta, '$.email') = ?
         AND created_at > datetime('now', ?)`
    )
      .bind(email, `-${FAILURE_WINDOW_MINUTES} minutes`)
      .first();
    return Boolean(row && Number(row.c) >= MAX_RECENT_FAILURES);
  } catch {
    return false;
  }
}

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

  if (await tooManyRecentFailures(env, email)) {
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
