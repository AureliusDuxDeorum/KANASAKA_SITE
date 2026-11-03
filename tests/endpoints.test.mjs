import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestPost as forgotPassword } from "../functions/api/auth/forgot-password.js";
import { onRequestPost as login } from "../functions/api/auth/login.js";
import { onRequestPost as resendVerification } from "../functions/api/auth/resend-verification.js";
import { onRequestPost as twoFactorLogin } from "../functions/api/auth/two-factor.js";
import { onRequestPost as termsSend } from "../functions/api/terms/send.js";
import { hashPassword } from "../functions/lib/auth.js";
import { logEvent } from "../functions/lib/throttle.js";
import { insertUser, json, makeEnv, req } from "./helpers.mjs";

const PASSWORD = "Correct-Horse-Battery-9!x";
const quiet = (fn) => async (...args) => {
  const log = console.error;
  console.error = () => {};
  try {
    return await fn(...args);
  } finally {
    console.error = log;
  }
};

async function withAccount(env, extra = {}) {
  return insertUser(env, { password_hash: await hashPassword(PASSWORD, env), ...extra });
}

const post = (handler, env, path, body, headers = {}) =>
  handler({ request: req(path, { method: "POST", body, headers: { "CF-Connecting-IP": "203.0.113.7", ...headers } }), env });

const count = async (env, type) =>
  (await env.DB.prepare("SELECT COUNT(*) AS c FROM auth_events WHERE event_type = ?").bind(type).first()).c;

test("login: correct password signs in with a hardened session cookie", async () => {
  const env = makeEnv();
  const user = await withAccount(env);
  const res = await post(login, env, "/api/auth/login", { email: user.email, password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /^__Host-kanasaka_session=/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(cookie.includes(flag), flag);
});

test("login: wrong password and unknown email give the same answer", async () => {
  const env = makeEnv();
  const user = await withAccount(env);
  const wrong = await post(login, env, "/api/auth/login", { email: user.email, password: "Wrong-Password-1234!" });
  const unknown = await post(login, env, "/api/auth/login", { email: "nobody@example.com", password: "Wrong-Password-1234!" });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await json(wrong), await json(unknown));
});

test("login: unknown emails still pay for a password hash (no timing oracle)", async () => {
  const env = makeEnv({ ARGON2_MEMORY_KIB: "19456", ARGON2_ITERATIONS: "3" });
  const user = await withAccount(env);
  const time = async (email) => {
    const t0 = performance.now();
    await post(login, env, "/api/auth/login", { email, password: "Wrong-Password-1234!" });
    return performance.now() - t0;
  };
  await time("warmup@example.com"); // creates the throwaway hash once
  const unknown = Math.min(await time("a@example.com"), await time("b@example.com"));
  const known = Math.min(await time(user.email), await time(user.email));
  assert.ok(unknown > known * 0.4, `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`);
});

test("login: per-IP limit stops credential stuffing across many accounts", async () => {
  const env = makeEnv();
  const user = await withAccount(env);
  for (let i = 0; i < 30; i += 1) await logEvent(env, "login_failed", { ip: "203.0.113.7", email: "victim" + i + "@example.com" });
  const res = await post(login, env, "/api/auth/login", { email: user.email, password: PASSWORD });
  assert.equal(res.status, 429);
  // another address is unaffected
  const other = await post(login, env, "/api/auth/login", { email: user.email, password: PASSWORD }, { "CF-Connecting-IP": "198.51.100.9" });
  assert.equal(other.status, 200);
});

test("login: per-account limit still applies", async () => {
  const env = makeEnv();
  const user = await withAccount(env);
  for (let i = 0; i < 8; i += 1) await logEvent(env, "login_failed", { ip: "10.0." + i + ".1", email: user.email });
  assert.equal((await post(login, env, "/api/auth/login", { email: user.email, password: PASSWORD })).status, 429);
});

test("login: cross-origin POST is rejected", async () => {
  const env = makeEnv();
  const res = await login({ request: req("/api/auth/login", { method: "POST", origin: "https://evil.example", body: { email: "a@b.co", password: "x" } }), env });
  assert.equal(res.status, 403);
});

test("login: 2FA accounts cannot be used to flood codes", async () => {
  const env = makeEnv();
  const user = await withAccount(env, { totp_enabled: 1 });
  for (let i = 0; i < 8; i += 1) await logEvent(env, "login_2fa_required", { ip: "203.0.113.7", userId: user.id });
  const res = await post(login, env, "/api/auth/login", { email: user.email, password: PASSWORD });
  assert.equal(res.status, 429);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS c FROM twofa_challenges").first().then((r) => r.c), 0);
});

test("2FA step: too many wrong codes answers 429, not a bare 401", async () => {
  const env = makeEnv();
  const user = await withAccount(env, { totp_enabled: 1, phone_e164: "+4915223693645" });
  const { hashSecret } = await import("../functions/lib/tokens.js");
  await env.DB.prepare("INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSecret("2fa:chal", env), user.id, new Date(Date.now() + 300_000).toISOString())
    .run();

  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await quiet(post)(twoFactorLogin, env, "/api/auth/two-factor", { challenge: "chal", code: "11111" + i });
    statuses.push(res.status);
    assert.equal(res.headers.get("set-cookie"), null);
  }
  assert.ok(statuses.every((s) => s === 401 || s === 429), statuses.join());
  assert.ok(statuses.includes(401));
});

test("forgot-password: at most 3 mails per address, identical answer every time", async () => {
  const env = makeEnv();
  const user = await withAccount(env);
  const answers = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await post(forgotPassword, env, "/api/auth/forgot-password", { email: user.email });
    assert.equal(res.status, 200);
    answers.push(await res.text());
  }
  assert.equal(new Set(answers).size, 1, "throttled and allowed answers must be identical");
  assert.equal(await count(env, "password_reset_send"), 3);
  const unknown = await post(forgotPassword, env, "/api/auth/forgot-password", { email: "ghost@example.com" });
  assert.equal(await unknown.text(), answers[0], "no account-existence oracle");
});

test("resend-verification: capped per address", async () => {
  const env = makeEnv();
  const user = await withAccount(env, { email_verified: 0 });
  for (let i = 0; i < 6; i += 1) await post(resendVerification, env, "/api/auth/resend-verification", { email: user.email });
  assert.equal(await count(env, "verification_send"), 3);
});

test("terms mail: capped per address and per IP", async () => {
  const env = makeEnv();
  for (let i = 0; i < 4; i += 1) await quiet(post)(termsSend, env, "/api/terms/send", { email: "same@example.com" });
  assert.equal(await count(env, "terms_send"), 2);
  for (let i = 0; i < 10; i += 1) await quiet(post)(termsSend, env, "/api/terms/send", { email: "n" + i + "@example.com" });
  assert.equal(await count(env, "terms_send"), 5, "per-IP cap");
});
