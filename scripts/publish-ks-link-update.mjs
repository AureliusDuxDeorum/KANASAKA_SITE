#!/usr/bin/env node
// Publishes a KS_Link release artifact to R2 for
// functions/api/ks-link-updater/[[catchall]].js to serve. Manual,
// developer-run — same "never a public write endpoint" philosophy as this
// repo's other installer-publishing scripts and KS_Link's own
// relay/scripts/publish-plugin.mjs.
//
// Usage:
//   node scripts/publish-ks-link-update.mjs <platform> <path-to-file> [notes]
//
// platform is one of: windows-x86_64, linux-deb, linux-rpm,
// linux-appimage, android
//
// Only windows-x86_64 drives the self-updater manifest (and needs a
// `<file>.sig` next to it — `tauri build` generates this automatically
// when TAURI_SIGNING_PRIVATE_KEY is set at build time). The others are
// plain downloads; no .sig, no manifest entry. The version is read from
// the windows-x86_64 installer's own filename
// (KS_Link_<version>_x64-setup.exe, Tauri's NSIS naming convention) when
// publishing that platform — not re-typed by hand.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bucket = "kanasaka-installers";

const PLATFORM_KEYS = {
  "windows-x86_64": "installers/ks-link/windows-x86_64/KS_Link.exe",
  "linux-deb": "installers/ks-link/linux-deb/KS_Link.deb",
  "linux-rpm": "installers/ks-link/linux-rpm/KS_Link.rpm",
  "linux-appimage": "installers/ks-link/linux-appimage/KS_Link.AppImage",
  android: "installers/ks-link/android/KS_Link.apk",
};

const [, , platform, filePath, notes] = process.argv;

if (!platform || !filePath) {
  console.error("Usage: node scripts/publish-ks-link-update.mjs <platform> <path-to-file> [notes]");
  console.error(`platform must be one of: ${Object.keys(PLATFORM_KEYS).join(", ")}`);
  process.exit(1);
}

const remoteKey = PLATFORM_KEYS[platform];
if (!remoteKey) {
  console.error(`Unknown platform "${platform}". Must be one of: ${Object.keys(PLATFORM_KEYS).join(", ")}`);
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`[r2] File not found: ${filePath}`);
  process.exit(1);
}

function runRemote(command) {
  execSync(`${command} --remote`, { stdio: "inherit", cwd: repoRoot });
}

console.log(`[r2] Uploading ${platform} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);
runRemote(`npx wrangler r2 object put ${bucket}/${remoteKey} --file=${JSON.stringify(filePath)} --content-type=application/octet-stream`);

if (platform === "windows-x86_64") {
  const sigPath = `${filePath}.sig`;
  if (!fs.existsSync(sigPath)) {
    console.error(`[r2] Signature not found: ${sigPath}`);
    console.error("[r2] Build with TAURI_SIGNING_PRIVATE_KEY set so `tauri build` generates one automatically.");
    console.error("[r2] The installer uploaded above, but no updater manifest was published — self-update won't see this release.");
    process.exit(1);
  }

  const versionMatch = path.basename(filePath).match(/_([0-9]+\.[0-9]+\.[0-9]+)_/);
  if (!versionMatch) {
    console.error(`[r2] Couldn't parse a version out of the installer filename: ${path.basename(filePath)}`);
    process.exit(1);
  }
  const version = versionMatch[1];
  const signature = fs.readFileSync(sigPath, "utf8").trim();

  const manifest = {
    version,
    notes: notes || "",
    pub_date: new Date().toISOString(),
    // `platforms.*.url` is deliberately left out — the endpoint fills it
    // in from the live request origin at serve time.
    platforms: {
      "windows-x86_64": { signature },
    },
  };

  const tmpPath = path.join(os.tmpdir(), "ks-link-updater-latest.json");
  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2));
  console.log(`[r2] Publishing updater manifest: ${manifest.version}`);
  runRemote(
    `npx wrangler r2 object put ${bucket}/installers/ks-link/windows-x86_64/latest.json --file=${JSON.stringify(tmpPath)} --content-type=application/json`
  );
  fs.unlinkSync(tmpPath);
}

console.log(`[r2] Done. https://kanasaka.com/api/ks-link-updater/download/${platform} now serves this file.`);
