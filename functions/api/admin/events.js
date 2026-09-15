import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { requireAdminAccess, requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

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

  return jsonResponse({ events });
}
