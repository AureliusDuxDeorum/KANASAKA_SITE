import { errorResponse, jsonResponse } from "../../lib/auth.js";

// KS_C's installer downloads. Public and unauthenticated, like KS_Link's:
// anyone can download the app, and it asks for a KANASAKA account when it
// opens, not here.
//
// A catch-all route rather than literal "version.json.js" for the same reason
// as the KS_Link endpoint (a dotted filename never registers as a route).
//
// There is no self-updater manifest here: KS_C's own updater reads its signed
// releases from the release host (see KS_C1's docs/RELEASE.md). `version.json`
// only tells a page or a script which version the downloads below are.
// Published by scripts/publish-ks-c.mjs.
const PLATFORMS = {
  "windows-exe": { key: "installers/ks-c/windows-x86_64/KS_C.exe", filename: "KS_C-setup.exe" },
  "windows-msi": { key: "installers/ks-c/windows-x86_64/KS_C.msi", filename: "KS_C.msi" },
  "linux-deb": { key: "installers/ks-c/linux-deb/KS_C.deb", filename: "KS_C.deb" },
  "linux-rpm": { key: "installers/ks-c/linux-rpm/KS_C.rpm", filename: "KS_C.rpm" },
  "linux-appimage": { key: "installers/ks-c/linux-appimage/KS_C.AppImage", filename: "KS_C.AppImage" },
};

const VERSION_KEY = "installers/ks-c/version.json";

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = Array.isArray(params.catchall) ? params.catchall.join("/") : String(params.catchall || "");

  if (!env.INSTALLERS) {
    return errorResponse("Downloads are not configured.", 503);
  }

  if (slug === "version.json") {
    const object = await env.INSTALLERS.get(VERSION_KEY);
    if (!object) {
      return errorResponse("No release published yet.", 404);
    }
    let release;
    try {
      release = await object.json();
    } catch {
      return errorResponse("Release record is corrupt.", 500);
    }
    const downloads = {};
    for (const id of Object.keys(PLATFORMS)) {
      downloads[id] = new URL(`/api/ks-c/download/${id}`, request.url).toString();
    }
    return jsonResponse({
      version: release.version,
      notes: release.notes || "",
      pub_date: release.pub_date || null,
      downloads,
    });
  }

  if (slug.startsWith("download/")) {
    const config = PLATFORMS[slug.slice("download/".length)];
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
