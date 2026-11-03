import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { collectStatus } from "../../lib/diagnostics.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  purgeOldEvents,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

async function readBuildInfo(env, request) {
  try {
    const url = new URL("/assets/site-meta.json", request.url);
    const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

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

  if (await throttleAdminAction(env, "admin_diagnostics_viewed", actor, { max: 30, windowMinutes: 10 })) {
    return errorResponse("Too many requests. Try again later.", 429);
  }

  // Housekeeping rides along with this admin-only read (no cron trigger here).
  await purgeOldEvents(env);
  await logAuthEvent(env, "admin_diagnostics_viewed", { ip: clientIp(request), email: actor });

  const build = await readBuildInfo(env, request);
  return jsonResponse(await collectStatus(env, { build }));
}
