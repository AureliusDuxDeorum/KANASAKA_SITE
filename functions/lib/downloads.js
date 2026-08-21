import { generateRawToken, hashSecret } from "./tokens.js";
import { ksStocksEntitlementFromUser } from "./ks-stocks-access.js";

export const INSTALLER_OBJECTS = {
  windows: {
    key: "installers/windows/KS.Unify_0.1.0_x64-setup.exe",
    filename: "KS.Unify_0.1.0_x64-setup.exe",
    contentType: "application/octet-stream",
  },
  linux: {
    key: "installers/linux/KS.Unify_0.1.0_amd64.deb",
    filename: "KS.Unify_0.1.0_amd64.deb",
    contentType: "application/vnd.debian.binary-package",
  },
  macos: {
    key: "installers/macos/KS.Unify_0.1.0_aarch64.dmg",
    filename: "KS.Unify_0.1.0_aarch64.dmg",
    contentType: "application/x-apple-diskimage",
  },
  android: {
    key: "installers/ks-k-mobile/android/app-debug.apk",
    filename: "app-debug.apk",
    contentType: "application/vnd.android.package-archive",
    requiredAccountId: "ks_dev",
  },
};

const DEFAULT_TTL_SECONDS = 300;

function base64UrlEncode(text) {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

export function installerConfig(platform) {
  return INSTALLER_OBJECTS[String(platform || "").toLowerCase()] || null;
}

export function canAccessInstaller(user, config) {
  return !downloadAccessDenialReason(user, config);
}

export function downloadAccessDenialReason(user, config) {
  if (!user) {
    return "Authentication required.";
  }

  const entitlement = ksStocksEntitlementFromUser(user);
  if (!entitlement.ksStocksEntitled) {
    return "KS_Package subscription required.";
  }

  if (!config || !config.requiredAccountId) {
    return null;
  }

  if (
    String(user.account_id || "").toLowerCase() !==
    String(config.requiredAccountId).toLowerCase()
  ) {
    return "Access denied.";
  }

  return null;
}

export async function createSignedDownloadToken(env, userId, platform, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const config = installerConfig(platform);
  if (!config) {
    throw new Error("Unknown platform.");
  }

  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = {
    uid: Math.trunc(Number(userId)),
    platform: String(platform).toLowerCase(),
    exp: expiresAt,
    nonce: generateRawToken(12),
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hashSecret("download:" + encoded, env);
  return encoded + "." + signature;
}

export async function verifySignedDownloadToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return null;
  }

  const expected = await hashSecret("download:" + parts[0], env);
  if (expected !== parts[1]) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    return null;
  }

  if (!payload || !payload.uid || !payload.platform || !payload.exp) {
    return null;
  }

  if (Date.now() > Number(payload.exp)) {
    return null;
  }

  const config = installerConfig(payload.platform);
  if (!config) {
    return null;
  }

  return {
    userId: Math.trunc(Number(payload.uid)),
    platform: payload.platform,
    config,
    expiresAt: Number(payload.exp),
  };
}

export async function openInstallerObject(env, config) {
  if (!env.INSTALLERS) {
    return null;
  }

  return env.INSTALLERS.get(config.key);
}

export function installersConfigured(env) {
  return Boolean(env.INSTALLERS);
}

export function signedDownloadUrl(request, token) {
  const url = new URL("/api/download/file", request.url);
  url.searchParams.set("token", token);
  return url.toString();
}
