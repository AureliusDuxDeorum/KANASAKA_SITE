import {
  openInstallerObject,
  verifySignedDownloadToken,
} from "../../lib/downloads.js";
import { errorResponse } from "../../lib/auth.js";
import { logAuthEvent } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = new URL(request.url).searchParams.get("token");

  if (!env.DB) {
    return errorResponse("Download service is not configured.", 503);
  }

  const grant = await verifySignedDownloadToken(env, token);
  if (!grant) {
    return errorResponse("Download link is invalid or expired.", 403);
  }

  const object = await openInstallerObject(env, grant.config);
  if (!object) {
    return errorResponse("Installer not found in storage.", 404);
  }

  await logAuthEvent(env, "download_served", {
    userId: grant.userId,
    platform: grant.platform,
  });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", grant.config.contentType);
  headers.set(
    "Content-Disposition",
    'attachment; filename="' + grant.config.filename + '"'
  );
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, { status: 200, headers });
}
