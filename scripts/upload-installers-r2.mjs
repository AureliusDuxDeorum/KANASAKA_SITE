#!/usr/bin/env node
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bucket = "kanasaka-installers";

const uploads = [
  {
    platform: "windows",
    local: process.env.KS_UNIFY_WINDOWS_INSTALLER,
    remote: "installers/windows/KS.Unify_0.1.0_x64-setup.exe",
    defaultLocal:
      "/home/prometheus/Desktop/Projects/KS_UNIFY-0.1.0/release/KS.Unify_0.1.0_x64-setup.exe",
  },
  {
    platform: "linux",
    local: process.env.KS_UNIFY_LINUX_INSTALLER,
    remote: "installers/linux/KS.Unify_0.1.0_amd64.deb",
    defaultLocal:
      "/home/prometheus/Desktop/Projects/KS_UNIFY-0.1.0/release/KS.Unify_0.1.0_amd64.deb",
  },
  {
    platform: "macos",
    local: process.env.KS_UNIFY_MACOS_INSTALLER,
    remote: "installers/macos/KS.Unify_0.1.0_aarch64.dmg",
    defaultLocal: "",
  },
  {
    platform: "android",
    local: process.env.KS_K_MOBILE_ANDROID_APK,
    remote: "installers/ks-k-mobile/android/app-debug.apk",
    defaultLocal:
      "/home/prometheus/Desktop/Projects/K_V0.4/mobile/android/app/build/outputs/apk/debug/app-debug.apk",
  },
];

function run(command) {
  execSync(command, { stdio: "inherit", cwd: repoRoot });
}

function runRemote(command) {
  execSync(command + " --remote", { stdio: "inherit", cwd: repoRoot });
}

function resolveLocal(entry) {
  const candidate = entry.local || entry.defaultLocal;
  if (!candidate) {
    return null;
  }
  return fs.existsSync(candidate) ? candidate : null;
}

// K's updater (functions/api/k-updater/latest.json.js) reads this object
// straight from R2 and only fills in `url` at request time -- everything
// else here is exactly what gets served.
function publishAndroidUpdaterManifest(apkPath) {
  const metadataPath = path.join(path.dirname(apkPath), "output-metadata.json");
  let versionName = "0.0.0";
  let versionCode = 0;
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    const element = metadata.elements && metadata.elements[0];
    if (element) {
      versionName = String(element.versionName || versionName);
      versionCode = Number(element.versionCode || versionCode);
    }
  } catch {
    console.warn(`[r2] Could not read ${metadataPath} -- manifest version will be a placeholder.`);
  }

  const bytes = fs.readFileSync(apkPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const manifest = {
    version: versionName,
    versionCode,
    pubDate: new Date().toISOString(),
    size: bytes.length,
    sha256,
  };

  const tmpPath = path.join(os.tmpdir(), "k-updater-latest.json");
  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2));
  console.log(`[r2] Publishing updater manifest: ${manifest.version} (code ${manifest.versionCode})`);
  runRemote(
    `npx wrangler r2 object put ${bucket}/installers/ks-k-mobile/android/latest.json --file=${JSON.stringify(tmpPath)} --content-type=application/json`
  );
  fs.unlinkSync(tmpPath);
}

console.log("[r2] Ensuring bucket exists:", bucket);
try {
  runRemote(`npx wrangler r2 bucket create ${bucket}`);
} catch {
  console.log("[r2] Bucket create skipped (already exists or R2 not enabled in dashboard).");
}

for (const entry of uploads) {
  const localPath = resolveLocal(entry);
  if (!localPath) {
    console.warn(`[r2] Skipping ${entry.platform}: file not found.`);
    continue;
  }

  console.log(`[r2] Uploading ${entry.platform} -> ${entry.remote}`);
  runRemote(`npx wrangler r2 object put ${bucket}/${entry.remote} --file=${JSON.stringify(localPath)}`);

  if (entry.platform === "android") {
    publishAndroidUpdaterManifest(localPath);
  }
}

console.log("[r2] Done. Bind INSTALLERS -> kanasaka-installers in Cloudflare Pages production settings.");
