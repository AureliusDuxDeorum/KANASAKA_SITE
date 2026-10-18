import { errorResponse, jsonResponse } from "../../lib/auth.js";

// KS_Link's self-updater (tauri-plugin-updater, client/src-tauri/tauri.conf.json's
// `plugins.updater.endpoints`) checks this. Same catch-all-not-a-literal-dotted-
// filename reasoning as functions/api/k-updater/[[catchall]].js — a file literally
// named "latest.json.js" never registers as a Pages Function route at all.
//
// Unlike k-updater (gated behind the private K-remote-login key, since K's mobile
// updater isn't a public download) this is a genuinely public, unauthenticated
// endpoint — KS_Link is a free app, not a paid product behind an entitlement check
// the way KS_Unify's installers in lib/downloads.js are. Anyone running KS_Link
// should be able to self-update without having a kanasaka.com account at all.
//
// Published by scripts/publish-ks-link-update.mjs, which uploads the installer,
// its Tauri-generated .sig signature, and this manifest together — see that
// script for the exact shape. The manifest stored in R2 has everything except
// `platforms.*.url`, which is filled in below from the live request so it always
// points at this deploy's own origin, matching k-updater's same trick.
const MANIFEST_KEY = "installers/ks-link/windows-x86_64/latest.json";
const INSTALLER_KEY = "installers/ks-link/windows-x86_64/KS_Link.exe";
const INSTALLER_FILENAME = "KS_Link-setup.exe";

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

    const downloadUrl = new URL("/api/ks-link-updater/download", request.url).toString();
    for (const platform of Object.values(manifest.platforms || {})) {
      platform.url = downloadUrl;
    }

    return jsonResponse(manifest);
  }

  if (slug === "download") {
    const object = await env.INSTALLERS.get(INSTALLER_KEY);
    if (!object) {
      return errorResponse("Installer not found in storage.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${INSTALLER_FILENAME}"`);
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(object.body, { status: 200, headers });
  }

  return errorResponse("Not found.", 404);
}
