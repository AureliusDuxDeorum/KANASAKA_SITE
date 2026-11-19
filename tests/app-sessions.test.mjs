import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestPost as appLogin } from "../functions/api/app/login.js";
import { onRequestPost as appTwoFactor } from "../functions/api/app/two-factor.js";
import { onRequestPost as appTwoFactorSend } from "../functions/api/app/two-factor-send.js";
import { onRequestGet as appSession } from "../functions/api/app/session.js";
import { onRequestPost as appLogout } from "../functions/api/app/logout.js";
import { onRequestDelete as devicesDelete, onRequestGet as devicesGet } from "../functions/api/app/devices.js";
import { onRequestPost as adminDevices } from "../functions/api/admin/app-devices.js";
import { onRequestGet as adminLookup } from "../functions/api/admin/lookup.js";
import { onRequestPost as webLogin } from "../functions/api/auth/login.js";
import { onRequestPost as resetPassword } from "../functions/api/auth/reset-password.js";
import { onRequestPost as totpSetup } from "../functions/api/account/two-factor/totp-setup.js";
import { onRequestPost as totpEnable } from "../functions/api/account/two-factor/totp-enable.js";
import { createEmailToken, createSession, hashPassword, resolveSession } from "../functions/lib/auth.js";
import {
  APP_SESSION_DAYS,
  MAX_APP_DEVICES,
  bearerToken,
  cleanDeviceLabel,
  createAppSession,
  deleteAllAppSessions,
  resolveAppSession,
} from "../functions/lib/app-sessions.js";
import { generateTotpCode } from "../functions/lib/totp.js";
import { insertUser, json, makeEnv, req, sessionCookieFor } from "./helpers.mjs";

const PASSWORD = "Correct-Horse-Battery-9!x";
const IP = { "CF-Connecting-IP": "203.0.113.20" };

const post = (handler, env, path, body, headers = {}) => handler({ request: req(path, { method: "POST", body, headers: { ...IP, ...headers } }), env, waitUntil() {} });
const get = (handler, env, path, headers = {}) => handler({ request: req(path, { headers: { ...IP, ...headers } }), env });
const del = (handler, env, path, headers = {}) => handler({ request: req(path, { method: "DELETE", headers: { ...IP, ...headers } }), env });
const bearer = (token) => ({ Authorization: "Bearer " + token });

async function account(env, extra = {}) {
  return insertUser(env, { password_hash: await hashPassword(PASSWORD, env), account_id: "sam_" + Math.random().toString(36).slice(2, 8), display_name: "Sam", ...extra });
}

async function signIn(env, user, device = "Sam's laptop") {
  const res = await post(appLogin, env, "/api/app/login", { email: user.email, password: PASSWORD, client: "ks-c1", device });
  assert.equal(res.status, 200, await res.clone().text());
  return json(res);
}

const count = async (env, table, where = "1=1") => (await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).first()).c;

test("login: an app sign-in returns a token and the profile, and sets no cookie", async () => {
  const env = makeEnv();
  const user = await account(env);
  const res = await post(appLogin, env, "/api/app/login", { email: user.email, password: PASSWORD, client: "ks-c1", device: "Sam's laptop" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null, "an app session is not a cookie");
  const body = await json(res);
  assert.match(body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(body.profile.email, user.email);
  assert.equal(body.profile.accountId, user.account_id, "the profile carries the account ID the login query does not select");
  assert.equal(body.profile.displayName, "Sam");
  assert.deepEqual(body.plan, { id: "free", paid: false });
  for (const leaked of ["password_hash", "avatarUrl", "ksStocksEntitled", "subscriptionStatus"]) assert.ok(!JSON.stringify(body).includes(leaked), leaked);
  assert.ok(Date.parse(body.expiresAt) - Date.now() > (APP_SESSION_DAYS - 1) * 24 * 3600_000);
});

test("login: the token is stored hashed, never raw", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { token } = await signIn(env, user);
  const rows = (await env.DB.prepare("SELECT * FROM app_sessions").all()).results;
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows[0]).includes(token));
  assert.ok(!rows[0].id.includes(token.slice(0, 8)), "the public device id is not derived from the token");
});

