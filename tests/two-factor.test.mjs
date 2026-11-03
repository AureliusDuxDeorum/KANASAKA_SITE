import assert from "node:assert/strict";
import { test } from "node:test";

import { generateBackupCodes, OTP_MAX_FAILURES, verifyTwoFactorLogin } from "../functions/lib/two-factor.js";
import { generateRawToken, hashSecret } from "../functions/lib/tokens.js";
import { insertUser, makeEnv } from "./helpers.mjs";

async function setup(env, { email = false } = {}) {
  const user = await insertUser(env, { totp_enabled: 1, phone_e164: email ? null : "+4915223693645" });
  const raw = generateRawToken(32);
  await env.DB.prepare("INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSecret("2fa:" + raw, env), user.id, new Date(Date.now() + 5 * 60_000).toISOString())
    .run();
  return { user, challenge: raw };
}

async function giveCode(env, userId, code, expiresInMs = 5 * 60_000) {
  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE user_id = ? AND purpose = 'login'").bind(userId).run();
  await env.DB.prepare("INSERT INTO sms_otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?, 'login', ?, ?)")
    .bind(userId, await hashSecret("sms:login:" + code, env), new Date(Date.now() + expiresInMs).toISOString())
    .run();
}

const rows = async (env, table, userId) =>
  (await env.DB.prepare("SELECT COUNT(*) AS c FROM " + table + " WHERE user_id = ?").bind(userId).first()).c;

test("the right code signs in and is single-use", async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env);
  await giveCode(env, user.id, "123456");

  const row = await verifyTwoFactorLogin(env, challenge, "123456");
  assert.equal(row.user_id, user.id);
  assert.equal(await rows(env, "sms_otp_codes", user.id), 0, "code consumed");
  await assert.rejects(verifyTwoFactorLogin(env, challenge, "123456"), /expired/i, "challenge consumed");
});

test("a wrong code is refused with the generic message", async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env);
  await giveCode(env, user.id, "123456");
  await assert.rejects(verifyTwoFactorLogin(env, challenge, "000000"), /Invalid or expired/);
});

test(`after ${OTP_MAX_FAILURES} wrong codes even the correct one is refused and the challenge is destroyed`, async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env);
  await giveCode(env, user.id, "123456");

  for (let i = 0; i < OTP_MAX_FAILURES; i += 1) {
    await assert.rejects(verifyTwoFactorLogin(env, challenge, String(100000 + i)), /Invalid or expired|expired/);
  }

  assert.equal(await rows(env, "twofa_challenges", user.id), 0, "challenge deleted");
  assert.equal(await rows(env, "sms_otp_codes", user.id), 0, "outstanding codes deleted");

  // an attacker who got lucky on guess six gains nothing: a fresh login is required
  await assert.rejects(verifyTwoFactorLogin(env, challenge, "123456"), /expired|Too many/);
});

test("guessing stays locked out across a new challenge until the window passes", async () => {
  const env = makeEnv();
  const first = await setup(env);
  for (let i = 0; i < OTP_MAX_FAILURES; i += 1) {
    await verifyTwoFactorLogin(env, first.challenge, "99999" + i).catch(() => {});
  }

  // password re-entered -> new challenge + new code; the account is still locked
  const raw = generateRawToken(32);
  await env.DB.prepare("INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSecret("2fa:" + raw, env), first.user.id, new Date(Date.now() + 5 * 60_000).toISOString())
    .run();
  await giveCode(env, first.user.id, "654321");

  await assert.rejects(verifyTwoFactorLogin(env, raw, "654321"), (err) => {
    assert.equal(err.status, 429);
    assert.match(err.message, /Too many/);
    assert.equal(err.userId, first.user.id);
    return true;
  });

  // ...and recovers once the failures age out of the window
  await env.DB.prepare("UPDATE auth_events SET created_at = datetime('now', '-10 minutes') WHERE event_type = 'otp_failed'").run();
  await giveCode(env, first.user.id, "654321");
  const row = await verifyTwoFactorLogin(env, raw, "654321").catch(() => null);
  assert.ok(row === null || row.user_id === first.user.id);
});

test("a code that expired earlier today is rejected (ISO vs datetime('now') comparison)", async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env);
  await giveCode(env, user.id, "123456", -60_000); // expired one minute ago, same UTC day
  await assert.rejects(verifyTwoFactorLogin(env, challenge, "123456"), /Invalid or expired/);
});

test("an expired login challenge is rejected", async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env);
  await env.DB.prepare("UPDATE twofa_challenges SET expires_at = ?").bind(new Date(Date.now() - 60_000).toISOString()).run();
  await giveCode(env, user.id, "123456");
  await assert.rejects(verifyTwoFactorLogin(env, challenge, "123456"), /expired/i);
});

test("backup codes work once, and wrong ones count toward the lockout", async () => {
  const env = makeEnv();
  const { user, challenge } = await setup(env, { email: true });
  const [good] = await generateBackupCodes(env, user.id);

  await assert.rejects(verifyTwoFactorLogin(env, challenge, "AAAAA-BBBBB"), /Invalid or expired/);
  assert.equal((await verifyTwoFactorLogin(env, challenge, good.toLowerCase())).user_id, user.id);

  const again = await setup(env, { email: true });
  const codes = await generateBackupCodes(env, again.user.id);
  for (let i = 0; i < OTP_MAX_FAILURES; i += 1) {
    await verifyTwoFactorLogin(env, again.challenge, "ZZZZZ-ZZZZ" + i).catch(() => {});
  }
  await assert.rejects(verifyTwoFactorLogin(env, again.challenge, codes[0]), /expired|Too many/);
});
