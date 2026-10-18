import { errorResponse, jsonResponse } from "../../lib/auth.js";

// KS_Link's downloads AND self-updater both live here. Same
// catch-all-not-a-literal-dotted-filename reasoning as the retired
// k-updater endpoint this replaced — a file literally named
// "latest.json.js" never registers as a Pages Function route at all.
//
// Genuinely public, unauthenticated — KS_Link is a free app, not a paid
// product behind an entitlement check. Anyone should be able to download
// or self-update it without a kanasaka.com account.
//
// Only Windows self-updates through tauri-plugin-updater today (the
// `latest.json` manifest below). Linux and Android are plain downloads —
// Linux because a package manager (dpkg/rpm) or AppImage's own update
// mechanism is the more natural fit than this app reinventing it, Android
// because Tauri's desktop updater plugin doesn't target mobile at all.
// Published by scripts/publish-ks-link-update.mjs — see that script for
// the exact upload shape.
const PLATFORMS = {
  "windows-x86_64": { key: "installers/ks-link/windows-x86_64/KS_Link.exe", filename: "KS_Link-setup.exe" },
  "linux-deb": { key: "installers/ks-link/linux-deb/KS_Link.deb", filename: "KS_Link.deb" },
  "linux-rpm": { key: "installers/ks-link/linux-rpm/KS_Link.rpm", filename: "KS_Link.rpm" },
  "linux-appimage": { key: "installers/ks-link/linux-appimage/KS_Link.AppImage", filename: "KS_Link.AppImage" },
  android: { key: "installers/ks-link/android/KS_Link.apk", filename: "KS_Link.apk" },
};

const MANIFEST_KEY = "installers/ks-link/windows-x86_64/latest.json";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = Array.isArray(params.catchall) ? params.catchall.join("/") : String(params.catchall || "");

  if (!env.INSTALLERS) {
    return errorResponse("Updater is not configured.", 503);
  }

  if (slug === "latest.json") {
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

    // `platforms.*.url` isn't stored in R2 -- filled in here from the live
    // request so this object never needs re-uploading just because a
    // domain changed.
    const downloadUrl = new URL("/api/ks-link-updater/download/windows-x86_64", request.url).toString();
    for (const platform of Object.values(manifest.platforms || {})) {
      platform.url = downloadUrl;
    }

    return jsonResponse(manifest);
  }

  if (slug.startsWith("download/")) {
    const platformId = slug.slice("download/".length);
    const config = PLATFORMS[platformId];
    if (!config) {
      return errorResponse("Unknown platform.", 404);
    }

    const object = await env.INSTALLERS.get(config.key);
    if (!object) {
      return errorResponse("Installer not found in storage.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${config.filename}"`);
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(object.body, { status: 200, headers });
  }

  return errorResponse("Not found.", 404);
}
