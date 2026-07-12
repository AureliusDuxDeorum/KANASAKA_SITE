import {
  hashPasswordArgon2,
  isArgon2Hash,
  verifyPasswordArgon2,
} from "./argon2.js";
import { generateRawToken, hashSecret } from "./tokens.js";

export const SESSION_COOKIE = "__Host-kanasaka_session";
export const SESSION_DAYS = 30;
export const SESSION_ROTATE_HOURS = 24;
export const VERIFY_TOKEN_HOURS = 24;
export const RESET_TOKEN_HOURS = 1;

export const DOWNLOAD_URLS = {
  windows:
    "https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_x64-setup.exe",
  linux:
    "https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_amd64.deb",
  macos:
    "https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_aarch64.dmg",
};

export const DOWNLOAD_META = {
  windows: {
    label: "Windows",
    title: "x64 Installer",
    file: "KS.Unify_0.1.0_x64-setup.exe",
    size: "~21 MB",
    detail: "Windows 10/11 · 64-bit",
  },
  macos: {
    label: "macOS",
    title: "Apple Silicon",
    file: "KS.Unify_0.1.0_aarch64.dmg",
    size: "~23 MB",
    detail: "M1 / M2 / M3 · macOS 11+",
  },
  linux: {
    label: "Linux",
    title: "Debian Package",
    file: "KS.Unify_0.1.0_amd64.deb",
    size: "~31 MB",
    detail: "Ubuntu / Debian · amd64",
  },
};

export const CONTACT_INFO = {
  email: "contact@kanasaka.com",
  phone: "+49 01522 3693645",
  phoneHref: "tel:+4915223693645",
  hours: "Available 2:00–6:00 PM on business days only.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const LOGIN_FAILURE_MESSAGE = "Invalid email or password.";
export const REGISTER_SUCCESS_MESSAGE =
  "If this email can be used, check your inbox to confirm your account before signing in.";

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...headers,
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};

  header.split(";").forEach(function (part) {
    const trimmed = part.trim();
    if (!trimmed) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email) && email.length <= 254;
}

