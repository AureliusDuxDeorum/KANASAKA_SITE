import {
  clearSessionCookieHeader,
  deleteSession,
  errorResponse,
  jsonResponse,
  parseCookies,
  SESSION_COOKIE,
} from "../../lib/auth.js";
import { logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  await deleteSession(env, token);
  await logAuthEvent(env, "logout", {});

  return jsonResponse(
    { authenticated: false },
    200,
    {
      "Set-Cookie": clearSessionCookieHeader(),
    }
  );
}
