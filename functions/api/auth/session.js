import { jsonResponse, resolveSession, sessionPayload } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({ authenticated: false, configured: false });
  }

  const { user, sessionHeaders } = await resolveSession(request, env);

  if (!user) {
    return jsonResponse({ authenticated: false, configured: true }, 200, sessionHeaders);
  }

  return jsonResponse(
    {
      ...sessionPayload(user),
      configured: true,
    },
    200,
    sessionHeaders
  );
}
