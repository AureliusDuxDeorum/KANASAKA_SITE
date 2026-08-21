import {
  canAccessInstaller,
  createSignedDownloadToken,
  downloadAccessDenialReason,
  installerConfig,
  installersConfigured,
  signedDownloadUrl,
} from "../../lib/downloads.js";
import { errorResponse, getSessionUser } from "../../lib/auth.js";
import { clientIp, logAuthEvent } from "../../lib/security.js";

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

  const config = installerConfig(platform);
  if (!config) {
    return errorResponse("Unknown platform.", 404);
  }

  if (!canAccessInstaller(user, config)) {
    return errorResponse(downloadAccessDenialReason(user, config) || "Access denied.", 403);
  }

  if (!installersConfigured(env)) {
    return errorResponse(
      "Private downloads are not configured yet. Bind the INSTALLERS R2 bucket in Cloudflare Pages.",
      503
    );
  }

  try {
    const token = await createSignedDownloadToken(env, user.id, platform);
    await logAuthEvent(env, "download_issued", {
      ip: clientIp(request),
      userId: user.id,
      platform,
    });

    return Response.redirect(signedDownloadUrl(request, token), 302);
  } catch (err) {
    return errorResponse(err.message || "Could not create download link.", 500);
  }
}
