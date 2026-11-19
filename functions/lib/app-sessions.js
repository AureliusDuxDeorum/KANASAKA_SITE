// Sessions for native apps (KS_C1). One per device, sent as `Authorization: Bearer <token>`, never as a cookie, so they
// are not subject to the website's cookie rules and do not touch its single-session-per-account rule.
//
//   * The token is 32 random bytes, shown once, stored only as hashSecret() output (like website sessions).
//   * Lifetime is APP_SESSION_DAYS, sliding: a check pushes the expiry out. A device unused that long drops off. Sliding never lasts
//     forever: APP_SESSION_MAX_DAYS after sign-in the session ends whatever its use, and the person signs in again.
//   * No rotation. A bearer token replaced by the server but lost on the way back would strand the app; revocation does the work
//     instead (per device, and all of them on a password change, reset, two-factor switch-off, or account deletion).
//   * At most MAX_APP_DEVICES per account; signing in on one more evicts the least recently used.
import { sessionPayload } from "./auth.js";
import { generateRawToken, hashSecret } from "./tokens.js";

export const APP_SESSION_DAYS = 30;
/** The longest any app session lives, however often it is used. */
export const APP_SESSION_MAX_DAYS = 150;
const MAX_AGE_SQL = `datetime(s.created_at, '+${APP_SESSION_MAX_DAYS} days') > datetime('now')`;

/** A timestamp the database wrote ('YYYY-MM-DD HH:MM:SS', UTC) or an ISO one, as milliseconds; NaN if it is neither. */
function dbTime(value) {
  const text = String(value);
  return Date.parse(text.replace(" ", "T") + (/[zZ]|[+-]\d\d:\d\d$/.test(text) ? "" : "Z"));
}
export const MAX_APP_DEVICES = 10;
/** A check writes to the database at most this often, so reading a session is not a write every time. */
export const SLIDE_AFTER_MS = 60 * 60 * 1000;
/** The apps allowed to sign in this way. KS_Link has its own service and does not use these endpoints. */
export const APP_CLIENTS = new Set(["ks-c1"]);

const TOKEN_RE = /^Bearer ([A-Za-z0-9_-]{32,128})$/;

export function bearerToken(request) {
  const match = TOKEN_RE.exec(request.headers.get("Authorization") || "");
  return match ? match[1] : null;
}

export function normalizeClient(value) {
  const client = String(value || "").trim().toLowerCase();
  return APP_CLIENTS.has(client) ? client : null;
}

/** A device label is shown back to the user: one line, no control characters, at most 60 characters. */
export function cleanDeviceLabel(value) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return text || "Unknown device";
}

function publicId() {
  return generateRawToken(9);
}

export async function createAppSession(env, { userId, client, device }) {
  const uid = Math.trunc(Number(userId));
  const token = generateRawToken(32);
  const tokenHash = await hashSecret(token, env);
  const expiresAt = new Date(Date.now() + APP_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO app_sessions (token_hash, id, user_id, client, device_label, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(tokenHash, publicId(), uid, client, cleanDeviceLabel(device), expiresAt)
    .run();

  // Over the cap: drop the least recently used (the new one is the most recent, so it is never the one dropped).
  await env.DB.prepare(
    `DELETE FROM app_sessions WHERE token_hash IN (
       SELECT token_hash FROM app_sessions WHERE user_id = ? ORDER BY last_used_at DESC, created_at DESC, rowid DESC LIMIT -1 OFFSET ?
     )`
  )
    .bind(uid, MAX_APP_DEVICES)
    .run();

  return { token, expiresAt };
}

/** The signed-in user and the device row for a bearer token, or { user: null }. Slides the expiry at most once an hour. */
export async function resolveAppSession(request, env) {
  if (!env.DB) return { user: null, session: null };
  const token = bearerToken(request);
  if (!token) return { user: null, session: null };

  const tokenHash = await hashSecret(token, env);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.client, s.device_label, s.created_at AS session_created_at, s.last_used_at, s.expires_at,
            u.id, u.email, u.email_verified, u.display_name, u.account_id, u.role, u.totp_enabled,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM app_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now') AND ${MAX_AGE_SQL}`
  )
    .bind(tokenHash)
    .first();

  if (!row || !row.email_verified) return { user: null, session: null };

  const lastUsed = dbTime(row.last_used_at);
  let expiresAt = row.expires_at;
  if (!Number.isFinite(lastUsed) || Date.now() - lastUsed >= SLIDE_AFTER_MS) {
    // Slide forward, but never past the absolute limit.
    const hardStop = dbTime(row.session_created_at) + APP_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
    const slid = Date.now() + APP_SESSION_DAYS * 24 * 60 * 60 * 1000;
    expiresAt = new Date(Number.isFinite(hardStop) ? Math.min(slid, hardStop) : slid).toISOString();
    await env.DB.prepare("UPDATE app_sessions SET last_used_at = datetime('now'), expires_at = ? WHERE token_hash = ?")
      .bind(expiresAt, tokenHash)
      .run();
  }

  return {
    user: row,
    session: { id: row.session_id, client: row.client, label: row.device_label, createdAt: row.session_created_at, expiresAt },
  };
}

/** What an app may know about the account: no storefront or avatar URLs (those are cookie-protected), no other service's fields. */
export function appProfile(user, env) {
  const p = sessionPayload(user, env);
  return {
    email: p.email,
    accountId: p.accountId,
    role: p.role,
    displayName: p.displayName,
    displayLabel: p.displayLabel,
    initials: p.initials,
    twoFactorEnabled: p.twoFactorEnabled,
  };
}

/** The account row appProfile() reads, for a sign-in that has just succeeded (the login query does not select all of it). */
export async function loadProfileUser(env, userId) {
  return env.DB.prepare(
    `SELECT u.id, u.email, u.email_verified, u.display_name, u.account_id, u.role, u.totp_enabled,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM users u
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE u.id = ?`
  )
    .bind(Math.trunc(Number(userId)))
    .first();
}

/** The plan the account is on. Paid plans will change this one function; until they exist everyone is on the free plan. */
export function appPlan() {
  return { id: "free", paid: false };
}

export async function deleteAppSession(env, token) {
  if (!token) return;
  await env.DB.prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(await hashSecret(token, env)).run();
}

export async function deleteAllAppSessions(env, userId) {
  await env.DB.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(Math.trunc(Number(userId))).run();
}

export async function listAppSessions(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT id, client, device_label, created_at, last_used_at, expires_at
     FROM app_sessions s WHERE s.user_id = ? AND datetime(s.expires_at) > datetime('now') AND ${MAX_AGE_SQL}
     ORDER BY last_used_at DESC, created_at DESC`
  )
    .bind(Math.trunc(Number(userId)))
    .all();
  return results.map((r) => ({ id: r.id, client: r.client, label: r.device_label, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

/** Sign out one device by its public id, only if it belongs to this user. Returns whether one was removed. */
export async function deleteAppSessionById(env, userId, id) {
  const result = await env.DB.prepare("DELETE FROM app_sessions WHERE user_id = ? AND id = ?")
    .bind(Math.trunc(Number(userId)), String(id || ""))
    .run();
  return Boolean(result.meta && result.meta.changes > 0);
}

/** Sign out every device except the one named (or all of them when none is named). Returns how many were removed. */
export async function deleteOtherAppSessions(env, userId, keepId) {
  const result = await env.DB.prepare("DELETE FROM app_sessions WHERE user_id = ? AND id != ?")
    .bind(Math.trunc(Number(userId)), String(keepId || ""))
    .run();
  return Number((result.meta && result.meta.changes) || 0);
}
