// Signing in to the KS_Link app with a KANASAKA account: /api/ks-link/login and
// /api/ks-link/two-factor issue a one-time, PKCE-bound code; /api/oauth/token lets KS_Link's
// relay redeem it (server-to-server, with the client secret). No site session is created.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { hashPassword } from "../functions/lib/auth.js";
import { generateRawToken, hashSecret } from "../functions/lib/tokens.js";
import { onRequestGet as config } from "../functions/api/ks-link/config.js";
import { onRequestPost as appLogin } from "../functions/api/ks-link/login.js";
import { onRequestPost as appTwoFactor } from "../functions/api/ks-link/two-factor.js";
import { onRequestPost as token } from "../functions/api/oauth/token.js";
import { insertUser, json, makeEnv, req, sessionCookieFor } from "./helpers.mjs";

const PASSWORD = "Correct-Horse-Battery-9!";
const VERIFIER = "v".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const oauthEnv = () => makeEnv({ KS_LINK_OAUTH_CLIENT_ID: "ks-link", KS_LINK_OAUTH_CLIENT_SECRET: "shh-secret" });

async function user(env, extra = {}) {
  return insertUser(env, { password_hash: await hashPassword(PASSWORD, env), ...extra });
}
const login = (env, body, { origin = null, headers = {} } = {}) =>
  appLogin({ request: req("/api/ks-link/login", { method: "POST", body, origin, headers }), env });
const redeem = (env, body) => token({ request: req("/api/oauth/token", { method: "POST", body, origin: null }), env });
const redeemBody = (code, extra = {}) => ({ code, client_id: "ks-link", client_secret: "shh-secret", code_verifier: VERIFIER, ...extra });
const count = async (env, table) => (await env.DB.prepare("SELECT COUNT(*) AS c FROM " + table).first()).c;

test("config tells the app which Terms version registration needs", async () => {
  const body = await json(await config());
  assert.match(body.tosVersion, /^\d+$/);
  assert.match(body.termsUrl, /^https:\/\/kanasaka\.com\//);
});

test("login: right password -> a code, redeemed once with the matching verifier", async () => {
  const env = oauthEnv();
  const u = await user(env, { email: "app@example.com", display_name: "App User" });

  const res = await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE });
  assert.equal(res.status, 200);
  const { code } = await json(res);
  assert.ok(code);

  assert.equal((await redeem(env, redeemBody(code, { code_verifier: "w".repeat(64) }))).status, 400, "wrong verifier");
  const good = await redeem(env, redeemBody(code));
  assert.equal(good.status, 200);
  const identity = await json(good);
  assert.equal(identity.email, "app@example.com");
  assert.equal(identity.site_user_id, u.id);
  assert.equal(identity.display_name, "App User");
  assert.equal((await redeem(env, redeemBody(code))).status, 400, "single use");
});

test("login starts NO site session and signs nobody out on the website", async () => {
  const env = oauthEnv();
  const u = await user(env);
  await sessionCookieFor(env, u.id); // a browser session already exists
  const before = await count(env, "sessions");
  const res = await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null, "no cookie");
  assert.equal(await count(env, "sessions"), before, "no session created or deleted");
});

test("login: wrong password, unknown account and unverified email all look the same (401)", async () => {
  const env = oauthEnv();
  const verified = await user(env);
  const unverified = await user(env, { email_verified: 0 });
  const bodies = [];
  for (const attempt of [
    { email: verified.email, password: "Wrong-password-1!" },
    { email: "nobody@example.com", password: PASSWORD },
    { email: unverified.email, password: PASSWORD },
  ]) {
    const res = await login(env, { ...attempt, code_challenge: CHALLENGE });
    assert.equal(res.status, 401);
    bodies.push((await json(res)).error);
  }
  assert.equal(new Set(bodies).size, 1, "identical message: " + bodies.join(" | "));
  assert.equal(await count(env, "oauth_authorizations"), 0, "no code was minted");
});

test("login: needs a PKCE challenge, and the client must be configured", async () => {
  const env = oauthEnv();
  const u = await user(env);
  assert.equal((await login(env, { email: u.email, password: PASSWORD })).status, 400);
  assert.equal((await login(env, { email: u.email, password: PASSWORD, code_challenge: "short" })).status, 400);
  const unconfigured = makeEnv();
  assert.equal((await login(unconfigured, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE })).status, 503);
});

