import { errorResponse, jsonResponse } from "./auth.js";
import { sendLoginNotificationEmail } from "./email.js";

export function clientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp.trim();

  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}

export function allowedSiteOrigin(env) {
  const siteUrl = env.SITE_URL || "https://kanasaka.com";
  try {
    return new URL(siteUrl).origin;
  } catch {
    return "https://kanasaka.com";
  }
}

export function assertSameOrigin(request, env) {
  const allowed = allowedSiteOrigin(env);
  const origin = request.headers.get("Origin");
  if (origin && origin !== allowed) {
    return false;
  }

  const referer = request.headers.get("Referer");
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== allowed) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

export function requireSameOrigin(request, env) {
  if (assertSameOrigin(request, env)) {
    return null;
  }
  return errorResponse("Forbidden.", 403);
}

export async function logAuthEvent(env, eventType, meta = {}) {
  if (!env.DB) return;

  try {
    await env.DB.prepare("INSERT INTO auth_events (event_type, meta) VALUES (?, ?)")
      .bind(eventType, JSON.stringify(meta))
      .run();
  } catch {
    // Migration may not be applied yet.
  }
}

// Best-effort brute-force throttle for low-entropy codes (email verification,
// password reset). Reuses the existing auth_events log rather than a new
// table/column. Fails open -- a throttle-check error never blocks a
// legitimate attempt, it just skips the rate limit for that request.
export async function tooManyRecentFailures(env, eventType, email, options = {}) {
  const maxFailures = options.max || 8;
  const windowMinutes = options.windowMinutes || 15;

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM auth_events
       WHERE event_type = ?
         AND json_extract(meta, '$.email') = ?
         AND created_at > datetime('now', ?)`
    )
      .bind(eventType, email, `-${windowMinutes} minutes`)
      .first();
    return Boolean(row && Number(row.c) >= maxFailures);
  } catch {
    return false;
  }
}

// Login notifications always go out for a successful sign-in (rare, and the
// most important one to never miss), but failure/blocked notifications are
// throttled to at most one per account per window -- otherwise a password-
// guessing burst against a known email floods that person's inbox with one
// email per attempt instead of one alert that it's happening.
const LOGIN_NOTIFICATION_THROTTLE_MINUTES = 10;

export async function notifyLogin(env, email, details) {
  if (!details.success) {
    const alreadyNotified = await tooManyRecentFailures(
      env,
      "login_notification_sent",
      email,
      { max: 1, windowMinutes: LOGIN_NOTIFICATION_THROTTLE_MINUTES }
    );
    if (alreadyNotified) return;
  }

  try {
    await sendLoginNotificationEmail(env, email, details);
    await logAuthEvent(env, "login_notification_sent", { email });
  } catch (err) {
    console.error("Login notification email failed:", err);
  }
}

export function requireAdmin(request, env) {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    return errorResponse("Not found.", 404);
  }

  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== secret) {
    return errorResponse("Forbidden.", 403);
  }

  return null;
}