test("login: signing in from the app leaves the website session and other devices alone", async () => {
  const env = makeEnv();
  const user = await account(env);
  const web = await createSession(env, user.id, true);
  const first = await signIn(env, user, "Desktop");
  const second = await signIn(env, user, "Laptop");
  const alive = async (token) => (await resolveAppSession(req("/", { headers: bearer(token) }), env)).user !== null;
  assert.equal(await alive(first.token), true, "a second device does not end the first");
  assert.equal(await alive(second.token), true);
  assert.equal((await resolveSession(req("/", { headers: { Cookie: "__Host-kanasaka_session=" + web.token } }), env)).user?.id, user.id, "the website session survives");
  // ...and the other way round: a website login does not end app devices.
  const res = await post(webLogin, env, "/api/auth/login", { email: user.email, password: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(await alive(first.token), true);
});

test("login: wrong credentials give the website's answer, an unknown app is refused, and nothing is created", async () => {
  const env = makeEnv();
  const user = await account(env);
  const wrong = await post(appLogin, env, "/api/app/login", { email: user.email, password: "Wrong-Password-1234!", client: "ks-c1" });
  assert.equal(wrong.status, 401);
  const web = await post(webLogin, env, "/api/auth/login", { email: user.email, password: "Wrong-Password-1234!" });
  assert.deepEqual(await json(wrong), await json(web));
  const other = await post(appLogin, env, "/api/app/login", { email: user.email, password: PASSWORD, client: "ks-link" });
  assert.equal(other.status, 400, "KS_Link has its own service and does not use these endpoints");
  assert.equal(await count(env, "app_sessions"), 0);
  const unverified = await account(env, { email_verified: 0 });
  assert.equal((await post(appLogin, env, "/api/app/login", { email: unverified.email, password: PASSWORD, client: "ks-c1" })).status, 401);
});

test("login: a browser on another site is refused, the same as everywhere else", async () => {
  const env = makeEnv();
  const user = await account(env);
  const res = await appLogin({ request: req("/api/app/login", { method: "POST", origin: "https://evil.example", body: { email: user.email, password: PASSWORD, client: "ks-c1" } }), env });
  assert.equal(res.status, 403);
});

test("login: the same failure throttle as the website protects the app path", async () => {
  const env = makeEnv();
  const user = await account(env);
  for (let i = 0; i < 8; i++) await post(appLogin, env, "/api/app/login", { email: user.email, password: "Wrong-Password-1234!", client: "ks-c1" });
  const blocked = await post(appLogin, env, "/api/app/login", { email: user.email, password: PASSWORD, client: "ks-c1" });
  assert.equal(blocked.status, 429, "the 9th try is refused even with the right password");
});

test("second step: password, then an authenticator code, then an app session; no session before the code", async () => {
  const env = makeEnv();
  const user = await account(env);
  const cookie = { Cookie: await sessionCookieFor(env, user.id) };
  const setup = await json(await post(totpSetup, env, "/api/account/two-factor/totp-setup", {}, cookie));
  assert.equal((await post(totpEnable, env, "/api/account/two-factor/totp-enable", { code: await generateTotpCode(setup.secret) }, cookie)).status, 200);

  const first = await post(appLogin, env, "/api/app/login", { email: user.email, password: PASSWORD, client: "ks-c1", device: "Phone" });
  const challenge = await json(first);
  assert.equal(challenge.twoFactorRequired, true);
  assert.equal(challenge.method, "totp");
  assert.equal(challenge.token, undefined, "no token until the second step");
  assert.equal(await count(env, "app_sessions"), 0);

  const bad = await post(appTwoFactor, env, "/api/app/two-factor", { challenge: challenge.challenge, code: "000000", client: "ks-c1", device: "Phone" });
  assert.equal(bad.status, 401);
  assert.equal(await count(env, "app_sessions"), 0);

  const code = await generateTotpCode(setup.secret, Date.now() + 30_000);
  const done = await post(appTwoFactor, env, "/api/app/two-factor", { challenge: challenge.challenge, code, client: "ks-c1", device: "Phone" });
  assert.equal(done.status, 200, await done.clone().text());
  assert.equal(done.headers.get("set-cookie"), null);
  const body = await json(done);
  assert.equal(body.profile.accountId, user.account_id);
  assert.equal(body.profile.twoFactorEnabled, true);
  assert.equal(await count(env, "app_sessions"), 1);
  assert.equal(typeof appTwoFactorSend, "function", "email-me-a-code is available on the app path");
});

test("session: a valid token returns the profile and device; bad, missing, expired, and unverified tokens do not", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { token } = await signIn(env, user);
  const ok = await get(appSession, env, "/api/app/session", bearer(token));
  assert.equal(ok.status, 200);
  const body = await json(ok);
  assert.equal(body.authenticated, true);
  assert.equal(body.profile.email, user.email);
  assert.equal(body.device.label, "Sam's laptop");

  assert.equal((await get(appSession, env, "/api/app/session")).status, 401);
  assert.equal((await get(appSession, env, "/api/app/session", bearer("x".repeat(43)))).status, 401);
  assert.equal((await get(appSession, env, "/api/app/session", { Cookie: await sessionCookieFor(env, user.id) })).status, 401, "a website cookie is not an app session");
  assert.equal((await get(appSession, env, "/api/app/session", { Authorization: "Basic " + token })).status, 401);

  await env.DB.prepare("UPDATE app_sessions SET expires_at = ?").bind(new Date(Date.now() - 60_000).toISOString()).run();
  assert.equal((await get(appSession, env, "/api/app/session", bearer(token))).status, 401, "expired");

  const fresh = await signIn(env, user);
  await env.DB.prepare("UPDATE users SET email_verified = 0 WHERE id = ?").bind(user.id).run();
  assert.equal((await get(appSession, env, "/api/app/session", bearer(fresh.token))).status, 401, "unverified");
});

test("session: the expiry slides, but a check inside the hour is not a write", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { token } = await signIn(env, user);
  const read = () => env.DB.prepare("SELECT last_used_at, expires_at FROM app_sessions").first();

  const before = await read();
  await get(appSession, env, "/api/app/session", bearer(token));
  assert.deepEqual(await read(), before, "used a moment ago: nothing written");

  await env.DB.prepare("UPDATE app_sessions SET last_used_at = datetime('now', '-2 hours'), expires_at = ?").bind(new Date(Date.now() + 3 * 24 * 3600_000).toISOString()).run();
  await get(appSession, env, "/api/app/session", bearer(token));
  const after = await read();
  assert.ok(Date.parse(after.expires_at) - Date.now() > (APP_SESSION_DAYS - 1) * 24 * 3600_000, "pushed out to about thirty days again");
});

