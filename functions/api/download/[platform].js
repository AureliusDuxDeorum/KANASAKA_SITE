import { DOWNLOAD_URLS, errorResponse, getSessionUser } from "../../lib/auth.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const platform = String(params.platform || "").toLowerCase();

  if (!env.DB) {
    return errorResponse("Download service is not configured.", 503);
  }

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Authentication required.", 401);
  }

  const url = DOWNLOAD_URLS[platform];
  if (!url) {
    return errorResponse("Unknown platform.", 404);
  }

  return Response.redirect(url, 302);
}