test("login: refuses a browser on another website (CSRF), accepts a native app (no Origin)", async () => {
  const env = oauthEnv();
  const u = await user(env);
  const body = { email: u.email, password: PASSWORD, code_challenge: CHALLENGE };
  assert.equal((await login(env, body, { origin: "https://evil.example" })).status, 403);
  assert.equal((await login(env, body, { origin: null })).status, 200);
});

test("login shares the website's brute-force throttle: 8 failures lock the account out of the app too", async () => {
  const env = oauthEnv();
  const u = await user(env);
  for (let i = 0; i < 8; i += 1) {
    assert.equal((await login(env, { email: u.email, password: "Nope-nope-nope-1!", code_challenge: CHALLENGE })).status, 401);
  }
  const locked = await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE });
  assert.equal(locked.status, 429, "even the right password is refused while locked");
});

async function challengeFor(env, userId) {
  const raw = generateRawToken(32);
  await env.DB.prepare("INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSecret("2fa:" + raw, env), userId, new Date(Date.now() + 5 * 60_000).toISOString())
    .run();
  await env.DB.prepare("INSERT INTO sms_otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?, 'login', ?, ?)")
    .bind(userId, await hashSecret("sms:login:123456", env), new Date(Date.now() + 5 * 60_000).toISOString())
    .run();
  return raw;
}
const twoFactor = (env, body) => appTwoFactor({ request: req("/api/ks-link/two-factor", { method: "POST", body, origin: null }), env });

test("two-factor: the right code issues a sign-in code, a wrong one does not", async () => {
  const env = oauthEnv();
  const u = await user(env, { totp_enabled: 1, phone_e164: "+4915223693645", email: "tfa@example.com" });
  const challenge = await challengeFor(env, u.id);

  const wrong = await twoFactor(env, { challenge, code: "000000", code_challenge: CHALLENGE });
  assert.equal(wrong.status, 401);
  assert.equal(await count(env, "oauth_authorizations"), 0);

  const ok = await twoFactor(env, { challenge, code: "123456", code_challenge: CHALLENGE });
  assert.equal(ok.status, 200);
  const { code } = await json(ok);
  const identity = await json(await redeem(env, redeemBody(code)));
  assert.equal(identity.email, "tfa@example.com");
  assert.equal((await twoFactor(env, { challenge, code: "123456", code_challenge: CHALLENGE })).status, 401, "challenge is single use");
});

test("two-factor: needs the PKCE challenge and a challenge id", async () => {
  const env = oauthEnv();
  assert.equal((await twoFactor(env, { code: "123456", code_challenge: CHALLENGE })).status, 400);
  assert.equal((await twoFactor(env, { challenge: "abc", code: "123456" })).status, 400);
});

test("token: needs the client secret and refuses browsers on other sites", async () => {
  const env = oauthEnv();
  const u = await user(env);
  const { code } = await json(await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE }));
  assert.equal((await redeem(env, redeemBody(code, { client_secret: "nope" }))).status, 400);
  assert.equal((await redeem(env, redeemBody(code, { code_verifier: "short" }))).status, 400);
  const cross = await token({ request: req("/api/oauth/token", { method: "POST", body: redeemBody(code), origin: "https://evil.example" }), env });
  assert.equal(cross.status, 403);
  assert.equal((await redeem(env, redeemBody(code))).status, 200, "the failed attempts did not burn the code");
});

test("token: an expired code is refused", async () => {
  const env = oauthEnv();
  const u = await user(env);
  const { code } = await json(await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE }));
  await env.DB.prepare("UPDATE oauth_authorizations SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run();
  assert.equal((await redeem(env, redeemBody(code))).status, 400);
});

test("token: a code that is not a KS_Link sign-in code (old-style redirect marker) is refused", async () => {
  const env = oauthEnv();
  const u = await user(env);
  const { code } = await json(await login(env, { email: u.email, password: PASSWORD, code_challenge: CHALLENGE }));
  await env.DB.prepare("UPDATE oauth_authorizations SET redirect_uri = 'ks-link://oauth/callback'").run();
  assert.equal((await redeem(env, redeemBody(code))).status, 400);
});