export function passwordValidationError(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export function validatePassword(password) {
  return passwordValidationError(password) === null;
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function parsePasswordHash(stored) {
  const parts = stored.split(":");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    return {
      iterations: Number(parts[1]),
      salt: base64ToBytes(parts[2]),
      expected: base64ToBytes(parts[3]),
    };
  }

  if (parts.length === 3 && parts[0] === "pbkdf2") {
    return {
      iterations: 210000,
      salt: base64ToBytes(parts[1]),
      expected: base64ToBytes(parts[2]),
    };
  }

  return null;
}

async function derivePasswordHashPbkdf2(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return new Uint8Array(hash);
}

async function verifyPasswordPbkdf2(password, stored) {
  const parsed = parsePasswordHash(stored);
  if (!parsed || !Number.isFinite(parsed.iterations) || parsed.iterations <= 0) {
    return false;
  }

  const hash = await derivePasswordHashPbkdf2(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(hash, parsed.expected);
}

export function needsPasswordUpgrade(stored) {
  return !isArgon2Hash(stored);
}

export async function hashPassword(password, env) {
  if (passwordValidationError(password)) {
    throw new Error("Invalid password for hashing.");
  }

  return hashPasswordArgon2(password, env);
}

export async function verifyPassword(password, stored, env) {
  if (typeof password !== "string" || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }

  if (isArgon2Hash(stored)) {
    return verifyPasswordArgon2(password, stored);
  }

  return verifyPasswordPbkdf2(password, stored);
}

export async function upgradePasswordHash(env, userId, password, stored) {
  if (!needsPasswordUpgrade(stored)) {
    return stored;
  }

  const valid = await verifyPasswordPbkdf2(password, stored);
  if (!valid) {
    return stored;
  }

  const nextHash = await hashPassword(password, env);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(nextHash, userId)
    .run();
  return nextHash;
}

export function sessionMaxAge(env) {
  const days = Number(env.SESSION_DAYS || SESSION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return SESSION_DAYS * 24 * 60 * 60;
  return Math.floor(days * 24 * 60 * 60);
}

export function sessionRotateMs(env) {
  const hours = Number(env.SESSION_ROTATE_HOURS || SESSION_ROTATE_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    return SESSION_ROTATE_HOURS * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export async function createSession(env, userId) {
  const rawToken = generateRawToken(32);
  const tokenHash = await hashSecret(rawToken, env);
  const maxAge = sessionMaxAge(env);
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, last_rotated_at)
     VALUES (?, ?, ?, datetime('now'))`
  )
    .bind(tokenHash, userId, expiresAt)
    .run();

  return { token: rawToken, maxAge };
}

export async function deleteSession(env, rawToken) {
  if (!rawToken) return;
  const tokenHash = await hashSecret(rawToken, env);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function deleteAllUserSessions(env, userId) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

async function loadSessionUser(env, tokenHash) {
  return env.DB.prepare(
    `SELECT s.token_hash, s.last_rotated_at,
            u.id, u.email, u.email_verified, u.display_name,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE s.token_hash = ?
       AND s.expires_at > datetime('now')`
  )
    .bind(tokenHash)
    .first();
}

export async function rotateSession(env, userId, currentTokenHash) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(currentTokenHash)
    .run();
  return createSession(env, userId);
}

export async function resolveSession(request, env) {
  if (!env.DB) {
    return { user: null, sessionHeaders: {} };
  }

  const cookies = parseCookies(request);
  const rawToken = cookies[SESSION_COOKIE];
  if (!rawToken) {
    return { user: null, sessionHeaders: {} };
  }

  const tokenHash = await hashSecret(rawToken, env);
  const row = await loadSessionUser(env, tokenHash);
  if (!row || !row.email_verified) {
    return { user: null, sessionHeaders: {} };
  }

  const sessionHeaders = {};
  const rotatedAtMs = Date.parse(row.last_rotated_at || "");
  const shouldRotate =
    !Number.isFinite(rotatedAtMs) ||
    Date.now() - rotatedAtMs >= sessionRotateMs(env);

  if (shouldRotate) {
    const session = await rotateSession(env, row.id, tokenHash);
    sessionHeaders["Set-Cookie"] = sessionCookieHeader(session.token, session.maxAge);
  }

  return { user: row, sessionHeaders };
}

export async function getSessionUser(request, env) {
  const { user } = await resolveSession(request, env);
  return user;
}

export async function createEmailToken(env, userId, type, hours) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("Invalid user id for email token.");
  }

  const rawToken = generateRawToken(32);
  const tokenHash = await hashSecret(rawToken, env);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND type = ?")
    .bind(uid, type)
    .run();

  await env.DB.prepare(
    "INSERT INTO email_tokens (token_hash, user_id, type, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(tokenHash, uid, type, expiresAt)
    .run();

  return rawToken;
}

export async function consumeEmailToken(env, rawToken, type) {
  const tokenHash = await hashSecret(rawToken, env);
  const row = await env.DB.prepare(
    `SELECT et.token_hash, et.user_id, u.email
     FROM email_tokens et
     JOIN users u ON u.id = et.user_id
     WHERE et.token_hash = ?
       AND et.type = ?
       AND et.expires_at > datetime('now')`
  )
    .bind(tokenHash, type)
    .first();

  if (!row) return null;

  await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
  return row;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function errorMessage(err) {
  const parts = [];
  let current = err;

  while (current) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (current.message) {
      parts.push(String(current.message));
    }
    if (current.name && current.name !== "Error") {
      parts.push(String(current.name));
    }
    current = current.cause;
  }

  if (!parts.length && err != null) {
    parts.push(String(err));
  }

  return parts.join(" | ") || "Unknown error";
}

export async function insertUser(env, email, passwordHash) {
  const result = await env.DB.prepare(
    "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 0)"
  )
    .bind(email, passwordHash)
    .run();

  if (!result.success) {
    throw new Error("User insert failed.");
  }

  const row = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!row || row.id == null) {
    throw new Error("User insert did not return an id.");
  }

  return Number(row.id);
}

export function sessionPayload(user) {
  const hasAvatar = Boolean(user && (user.has_avatar === 1 || user.has_avatar === true));
  const version =
    user && user.avatar_updated_at ? encodeURIComponent(user.avatar_updated_at) : "";

  return {
    authenticated: true,
    email: user.email,
    displayName: user.display_name || null,
    displayLabel:
      user.display_name ||
      (user.email ? user.email.split("@")[0] : "Account"),
    hasAvatar,
    avatarUrl: hasAvatar ? "/api/account/avatar?v=" + version : null,
    initials: initialsFromUser(user),
  };
}

function initialsFromUser(user) {
  const label =
    user.display_name || (user.email ? user.email.split("@")[0] : "Account");
  const parts = label.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return label.slice(0, 2).toUpperCase();
}
