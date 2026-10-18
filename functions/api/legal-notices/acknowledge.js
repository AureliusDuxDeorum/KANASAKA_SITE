import { errorResponse, jsonResponse, readJson, resolveSession } from "../../lib/auth.js";
import { acknowledgeLegalNotice } from "../../lib/legal-notices.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user } = await resolveSession(request, env);
  if (!user) {
    return errorResponse("Not signed in.", 401);
  }

  const body = await readJson(request);
  const noticeType = body && String(body.noticeType || "").trim();
  const version = body && String(body.version || "").trim();
  if (!noticeType || !version) {
    return errorResponse("Invalid request body.");
  }

  await acknowledgeLegalNotice(env, user.id, noticeType, version);

  return jsonResponse({ ok: true });
}
