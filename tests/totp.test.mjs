import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestPost as login } from "../functions/api/auth/login.js";
import { onRequestPost as twoFactorLogin } from "../functions/api/auth/two-factor.js";
import { onRequestPost as totpSetup } from "../functions/api/account/two-factor/totp-setup.js";
import { onRequestPost as totpEnable } from "../functions/api/account/two-factor/totp-enable.js";
import { onRequestPost as disable } from "../functions/api/account/two-factor/disable.js";
import { onRequestPost as sendCode } from "../functions/api/account/two-factor/send-code.js";
import { hashPassword } from "../functions/lib/auth.js";
import { getUserProfile, profilePayload } from "../functions/lib/profile.js";
import { OTP_MAX_FAILURES, twoFactorMethodFromUser } from "../functions/lib/two-factor.js";
import { findTotpStep, generateTotpCode, openSecret, sealSecret, verifyTotpCode } from "../functions/lib/totp.js";
import { insertUser, json, makeEnv, req, sessionCookieFor } from "./helpers.mjs";

const PASSWORD = "Correct-Horse-Battery-9!x";
const IP = { "CF-Connecting-IP": "203.0.113.9" };

const call = (handler, env, path, body, headers = {}) =>
  handler({ request: req(path, { method: "POST", body, headers: { ...IP, ...headers } }), env, waitUntil() {} });

async function account(env, extra = {}) {
  return insertUser(env, { password_hash: await hashPassword(PASSWORD, env), ...extra });
}

// A code from a *different* 30-second step, for the "already used" and "wrong" cases.
const codeAt = (secret, offsetSteps) => generateTotpCode(secret, Date.now() + offsetSteps * 30_000);

async function enableFor(env, user) {
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  const setup = await json(await call(totpSetup, env, "/api/account/two-factor/totp-setup", {}, cookie));
  const enable = await call(totpEnable, env, "/api/account/two-factor/totp-enable", { code: await generateTotpCode(setup.secret) }, cookie);
  return { cookie, setup, enable, result: await json(enable) };
}

test("RFC 6238 test vector (SHA-1, 6 digits)", async () => {
  // Secret "12345678901234567890" = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ; T=59s -> 94287082 (8 digits) -> 287082
  assert.equal(await generateTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000), "287082");
  assert.equal(await generateTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1111111109_000), "081804");
  assert.equal(await verifyTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", { timestampMs: 59_000 }), true);
  assert.equal(await verifyTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287083", { timestampMs: 59_000 }), false);
});

test("a code is accepted one step either side of now, not further", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  assert.equal(await findTotpStep(secret, await generateTotpCode(secret, now - 30_000), { timestampMs: now }), step - 1);
  assert.equal(await findTotpStep(secret, await generateTotpCode(secret, now + 30_000), { timestampMs: now }), step + 1);
  assert.equal(await findTotpStep(secret, await generateTotpCode(secret, now - 90_000), { timestampMs: now }), null);
});

test("secrets are encrypted at rest and round-trip", async () => {
  const env = makeEnv();
  const sealed = await sealSecret("JBSWY3DPEHPK3PXP", env);
  assert.match(sealed, /^v1:/);
  assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(await openSecret(sealed, env), "JBSWY3DPEHPK3PXP");
  assert.equal(await openSecret(sealed, { SESSION_SECRET: "another-secret-entirely-0123456789" }), null, "wrong key opens nothing");
  assert.equal(await openSecret("v1:AAAA:BBBB", env), null, "garbage opens nothing");
});

test("setup hands back a secret and an otpauth link, and stores only the sealed secret", async () => {
  const env = makeEnv();
  const user = await account(env);
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  const res = await call(totpSetup, env, "/api/account/two-factor/totp-setup", {}, cookie);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.match(body.secret, /^[A-Z2-7]{32}$/);
  assert.match(body.otpauthUri, /^otpauth:\/\/totp\/KANASAKA%3A/);
  assert.ok(body.otpauthUri.includes("secret=" + body.secret));
  assert.ok(body.otpauthUri.includes("issuer=KANASAKA"));

  const row = await env.DB.prepare("SELECT totp_secret, totp_pending_secret, totp_enabled FROM users WHERE id = ?").bind(user.id).first();
  assert.equal(row.totp_enabled, 0, "nothing is switched on until a code is proven");
  assert.equal(row.totp_secret, null);
  assert.ok(row.totp_pending_secret && !row.totp_pending_secret.includes(body.secret));
});

