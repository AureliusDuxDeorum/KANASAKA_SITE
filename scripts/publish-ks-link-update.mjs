#!/usr/bin/env node
// Publishes a KS_Link Windows release to R2 for the self-updater
// (functions/api/ks-link-updater/[[catchall]].js) to serve. Manual,
// developer-run — same "never a public write endpoint" philosophy as
// scripts/upload-installers-r2.mjs and KS_Link's own
// relay/scripts/publish-plugin.mjs.
//
// Usage:
//   node scripts/publish-ks-link-update.mjs <path-to-installer.exe> [notes]
//
// Expects a `<installer>.sig` file next to the installer — `tauri build`
// generates this automatically when TAURI_SIGNING_PRIVATE_KEY (and
// optionally TAURI_SIGNING_PRIVATE_KEY_PASSWORD) are set at build time.
// The version is read from the installer's own filename
// (KS_Link_<version>_x64-setup.exe, Tauri's own NSIS naming convention) —
// not re-typed by hand, so a publish can't accidentally tag the wrong
// version.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bucket = "kanasaka-installers";

const [, , installerPath, notes] = process.argv;

if (!installerPath) {
  console.error("Usage: node scripts/publish-ks-link-update.mjs <path-to-installer.exe> [notes]");
  process.exit(1);
}

if (!fs.existsSync(installerPath)) {
  console.error(`[r2] Installer not found: ${installerPath}`);
  process.exit(1);
}

const sigPath = `${installerPath}.sig`;
if (!fs.existsSync(sigPath)) {
  console.error(`[r2] Signature not found: ${sigPath}`);
  console.error("[r2] Build with TAURI_SIGNING_PRIVATE_KEY set so `tauri build` generates one automatically.");
  process.exit(1);
}

const versionMatch = path.basename(installerPath).match(/_([0-9]+\.[0-9]+\.[0-9]+)_/);
if (!versionMatch) {
  console.error(`[r2] Couldn't parse a version out of the installer filename: ${path.basename(installerPath)}`);
  process.exit(1);
}
const version = versionMatch[1];
const signature = fs.readFileSync(sigPath, "utf8").trim();

function runRemote(command) {
  execSync(`${command} --remote`, { stdio: "inherit", cwd: repoRoot });
}

const manifest = {
  version,
  notes: notes || "",
  pub_date: new Date().toISOString(),
  // `platforms.*.url` is deliberately left out here — the endpoint fills
  // it in from the live request origin at serve time, same trick
  // functions/api/k-updater/[[catchall]].js already uses for its own
  // manifest, so this R2 object never needs re-uploading just because a
  // domain changed.
  platforms: {
    "windows-x86_64": { signature },
  },
};

console.log(`[r2] Uploading installer (${(fs.statSync(installerPath).size / 1024 / 1024).toFixed(1)} MB)...`);
runRemote(
  `npx wrangler r2 object put ${bucket}/installers/ks-link/windows-x86_64/KS_Link.exe --file=${JSON.stringify(installerPath)} --content-type=application/octet-stream`
);

const tmpPath = path.join(os.tmpdir(), "ks-link-updater-latest.json");
fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2));
console.log(`[r2] Publishing updater manifest: ${manifest.version}`);
runRemote(
  `npx wrangler r2 object put ${bucket}/installers/ks-link/windows-x86_64/latest.json --file=${JSON.stringify(tmpPath)} --content-type=application/json`
);
fs.unlinkSync(tmpPath);

console.log(`[r2] Done. KS_Link ${version} is now what https://kanasaka.com/api/ks-link-updater/latest.json serves.`);