test("logout: ends that device only, and is fine to repeat", async () => {
  const env = makeEnv();
  const user = await account(env);
  const a = await signIn(env, user, "A");
  const b = await signIn(env, user, "B");
  assert.equal((await post(appLogout, env, "/api/app/logout", {}, bearer(a.token))).status, 200);
  assert.equal((await get(appSession, env, "/api/app/session", bearer(a.token))).status, 401);
  assert.equal((await get(appSession, env, "/api/app/session", bearer(b.token))).status, 200);
  assert.equal((await post(appLogout, env, "/api/app/logout", {}, bearer(a.token))).status, 200);
  assert.equal((await post(appLogout, env, "/api/app/logout", {})).status, 200);
});

test("devices: an account sees its own devices, signs one out, or all the others; never someone else's", async () => {
  const env = makeEnv();
  const user = await account(env);
  const other = await account(env);
  const a = await signIn(env, user, "Desktop");
  await signIn(env, user, "Laptop");
  const theirs = await signIn(env, other, "Their phone");

  const listed = await json(await get(devicesGet, env, "/api/app/devices", bearer(a.token)));
  assert.equal(listed.devices.length, 2);
  assert.deepEqual(listed.devices.map((d) => d.label).sort(), ["Desktop", "Laptop"]);
  assert.equal(listed.devices.filter((d) => d.current).length, 1);
  assert.ok(!JSON.stringify(listed).includes("token"), "no token or hash in the list");
  assert.equal((await get(devicesGet, env, "/api/app/devices")).status, 401);

  const laptop = listed.devices.find((d) => d.label === "Laptop");
  const theirId = (await env.DB.prepare("SELECT id FROM app_sessions WHERE user_id = ?").bind(other.id).first()).id;
  assert.equal((await del(devicesDelete, env, "/api/app/devices?id=" + theirId, bearer(a.token))).status, 404, "not yours to sign out");
  assert.equal((await get(appSession, env, "/api/app/session", bearer(theirs.token))).status, 200);
  assert.equal((await del(devicesDelete, env, "/api/app/devices?id=" + laptop.id, bearer(a.token))).status, 200);
  assert.equal(await count(env, "app_sessions", "user_id = " + user.id), 1);

  await signIn(env, user, "Tablet");
  const others = await json(await del(devicesDelete, env, "/api/app/devices?others=1", bearer(a.token)));
  assert.equal(others.removed, 1);
  assert.equal((await get(appSession, env, "/api/app/session", bearer(a.token))).status, 200, "this device stays");
  assert.equal((await del(devicesDelete, env, "/api/app/devices", bearer(a.token))).status, 400);
});

