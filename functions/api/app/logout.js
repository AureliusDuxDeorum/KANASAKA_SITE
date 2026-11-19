// POST /api/app/logout -- sign this device out. Always answers 200: signing out of something already gone is not an error.
import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { bearerToken, deleteAppSession } from "../../lib/app-sessions.js";
import { logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  await deleteAppSession(env, bearerToken(request));
  await logAuthEvent(env, "logout", { method: "app" });
  return jsonResponse({ authenticated: false });
}
