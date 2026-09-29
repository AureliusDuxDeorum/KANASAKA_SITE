import { errorResponse } from "../../lib/auth.js";
import { kRemoteLoginKeyAllowed, logAuthEvent } from "../../lib/security.js";

// TEMPORARY -- a throwaway diagnostic APK (bisecting a mobile crash-on-open
// bug), served separately from the real update channel (apk.js /
// latest.json) so it can never end up on the update feed itself. Same auth
// gate as the real updater endpoints. Delete this file once the crash is
// found; not meant to be a permanent second download.
const DIAGNOSTIC_KEY = "installers/ks-k-mobile/android/diagnostic.apk";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!kRemoteLoginKeyAllowed(request, env)) {
    return errorResponse("Forbidden.", 403);
  }

  if (!env.INSTALLERS) {
    return errorResponse("Updater is not configured.", 503);
  }

  const object = await env.INSTALLERS.get(DIAGNOSTIC_KEY);
  if (!object) {
    return errorResponse("No diagnostic build published.", 404);
  }

  await logAuthEvent(env, "k_updater_diagnostic_apk_served", {});

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="k-mobile-diagnostic.apk"');
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, { status: 200, headers });
}
