// KS_Link account unification (plan: KS_Link/docs' rework plan, Phase 1.1) --
// KANASAKA_SITE acting as an OAuth *provider* for the first time. Mirrors
// alpaca-oauth.js's allowlist/exchange shape, but in the opposite direction
// (we issue codes instead of redeeming someone else's), and reuses
// email_tokens' exact pattern for the code itself: a random raw value the
// caller holds, hashed via hashSecret() before it ever touches D1, so a DB
// read alone can never mint a session.

import { hashSecret, generateRawToken, timingSafeEqualString } from "./tokens.js";

// The KS_Link app's own custom URI scheme (registered via
// tauri-plugin-deep-link). Deliberately the ONLY entry: a localhost
// fallback would let any local process that binds the port catch a code.
const ALLOWED_REDIRECT_URIS = new Set(["ks-link://oauth/callback"]);

const CODE_TTL_SECONDS = 120;

export function assertAllowedRedirect(redirectUri) {
  const value = String(redirectUri || "").trim();
  if (!ALLOWED_REDIRECT_URIS.has(value)) {
    throw new Error("Redirect URI is not allowed.");
  }
  return value;
}

export function ksLinkOAuthConfigured(env) {
  return Boolean(env.KS_LINK_OAUTH_CLIENT_ID && env.KS_LINK_OAUTH_CLIENT_SECRET);
}

// base64url of a SHA-256 digest is exactly 43 characters.
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export function isValidCodeChallenge(value) {
  return CHALLENGE_PATTERN.test(String(value || ""));
}

async function s256(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let binary = "";
  new Uint8Array(digest).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mints a short-lived, single-use authorization code for an already-authenticated site user. */
export async function createAuthorizationCode(env, { userId, clientId, redirectUri, codeChallenge }) {
  const rawCode = generateRawToken(32);
  const codeHash = await hashSecret(rawCode, env);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO oauth_authorizations (code_hash, user_id, client_id, redirect_uri, expires_at, code_challenge) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(codeHash, userId, String(clientId), redirectUri, expiresAt, codeChallenge)
    .run();

  return rawCode;
}

/** Server-to-server only -- called by KS_Link's relay, never the app directly, which is why this takes a client_secret. */
export async function exchangeAuthorizationCode(env, { code, clientId, clientSecret, redirectUri, codeVerifier }) {
  if (!ksLinkOAuthConfigured(env)) {
    throw new Error("KS_Link OAuth is not configured on the server.");
  }
  if (!timingSafeEqualString(String(clientId || "").trim(), String(env.KS_LINK_OAUTH_CLIENT_ID).trim())) {
    throw new Error("Client ID does not match.");
  }
  if (!timingSafeEqualString(String(clientSecret || ""), String(env.KS_LINK_OAUTH_CLIENT_SECRET))) {
    throw new Error("Client secret does not match.");
  }
  if (!VERIFIER_PATTERN.test(String(codeVerifier || ""))) {
    throw new Error("code_verifier is required.");
  }
  assertAllowedRedirect(redirectUri);

  const rawCode = String(code || "").trim();
  if (!rawCode) {
    throw new Error("Authorization code is required.");
  }
  const codeHash = await hashSecret(rawCode, env);

  const row = await env.DB.prepare(
    `SELECT oa.user_id, oa.redirect_uri, oa.expires_at, oa.consumed_at, oa.code_challenge,
            u.email, u.email_verified, u.display_name, u.account_id
     FROM oauth_authorizations oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.code_hash = ?`
  )
    .bind(codeHash)
    .first();

  if (!row) {
    throw new Error("Invalid authorization code.");
  }
  if (row.consumed_at) {
    throw new Error("Authorization code already used.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("Authorization code expired.");
  }
  if (row.redirect_uri !== redirectUri) {
    throw new Error("Redirect URI does not match the one the code was issued for.");
  }
  // PKCE: the verifier must hash to the challenge sent when the login began.
  if (!row.code_challenge || !timingSafeEqualString(await s256(String(codeVerifier)), row.code_challenge)) {
    throw new Error("PKCE verification failed.");
  }
  // KS_Link auto-links a legacy account by email, which is only safe if the
  // site has actually proven this person owns that address.
  if (!row.email_verified) {
    throw new Error("Verify your email address on kanasaka.com first.");
  }

  // Single-use, enforced immediately rather than relying only on the
  // consumed_at check above surviving a race -- a second concurrent
  // exchange attempt with changes:0 means it lost the race and is
  // rejected, same "did it actually land" idiom KS_Link's own relay
  // already uses for like/unlike idempotency.
  const update = await env.DB.prepare(
    "UPDATE oauth_authorizations SET consumed_at = datetime('now') WHERE code_hash = ? AND consumed_at IS NULL"
  )
    .bind(codeHash)
    .run();
  if (!update.meta || update.meta.changes === 0) {
    throw new Error("Authorization code already used.");
  }

  return {
    site_user_id: row.user_id,
    email: row.email,
    display_name: row.display_name || null,
    account_id: row.account_id || null,
  };
}
