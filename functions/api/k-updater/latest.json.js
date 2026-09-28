import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { kRemoteLoginKeyAllowed } from "../../lib/security.js";

// Written by scripts/upload-installers-r2.mjs alongside the APK itself --
// see that script for the {version, versionCode, pubDate, size, sha256}
// shape. `url` isn't stored in it; it's filled in below from the live
// request so it always points at this deploy's own origin.
const MANIFEST_KEY = "installers/ks-k-mobile/android/latest.json";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!kRemoteLoginKeyAllowed(request, env)) {
    return errorResponse("Forbidden.", 403);
  }

  if (!env.INSTALLERS) {
    return errorResponse("Updater is not configured.", 503);
  }

  const object = await env.INSTALLERS.get(MANIFEST_KEY);
  if (!object) {
    return errorResponse("No update manifest published yet.", 404);
  }

  let manifest;
  try {
    manifest = await object.json();
  } catch {
    return errorResponse("Update manifest is corrupt.", 500);
  }

  manifest.url = new URL("/api/k-updater/apk", request.url).toString();

  return jsonResponse(manifest);
}
