import { getSessionUser, jsonResponse, sessionPayload } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({ authenticated: false, configured: false });
  }

  const user = await getSessionUser(request, env);

  if (!user) {
    return jsonResponse({ authenticated: false, configured: true });
  }

  return jsonResponse({
    ...sessionPayload(user),
    configured: true,
  });
}