test("enabling needs a code from the app; a wrong one changes nothing", async () => {
  const env = makeEnv();
  const user = await account(env);
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  const setup = await json(await call(totpSetup, env, "/api/account/two-factor/totp-setup", {}, cookie));

  const wrong = await call(totpEnable, env, "/api/account/two-factor/totp-enable", { code: "000000" }, cookie);
  assert.equal(wrong.status, 400);
  assert.equal((await env.DB.prepare("SELECT totp_enabled FROM users WHERE id = ?").bind(user.id).first()).totp_enabled, 0);

  const ok = await call(totpEnable, env, "/api/account/two-factor/totp-enable", { code: await generateTotpCode(setup.secret) }, cookie);
  assert.equal(ok.status, 200);
  const body = await json(ok);
  assert.equal(body.backupCodes.length, 8);

  const row = await env.DB.prepare("SELECT totp_enabled, totp_secret, totp_pending_secret FROM users WHERE id = ?").bind(user.id).first();
  assert.equal(row.totp_enabled, 1);
  assert.ok(row.totp_secret);
  assert.equal(row.totp_pending_secret, null);
});

test("enabling without starting setup is refused, and so is setup when 2FA is already on", async () => {
  const env = makeEnv();
  const user = await account(env);
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  assert.equal((await call(totpEnable, env, "/api/account/two-factor/totp-enable", { code: "123456" }, cookie)).status, 400);

  await enableFor(env, user);
  assert.equal((await call(totpSetup, env, "/api/account/two-factor/totp-setup", {}, cookie)).status, 409);
});

test("setup and enable need a session and reject a cross-origin POST", async () => {
  const env = makeEnv();
  assert.equal((await call(totpSetup, env, "/api/account/two-factor/totp-setup", {})).status, 401);
  assert.equal((await call(totpEnable, env, "/api/account/two-factor/totp-enable", { code: "123456" })).status, 401);
  const cross = await totpSetup({ request: req("/api/account/two-factor/totp-setup", { method: "POST", origin: "https://evil.example", body: {} }), env });
  assert.equal(cross.status, 403);
});

test("profile reports the authenticator method and never exposes the secret", async () => {
  const env = makeEnv();
  const user = await account(env);
  await enableFor(env, user);
  const profile = await getUserProfile(env, user.id);
  const payload = profilePayload(profile);
  assert.equal(payload.twoFactorEnabled, true);
  assert.equal(payload.twoFactorMethod, "totp");
  assert.equal(payload.emailMasked, null);
  assert.equal(payload.phoneMasked, null);
  assert.ok(!JSON.stringify(payload).includes("secret"));
  assert.equal(twoFactorMethodFromUser({ totp_enabled: 1, has_totp_secret: 1, phone_e164: "+49" }), "totp");
  assert.equal(twoFactorMethodFromUser({ totp_enabled: 1, has_totp_secret: 0, phone_e164: "+49" }), "sms");
  assert.equal(twoFactorMethodFromUser({ totp_enabled: 1, has_totp_secret: 0, phone_e164: null }), "email");
});

test("login: password then an authenticator code signs in; nothing is emailed or texted", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { setup } = await enableFor(env, user);

  const first = await call(login, env, "/api/auth/login", { email: user.email, password: PASSWORD });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("set-cookie"), null, "no session before the second step");
  const challenge = await json(first);
  assert.equal(challenge.twoFactorRequired, true);
  assert.equal(challenge.method, "totp");
  assert.equal(challenge.phoneMasked, null);
  assert.equal(challenge.emailMasked, null);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS c FROM sms_otp_codes").first().then((r) => r.c), 0, "no one-time code was generated");

  // The setup code used a moment ago is spent; log in with the next step's code.
  const code = await codeAt(setup.secret, 1);
  const done = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: challenge.challenge, code });
  assert.equal(done.status, 200, await done.clone().text());
  assert.match(done.headers.get("set-cookie"), /^__Host-kanasaka_session=/);
});

