#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
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
      "/home/prometheus/Desktop/Projects/K_0.2/mobile/android/app/build/outputs/apk/debug/app-debug.apk",
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
}

console.log("[r2] Done. Bind INSTALLERS -> kanasaka-installers in Cloudflare Pages production settings.");
