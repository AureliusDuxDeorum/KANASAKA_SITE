import { installerConfig, openInstallerObject } from "../../lib/downloads.js";
import { errorResponse } from "../../lib/auth.js";
import { kRemoteLoginKeyAllowed, logAuthEvent } from "../../lib/security.js";

// K's own updater fetches this directly (no browser session -- it proves
// itself with the shared X-K-Remote-Login-Key header instead), so the APK
// stays gated the same way the SMS-2FA bypass is, rather than becoming a
// public download.
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!kRemoteLoginKeyAllowed(request, env)) {
    return errorResponse("Forbidden.", 403);
  }

  const config = installerConfig("android");
  const object = await openInstallerObject(env, config);
  if (!object) {
    return errorResponse("Installer not found in storage.", 404);
  }

  await logAuthEvent(env, "k_updater_apk_served", {});

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", config.contentType);
  headers.set("Content-Disposition", 'attachment; filename="' + config.filename + '"');
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, { status: 200, headers });
}