test("login: a code that was already accepted can't be replayed", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { setup } = await enableFor(env, user);
  const code = await codeAt(setup.secret, 1);

  const start = async () => json(await call(login, env, "/api/auth/login", { email: user.email, password: PASSWORD }));
  const ok = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: (await start()).challenge, code });
  assert.equal(ok.status, 200);

  const replay = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: (await start()).challenge, code });
  assert.equal(replay.status, 401);
  assert.equal(replay.headers.get("set-cookie"), null);
  assert.match((await json(replay)).error, /already used/i);
});

test("the code that finished setup can't be reused to sign in straight away", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { setup } = await enableFor(env, user);
  const start = await json(await call(login, env, "/api/auth/login", { email: user.email, password: PASSWORD }));
  const res = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: start.challenge, code: await generateTotpCode(setup.secret) });
  assert.equal(res.status, 401);
});

test("login: a wrong authenticator code is refused, and a backup code works once", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { setup, result } = await enableFor(env, user);
  const start = async () => json(await call(login, env, "/api/auth/login", { email: user.email, password: PASSWORD }));

  const bad = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: (await start()).challenge, code: await codeAt(setup.secret, 5) });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("set-cookie"), null);

  const backup = result.backupCodes[0];
  const good = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: (await start()).challenge, code: backup });
  assert.equal(good.status, 200);
  const again = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge: (await start()).challenge, code: backup });
  assert.equal(again.status, 401, "backup codes are single-use");
});

test(`after ${OTP_MAX_FAILURES} wrong authenticator codes even the right one is refused`, async () => {
  const env = makeEnv();
  const user = await account(env);
  const { setup } = await enableFor(env, user);
  const challenge = (await json(await call(login, env, "/api/auth/login", { email: user.email, password: PASSWORD }))).challenge;

  for (let i = 0; i < OTP_MAX_FAILURES; i += 1) {
    const res = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge, code: "11111" + i });
    assert.ok([401, 429].includes(res.status));
  }
  const res = await call(twoFactorLogin, env, "/api/auth/two-factor", { challenge, code: await codeAt(setup.secret, 1) });
  assert.ok([401, 429].includes(res.status));
  assert.equal(res.headers.get("set-cookie"), null);
});

test("disabling needs a current authenticator code (or a backup code) and clears everything", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { cookie, setup, result } = await enableFor(env, user);

  const wrong = await call(disable, env, "/api/account/two-factor/disable", { code: await codeAt(setup.secret, 6) }, cookie);
  assert.equal(wrong.status, 401);
  assert.equal((await env.DB.prepare("SELECT totp_enabled FROM users WHERE id = ?").bind(user.id).first()).totp_enabled, 1);

  const ok = await call(disable, env, "/api/account/two-factor/disable", { code: result.backupCodes[0] }, cookie);
  assert.equal(ok.status, 200, await ok.clone().text());
  const row = await env.DB.prepare("SELECT totp_enabled, totp_secret, totp_pending_secret FROM users WHERE id = ?").bind(user.id).first();
  assert.deepEqual({ ...row }, { totp_enabled: 0, totp_secret: null, totp_pending_secret: null });
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS c FROM twofa_backup_codes WHERE user_id = ?").bind(user.id).first().then((r) => r.c), 0);
});

test("disabling with a fresh authenticator code works", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { cookie, setup } = await enableFor(env, user);
  const res = await call(disable, env, "/api/account/two-factor/disable", { code: await codeAt(setup.secret, 1) }, cookie);
  assert.equal(res.status, 200, await res.clone().text());
});

test("there is no 'send a code' for an authenticator account", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { cookie } = await enableFor(env, user);
  const res = await call(sendCode, env, "/api/account/two-factor/send-code", { purpose: "disable" }, cookie);
  assert.equal(res.status, 400);
  assert.match((await json(res)).error, /authenticator/i);
});
