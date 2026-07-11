import { CONTACT_INFO, errorResponse, getSessionUser, jsonResponse } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Authentication required.", 401);
  }

  return jsonResponse(CONTACT_INFO);
}
