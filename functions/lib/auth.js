export const SESSION_COOKIE = "kanasaka_session";
export const SESSION_DAYS = 30;
export const VERIFY_TOKEN_HOURS = 24;
export const RESET_TOKEN_HOURS = 1;

export const DOWNLOAD_URLS = {
  windows:
    "https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_x64-setup.exe",
  linux:
    "https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_amd64.deb",
};

export const CONTACT_INFO = {
  email: "contact@kanasaka.com",
  phone: "+49 01522 3693645",
  phoneHref: "tel:+4915223693645",
  hours: "Available 2:00–6:00 PM on business days only.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email) && email.length <= 254;
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
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

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
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
      iterations: 210000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return `pbkdf2:${bytesToBase64(salt)}:${bytesToBase64(new Uint8Array(hash))}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;

  const salt = base64ToBytes(parts[1]);
  const expected = base64ToBytes(parts[2]);
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
      iterations: 210000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return timingSafeEqual(new Uint8Array(hash), expected);
}

export function sessionMaxAge(env) {
  const days = Number(env.SESSION_DAYS || SESSION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return SESSION_DAYS * 24 * 60 * 60;
  return Math.floor(days * 24 * 60 * 60);
}

export async function createSession(env, userId) {
  const token = crypto.randomUUID();
  const maxAge = sessionMaxAge(env);
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(token, userId, expiresAt)
    .run();

  return { token, maxAge };
}

export async function deleteSession(env, token) {
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
}

export async function getSessionUser(request, env) {
  if (!env.DB) return null;

  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.email_verified
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
       AND s.expires_at > datetime('now')`
  )
    .bind(token)
    .first();

  if (!row || !row.email_verified) return null;

  return row;
}

export async function createEmailToken(env, userId, type, hours) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND type = ?")
    .bind(userId, type)
    .run();

  await env.DB.prepare(
    "INSERT INTO email_tokens (id, user_id, type, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(token, userId, type, expiresAt)
    .run();

  return token;
}

export async function consumeEmailToken(env, token, type) {
  const row = await env.DB.prepare(
    `SELECT et.id, et.user_id, u.email
     FROM email_tokens et
     JOIN users u ON u.id = et.user_id
     WHERE et.id = ?
       AND et.type = ?
       AND et.expires_at > datetime('now')`
  )
    .bind(token, type)
    .first();

  if (!row) return null;

  await env.DB.prepare("DELETE FROM email_tokens WHERE id = ?").bind(token).run();
  return row;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function sessionPayload(user) {
  return {
    authenticated: true,
    email: user.email,
  };
}
