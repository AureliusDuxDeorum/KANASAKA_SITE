#!/usr/bin/env node
// Publishes a KS_C installer to R2 for functions/api/ks-c/[[catchall]].js to
// serve. Manual, developer-run, like publish-ks-link-update.mjs: never a public
// write endpoint.
//
// Usage:
//   node scripts/publish-ks-c.mjs <platform> <path-to-file> [version] [notes]
//
// platform is one of: windows-exe, windows-msi, linux-deb, linux-rpm,
// linux-appimage
//
// Give the version (for example 1.0.0) on the last platform of a release: it
// writes installers/ks-c/version.json, which /api/ks-c/version.json serves.
// There is no updater manifest: KS_C's own signed updates come from its release
// host, these are the plain downloads on /downloads/.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bucket = "kanasaka-installers";

const PLATFORM_KEYS = {
  "windows-exe": "installers/ks-c/windows-x86_64/KS_C.exe",
  "windows-msi": "installers/ks-c/windows-x86_64/KS_C.msi",
  "linux-deb": "installers/ks-c/linux-deb/KS_C.deb",
  "linux-rpm": "installers/ks-c/linux-rpm/KS_C.rpm",
  "linux-appimage": "installers/ks-c/linux-appimage/KS_C.AppImage",
};

const [, , platform, filePath, version, notes] = process.argv;

if (!platform || !filePath) {
  console.error("Usage: node scripts/publish-ks-c.mjs <platform> <path-to-file> [version] [notes]");
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

if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[r2] Version must look like 1.2.3, got "${version}"`);
  process.exit(1);
}

function runRemote(command) {
  execSync(`${command} --remote`, { stdio: "inherit", cwd: repoRoot });
}

console.log(`[r2] Uploading ${platform} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);
runRemote(`npx wrangler r2 object put ${bucket}/${remoteKey} --file=${JSON.stringify(filePath)} --content-type=application/octet-stream`);

if (version) {
  const record = { version, notes: notes || "", pub_date: new Date().toISOString() };
  const tmpPath = path.join(os.tmpdir(), "ks-c-version.json");
  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2));
  console.log(`[r2] Publishing release record: ${version}`);
  runRemote(`npx wrangler r2 object put ${bucket}/installers/ks-c/version.json --file=${JSON.stringify(tmpPath)} --content-type=application/json`);
  fs.unlinkSync(tmpPath);
}

console.log(`[r2] Done. https://kanasaka.com/api/ks-c/download/${platform} now serves this file.`);
