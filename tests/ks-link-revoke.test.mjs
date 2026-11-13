// When a KANASAKA account's credentials change or the account is deleted, KS_Link's relay is told
// (functions/lib/ks-link-revoke.js) so its own sessions end / its data is erased.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";

import { createPasswordResetCode, hashPassword } from "../functions/lib/auth.js";
import { hashSecret } from "../functions/lib/tokens.js";
import { notifyKsLink, signRelayBody } from "../functions/lib/ks-link-revoke.js";
import { onRequestPost as changePassword } from "../functions/api/account/password.js";
import { onRequestPost as deleteAccount } from "../functions/api/account/delete.js";
import { onRequestPost as disableTwoFactor } from "../functions/api/account/two-factor/disable.js";
import { onRequestPost as resetPassword } from "../functions/api/auth/reset-password.js";
import { insertUser, json, makeEnv, req, sessionCookieFor } from "./helpers.mjs";

const SECRET = "shh-secret";
const PASSWORD = "Correct-Horse-Battery-9!";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ksEnv = (extra = {}) => makeEnv({ KS_LINK_OAUTH_CLIENT_ID: "ks-link", KS_LINK_OAUTH_CLIENT_SECRET: SECRET, ...extra });

function stubRelay(status = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body), raw: init.body });
    return new Response("{}", { status });
  };
  return calls;
}

/** A Pages-style context whose waitUntil work we can wait for. */
function ctx(env, request) {
  const pending = [];
  return { context: { request, env, waitUntil: (p) => pending.push(p) }, settled: () => Promise.all(pending) };
}

test("the signature is the same value the relay checks (independent HMAC)", async () => {
  const body = '{"site_user_id":7,"reason":"credentials"}';
  const expected = crypto.createHmac("sha256", SECRET).update("1700000000000." + body).digest("hex");
  assert.equal(await signRelayBody(SECRET, 1700000000000, body), expected);
  // relay/src/signed_request.test.ts asserts this exact value too
  assert.equal(expected, "ab2d0d96f2d31c455fce14765ea0641a5786919de25a2c52427f09ffb0eae2a3");
});

test("notify: a signed request goes to the relay's revoke route", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const { context, settled } = ctx(env, req("/x"));
  await notifyKsLink(context, 42, "credentials");
  await settled();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://link.kanasaka.com/v1/internal/revoke");
  assert.deepEqual(calls[0].body, { site_user_id: 42, reason: "credentials" });
  const expected = crypto.createHmac("sha256", SECRET).update(calls[0].headers["X-KS-Timestamp"] + "." + calls[0].raw).digest("hex");
  assert.equal(calls[0].headers["X-KS-Signature"], expected);
});

test("notify: does nothing when KS_Link sign-in is not configured", async () => {
  const calls = stubRelay();
  const { context, settled } = ctx(makeEnv(), req("/x"));
  await notifyKsLink(context, 42, "deleted");
  await settled();
  assert.equal(calls.length, 0);
});

test("notify: a relay that is down is retried once, never throws, and is written to the audit log", async () => {
  const calls = stubRelay(503);
  const env = ksEnv();
  const { context, settled } = ctx(env, req("/x"));
  await notifyKsLink(context, 42, "credentials");
  await settled();
  assert.equal(calls.length, 2, "one retry");
  const event = await env.DB.prepare("SELECT event_type FROM auth_events WHERE event_type = 'ks_link_revoke_failed'").first();
  assert.ok(event, "the failure is on record");
});

test("a network error is handled the same way", async () => {
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const env = ksEnv();
  const { context, settled } = ctx(env, req("/x"));
  await notifyKsLink(context, 42, "credentials");
  await settled();
  assert.ok(await env.DB.prepare("SELECT 1 AS x FROM auth_events WHERE event_type = 'ks_link_revoke_failed'").first());
});

async function withPassword(env) {
  return insertUser(env, { password_hash: await hashPassword(PASSWORD, env) });
}

test("changing the password tells KS_Link to end its sessions", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const user = await withPassword(env);
  const request = req("/api/account/password", { method: "POST", headers: { Cookie: await sessionCookieFor(env, user.id) }, body: { currentPassword: PASSWORD, newPassword: "A-Brand-New-Passphrase-77!" } });
  const { context, settled } = ctx(env, request);
  const res = await changePassword(context);
  await settled();
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.body), [{ site_user_id: user.id, reason: "credentials" }]);
});

test("resetting a forgotten password does too", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const user = await withPassword(env);
  const code = await createPasswordResetCode(env, user.id);
  const request = req("/api/auth/reset-password", { method: "POST", body: { email: user.email, code, password: "A-Brand-New-Passphrase-77!" } });
  const { context, settled } = ctx(env, request);
  const res = await resetPassword(context);
  await settled();
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.body), [{ site_user_id: user.id, reason: "credentials" }]);
});

test("a failed password change does NOT notify (nothing changed)", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const user = await withPassword(env);
  const request = req("/api/account/password", { method: "POST", headers: { Cookie: await sessionCookieFor(env, user.id) }, body: { currentPassword: "wrong-one-entirely-1!", newPassword: "A-Brand-New-Passphrase-77!" } });
  const { context, settled } = ctx(env, request);
  assert.equal((await changePassword(context)).status, 401);
  await settled();
  assert.equal(calls.length, 0);
});

test("switching two-factor off tells KS_Link as well", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const user = await insertUser(env, { password_hash: await hashPassword(PASSWORD, env), totp_enabled: 1, phone_e164: null });
  await env.DB.prepare("INSERT INTO sms_otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?, 'disable', ?, ?)")
    .bind(user.id, await hashSecret("sms:disable:123456", env), new Date(Date.now() + 5 * 60_000).toISOString())
    .run();
  const request = req("/api/account/two-factor/disable", { method: "POST", headers: { Cookie: await sessionCookieFor(env, user.id) }, body: { code: "123456" } });
  const { context, settled } = ctx(env, request);
  const res = await disableTwoFactor(context);
  await settled();
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.body), [{ site_user_id: user.id, reason: "credentials" }]);
});

test("deleting the account tells KS_Link to erase its data", async () => {
  const calls = stubRelay();
  const env = ksEnv();
  const user = await withPassword(env);
  const request = req("/api/account/delete", { method: "POST", headers: { Cookie: await sessionCookieFor(env, user.id) }, body: { password: PASSWORD, confirmation: "DELETE" } });
  const { context, settled } = ctx(env, request);
  const res = await deleteAccount(context);
  await settled();
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(calls.map((c) => c.body), [{ site_user_id: user.id, reason: "deleted" }]);
  assert.equal(await env.DB.prepare("SELECT 1 AS x FROM users WHERE id = ?").bind(user.id).first(), null, "the site account is gone");
});
