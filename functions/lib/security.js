import { errorResponse, jsonResponse } from "./auth.js";

const DEFAULT_LIMITS = {
  loginIp: { limit: 15, windowSeconds: 900 },
  registerIp: { limit: 8, windowSeconds: 3600 },
  forgotIp: { limit: 10, windowSeconds: 3600 },
  forgotEmail: { limit: 3, windowSeconds: 3600 },
  resetIp: { limit: 10, windowSeconds: 3600 },
  verifyIp: { limit: 20, windowSeconds: 3600 },
  resendIp: { limit: 10, windowSeconds: 3600 },
  resendEmail: { limit: 3, windowSeconds: 3600 },
  passwordIp: { limit: 10, windowSeconds: 3600 },
};

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

export async function checkRateLimit(env, key, options = {}) {
  if (!env.DB) {
    return { allowed: true };
  }

  const limit = options.limit ?? 10;
  const windowSeconds = options.windowSeconds ?? 900;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    const row = await env.DB.prepare(
      "SELECT count, window_start FROM rate_limits WHERE key = ?"
    )
      .bind(key)
      .first();

    if (!row) {
      await env.DB.prepare(
        "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)"
      )
        .bind(key, nowIso)
        .run();
      return { allowed: true };
    }

    const windowStartMs = Date.parse(row.window_start);
    if (!Number.isFinite(windowStartMs) || now - windowStartMs >= windowSeconds * 1000) {
      await env.DB.prepare(
        "UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?"
      )
        .bind(nowIso, key)
        .run();
      return { allowed: true };
    }

    if (row.count >= limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((windowStartMs + windowSeconds * 1000 - now) / 1000)
      );
      return { allowed: false, retryAfter };
    }

    await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?")
      .bind(key)
      .run();
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export function rateLimitResponse(retryAfter) {
  const headers = {};
  if (retryAfter) {
    headers["Retry-After"] = String(retryAfter);
  }
  return jsonResponse(
    { error: "Too many attempts. Please try again later." },
    429,
    headers
  );
}

export async function enforceRateLimit(env, key, preset) {
  const config = DEFAULT_LIMITS[preset] || DEFAULT_LIMITS.loginIp;
  const result = await checkRateLimit(env, key, config);
  if (!result.allowed) {
    return rateLimitResponse(result.retryAfter);
  }
  return null;
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
