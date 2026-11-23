#!/usr/bin/env node
// Uploads a film to R2 for functions/api/media/[[catchall]].js to serve at
// /api/media/<name>. Manual, developer-run, like the installer scripts.
//
// Usage:
//   node scripts/publish-video.mjs <name.mp4> <path-to-file>
//
// <name> is lowercase letters, digits and dashes, ending in .mp4 or .webm. The
// file should have its moov atom first (ffmpeg -movflags +faststart) so it
// starts playing before it has downloaded.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bucket = "kanasaka-installers";
const [, , name, filePath] = process.argv;

if (!name || !filePath || !/^[a-z0-9][a-z0-9-]{0,63}\.(mp4|webm)$/.test(name)) {
  console.error("Usage: node scripts/publish-video.mjs <name.mp4|name.webm> <path-to-file>");
  console.error("name: lowercase letters, digits and dashes only.");
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(`[r2] File not found: ${filePath}`);
  process.exit(1);
}

const type = name.endsWith(".webm") ? "video/webm" : "video/mp4";
console.log(`[r2] Uploading ${name} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`);
execSync(`npx wrangler r2 object put ${bucket}/media/videos/${name} --file=${JSON.stringify(filePath)} --content-type=${type} --remote`, { stdio: "inherit", cwd: repoRoot });
console.log(`[r2] Done. https://kanasaka.com/api/media/${name} now serves this file.`);
