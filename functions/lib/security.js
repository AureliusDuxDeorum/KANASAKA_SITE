import { errorResponse, jsonResponse } from "./auth.js";

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
