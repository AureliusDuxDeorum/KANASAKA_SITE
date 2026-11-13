// Sign-in codes for the KS_Link app. A KANASAKA account IS the KS_Link account: the app signs
// in through /api/ks-link/login (and /api/ks-link/two-factor), which issue a one-time code
// bound to a PKCE challenge the app made; KS_Link's relay redeems it server-to-server at
// /api/oauth/token with the app's verifier and the client secret, and learns who signed in.
// The code is a random value the caller holds, hashed via hashSecret() before it touches D1,
// so a database read alone can never mint a session. See docs/KS_LINK_OAUTH.md.

import { hashSecret, generateRawToken, timingSafeEqualString } from "./tokens.js";

// A sign-in code is only ever issued by /api/ks-link/login or /api/ks-link/two-factor, for the
// KS_Link app, and redeemed by KS_Link's relay. The "redirect" it is bound to is this fixed
// marker: nothing is redirected anywhere any more (the browser hand-off and the app-launch
// deep link were removed), it just keeps old-style codes from being redeemable as new ones.
export const APP_SIGNIN_REDIRECT_URI = "urn:kanasaka:app:signin";

const CODE_TTL_SECONDS = 120; // redeemed by the app within seconds of issue

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

/** Mints a short-lived, single-use sign-in code for a user who has just proven who they are. */
export async function issueAppSigninCode(env, { userId, codeChallenge }) {
  const rawCode = generateRawToken(32);
  const codeHash = await hashSecret(rawCode, env);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO oauth_authorizations (code_hash, user_id, client_id, redirect_uri, expires_at, code_challenge) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(codeHash, userId, String(env.KS_LINK_OAUTH_CLIENT_ID), APP_SIGNIN_REDIRECT_URI, expiresAt, codeChallenge)
    .run();

  return rawCode;
}

function checkClient(env, clientId, clientSecret) {
  if (!ksLinkOAuthConfigured(env)) {
    throw new Error("KS_Link OAuth is not configured on the server.");
  }
  if (!timingSafeEqualString(String(clientId || "").trim(), String(env.KS_LINK_OAUTH_CLIENT_ID).trim())) {
    throw new Error("Client ID does not match.");
  }
  if (!timingSafeEqualString(String(clientSecret || ""), String(env.KS_LINK_OAUTH_CLIENT_SECRET))) {
    throw new Error("Client secret does not match.");
  }
}

const ROW_SELECT = `SELECT oa.code_hash, oa.user_id, oa.redirect_uri, oa.expires_at, oa.consumed_at, oa.code_challenge,
            u.email, u.email_verified, u.display_name, u.account_id
     FROM oauth_authorizations oa
     JOIN users u ON u.id = oa.user_id`;

// The checks every redemption goes through, whichever way the row was found:
// unused, unexpired, same redirect, PKCE verifier matches, verified email, and
// consumed atomically so a second (concurrent) attempt loses.
async function redeemRow(env, row, { codeVerifier }) {
  if (row.consumed_at) {
    throw new Error("Authorization code already used.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("Authorization code expired.");
  }
  if (row.redirect_uri !== APP_SIGNIN_REDIRECT_URI) {
    throw new Error("Not a KS_Link sign-in code.");
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
    .bind(row.code_hash)
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

/** Server-to-server only -- called by KS_Link's relay, never the app directly, which is why this takes a client_secret. */
export async function exchangeAuthorizationCode(env, { code, clientId, clientSecret, codeVerifier }) {
  checkClient(env, clientId, clientSecret);
  if (!VERIFIER_PATTERN.test(String(codeVerifier || ""))) {
    throw new Error("code_verifier is required.");
  }

  const rawCode = String(code || "").trim();
  if (!rawCode) {
    throw new Error("Authorization code is required.");
  }
  const codeHash = await hashSecret(rawCode, env);

  const row = await env.DB.prepare(ROW_SELECT + " WHERE oa.code_hash = ?").bind(codeHash).first();
  if (!row) {
    throw new Error("Invalid authorization code.");
  }
  return redeemRow(env, row, { codeVerifier });
}
