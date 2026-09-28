import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { kRemoteLoginKeyAllowed } from "../../lib/security.js";

// A plain file named literally "latest.json.js" doesn't register as a Pages
// Function route at all (silently falls through to the index.html SPA
// fallback instead of ever reaching this code) -- Pages' file-based router
// doesn't split routes on an internal dot the way e.g. Next.js does. A
// catch-all sidesteps that entirely: it matches any sub-path as a literal
// runtime string, so the external URL can still be exactly
// /api/k-updater/latest.json. Cloudflare Pages always prefers an exact
// static route (apk.js -> /api/k-updater/apk) over this catch-all when
// both could match, so the two coexist fine in the same directory.
//
// Written by scripts/upload-installers-r2.mjs alongside the APK itself --
// see that script for the {version, versionCode, pubDate, size, sha256}
// shape. `url` isn't stored in it; it's filled in below from the live
// request so it always points at this deploy's own origin.
const MANIFEST_KEY = "installers/ks-k-mobile/android/latest.json";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = Array.isArray(params.catchall) ? params.catchall.join("/") : String(params.catchall || "");

  if (slug !== "latest.json") {
    return errorResponse("Not found.", 404);
  }

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