test("devices: at most ten per account, and the least recently used one goes first", async () => {
  const env = makeEnv();
  const user = await account(env);
  const tokens = [];
  for (let i = 0; i < MAX_APP_DEVICES; i++) tokens.push((await createAppSession(env, { userId: user.id, client: "ks-c1", device: "D" + i })).token);
  // Make device 0 the one used most recently and device 1 the stalest.
  await env.DB.prepare("UPDATE app_sessions SET last_used_at = datetime('now', '-3 days') WHERE device_label = 'D1'").run();
  const extra = await createAppSession(env, { userId: user.id, client: "ks-c1", device: "Eleventh" });
  assert.equal(await count(env, "app_sessions", "user_id = " + user.id), MAX_APP_DEVICES);
  const alive = async (t) => (await resolveAppSession(req("/", { headers: bearer(t) }), env)).user !== null;
  assert.equal(await alive(tokens[1]), false, "the stalest was evicted");
  assert.equal(await alive(extra.token), true, "the new one is never the one evicted");
  assert.equal(await alive(tokens[0]), true);
});

test("revocation: a password reset, and deleting the account, end every app device", async () => {
  const env = makeEnv();
  const user = await account(env);
  const { token } = await signIn(env, user);
  await signIn(env, user, "Second");
  await createEmailToken(env, user.id, "reset", 10, "123456");
  const res = await post(resetPassword, env, "/api/auth/reset-password", { email: user.email, code: "123456", password: "Another-Long-Password-77!" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(await count(env, "app_sessions", "user_id = " + user.id), 0);
  assert.equal((await get(appSession, env, "/api/app/session", bearer(token))).status, 401);

  const gone = await account(env);
  await signIn(env, gone);
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(gone.id).run();
  assert.equal(await count(env, "app_sessions", "user_id = " + gone.id), 0, "deleting the user cascades");
  await deleteAllAppSessions(env, user.id);
});

test("admin: lookup lists a user's app devices, and signing one out or all of them works for an admin with two-factor", async () => {
  const env = makeEnv();
  const admin = await insertUser(env, { role: "admin", totp_enabled: 1 });
  const cookie = { Cookie: await sessionCookieFor(env, admin.id) };
  const user = await account(env);
  const { token } = await signIn(env, user, "Lost laptop");
  await signIn(env, user, "Desktop");

  const found = await json(await get(adminLookup, env, "/api/admin/lookup?q=" + encodeURIComponent(user.email), cookie));
  assert.equal(found.appDevices.length, 2);
  assert.ok(!JSON.stringify(found.appDevices).includes(token));

  const one = found.appDevices.find((d) => d.label === "Lost laptop");
  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: user.email, deviceId: one.id }, cookie)).status, 200);
  assert.equal((await get(appSession, env, "/api/app/session", bearer(token))).status, 401);
  const all = await json(await post(adminDevices, env, "/api/admin/app-devices", { q: user.email, all: true }, cookie));
  assert.equal(all.removed, 1);
  assert.equal(await count(env, "app_sessions", "user_id = " + user.id), 0);
  assert.equal(await count(env, "auth_events", "event_type = 'admin_app_devices_revoked'"), 2, "both are in the audit trail");

  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: "nobody@example.com", all: true }, cookie)).status, 404);
  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: user.email }, cookie)).status, 400);
});

