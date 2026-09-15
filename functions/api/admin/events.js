import { errorResponse, jsonResponse } from "../../lib/auth.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const actor = adminActorLabel(user);
  const ip = clientIp(request);

  if (await throttleAdminAction(env, "admin_events_viewed", actor, { max: 60, windowMinutes: 10 })) {
    return errorResponse("Too many requests. Try again later.", 429);
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 25;

  let events = [];
  try {
    const result = await env.DB.prepare(
      "SELECT id, event_type, meta, created_at FROM auth_events ORDER BY id DESC LIMIT ?"
    )
      .bind(limit)
      .all();
    events = result.results || [];
  } catch (err) {
    return errorResponse("Could not read events: " + (err.message || "unknown error"), 500);
  }

  await logAuthEvent(env, "admin_events_viewed", { ip, email: actor, limit });

  return jsonResponse({ events });
}
