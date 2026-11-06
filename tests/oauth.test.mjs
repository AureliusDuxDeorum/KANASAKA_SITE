// KS_Link account linking: the browser half (/api/oauth/authorize) and the
// server-to-server half (/api/oauth/token) of the OAuth-provider flow.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { onRequestGet as authorize } from "../functions/api/oauth/authorize.js";
import { onRequestPost as token } from "../functions/api/oauth/token.js";
import { insertUser, json, makeEnv, req, sessionCookieFor } from "./helpers.mjs";

const REDIRECT = "ks-link://oauth/callback";
const VERIFIER = "v".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const oauthEnv = () => makeEnv({ KS_LINK_OAUTH_CLIENT_ID: "ks-link", KS_LINK_OAUTH_CLIENT_SECRET: "shh-secret" });
const query = (extra = {}) =>
  "?" + new URLSearchParams({ client_id: "ks-link", redirect_uri: REDIRECT, state: "st4te", code_challenge: CHALLENGE, code_challenge_method: "S256", ...extra });

const get = (env, search, headers = {}) => authorize({ request: req("/api/oauth/authorize" + search, { headers }), env });

test("authorize: a logged-out visitor is sent to /login/ with return_to pointing back here", async () => {
  const res = await get(oauthEnv(), query());
  assert.equal(res.status, 302);
  const target = new URL(res.headers.get("location"));
  assert.equal(target.pathname, "/login/");
  const returnTo = target.searchParams.get("return_to");
  assert.ok(returnTo.startsWith("/api/oauth/authorize?"), returnTo);
  assert.equal(new URL(returnTo, "https://kanasaka.com").searchParams.get("state"), "st4te");
  // the login page only honours return_to for exactly this path (see getNextPath in assets/js/auth.js)
  assert.match(returnTo, /^\/api\/oauth\/authorize\?/);
});

test("authorize: a signed-in, verified user gets a code on the app's custom-scheme redirect", async () => {
  const env = oauthEnv();
  const user = await insertUser(env);
  const res = await get(env, query(), { Cookie: await sessionCookieFor(env, user.id) });
  assert.equal(res.status, 302);
  const location = res.headers.get("location");
  assert.ok(location.startsWith(REDIRECT + "?"), location);
  const url = new URL(location);
  assert.ok(url.searchParams.get("code"));
  assert.equal(url.searchParams.get("state"), "st4te");
});

test("authorize: refuses an unverified email, a foreign redirect, a missing PKCE challenge and a wrong client", async () => {
  const env = oauthEnv();
  const unverified = await insertUser(env, { email_verified: 0 });
  const cookie = await sessionCookieFor(env, unverified.id);
  // an unverified account never gets a code (it is either refused or treated as logged out)
  const refused = await get(env, query(), { Cookie: cookie });
  assert.ok(!(refused.headers.get("location") || "").startsWith(REDIRECT), "no code for an unverified email");
  const user = await insertUser(env);
  const ok = { Cookie: await sessionCookieFor(env, user.id) };
  assert.equal((await get(env, query({ redirect_uri: "https://evil.example/cb" }), ok)).status, 400);
  assert.equal((await get(env, query({ code_challenge: "short" }), ok)).status, 400);
  assert.equal((await get(env, query({ client_id: "someone-else" }), ok)).status, 400);
});

test("token: the code is exchanged once, with the matching PKCE verifier", async () => {
  const env = oauthEnv();
  const user = await insertUser(env, { email: "linked@example.com" });
  const res = await get(env, query(), { Cookie: await sessionCookieFor(env, user.id) });
  const code = new URL(res.headers.get("location")).searchParams.get("code");
  const exchange = (body) => token({ request: req("/api/oauth/token", { method: "POST", body, origin: null }), env });
  const base = { code, client_id: "ks-link", client_secret: "shh-secret", redirect_uri: REDIRECT };

  assert.equal((await exchange({ ...base, code_verifier: "w".repeat(64) })).status, 400, "wrong verifier");
  const good = await exchange({ ...base, code_verifier: VERIFIER });
  assert.equal(good.status, 200);
  assert.equal((await json(good)).email, "linked@example.com");
  assert.equal((await exchange({ ...base, code_verifier: VERIFIER })).status, 400, "code is single use");
});

test("authorize with check=1 validates but issues no code, and says why when it cannot", async () => {
  const env = oauthEnv();
  const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS c FROM oauth_authorizations").first()).c;

  const anon = await get(env, query({ check: "1" }));
  assert.equal(anon.status, 401);
  assert.match((await json(anon)).error, /not signed in/i);

  const user = await insertUser(env);
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  const ok = await get(env, query({ check: "1" }), cookie);
  assert.equal(ok.status, 200);
  assert.deepEqual(await json(ok), { ok: true });
  assert.equal(await count(), 0, "check mode must not mint a code");

  const bad = await get(env, query({ check: "1", client_id: "nope" }), cookie);
  assert.equal(bad.status, 400);
  assert.match((await json(bad)).error, /client/i);

  const missing = await authorize({ request: req("/api/oauth/authorize" + query({ check: "1" })), env: makeEnv() });
  assert.equal(missing.status, 500);
  assert.match((await json(missing)).error, /not configured/i);
});