test("admin: a normal account, an admin without two-factor, and a caller with no session are all refused", async () => {
  const env = makeEnv();
  const user = await account(env);
  await signIn(env, user);
  const asUser = { Cookie: await sessionCookieFor(env, user.id) };
  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: user.email, all: true }, asUser)).status, 403);
  const weak = await insertUser(env, { role: "admin", totp_enabled: 0 });
  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: user.email, all: true }, { Cookie: await sessionCookieFor(env, weak.id) })).status, 403);
  assert.equal((await post(adminDevices, env, "/api/admin/app-devices", { q: user.email, all: true })).status, 403);
  assert.equal(await count(env, "app_sessions"), 1, "nothing was signed out");
});

test("helpers: bearer parsing, device labels, and the client list", () => {
  const r = (h) => new Request("https://kanasaka.com/", { headers: h ? { Authorization: h } : {} });
  assert.equal(bearerToken(r("Bearer " + "a".repeat(43))), "a".repeat(43));
  for (const bad of ["", "Bearer", "Bearer short", "bearer " + "a".repeat(43), "Basic " + "a".repeat(43), "Bearer " + "a".repeat(43) + " extra", "Bearer " + "a".repeat(200)]) assert.equal(bearerToken(r(bad)), null, bad);
  assert.equal(cleanDeviceLabel("  Sam's\n\tlaptop  "), "Sam's laptop");
  assert.equal(cleanDeviceLabel(""), "Unknown device");
  assert.equal(cleanDeviceLabel("x".repeat(200)).length, 60);
  assert.equal(cleanDeviceLabel("a\u0000b\u007fc"), "a b c");
});

test("a device name is text in the sign-in notification email, never markup", async () => {
  const { sendLoginNotificationEmail } = await import("../functions/lib/email.js");
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body).html);
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  };
  try {
    const evil = 'Laptop <a href="https://evil.example">Secure your account</a> & "co"';
    await sendLoginNotificationEmail({ RESEND_API_KEY: "k", SITE_URL: "https://kanasaka.com" }, "a@b.co", {
      success: true,
      reason: "Signed in to the KS-C1 app on " + cleanDeviceLabel(evil) + ".",
      location: "<b>x</b>",
      securityPhrase: "<i>phrase</i>",
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 1);
  assert.ok(!/<a href|<b>x|<i>phrase/.test(sent[0]), sent[0]);
  assert.ok(sent[0].includes("&lt;a href=&quot;https://evil.example&quot;&gt;"), "shown literally");
});

test("before migration 021 an app sign-in is refused up front, so nothing is consumed", async () => {
  const env = makeEnv();
  env.DB.raw.exec("DROP TABLE app_sessions");
  const { clearAuthSchemaCache } = await import("../functions/lib/schema.js");
  clearAuthSchemaCache();
  const user = await insertUser(env, { password_hash: await hashPassword(PASSWORD, env) });
  const res = await appLogin({ request: req("/api/app/login", { method: "POST", body: { email: user.email, password: PASSWORD, client: "ks-c1", device: "t" } }), env, waitUntil() {} });
  assert.equal(res.status, 503);
  assert.match((await json(res)).error, /not available yet/i);
  const two = await appTwoFactor({ request: req("/api/app/two-factor", { method: "POST", body: { challenge: "c", code: "123456", client: "ks-c1" } }), env, waitUntil() {} });
  assert.equal(two.status, 503);
});
