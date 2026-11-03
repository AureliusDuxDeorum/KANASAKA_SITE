import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestGet as diagnostics } from "../functions/api/admin/diagnostics.js";
import { onRequestPost as selfTest } from "../functions/api/admin/self-test.js";
import { collectStatus } from "../functions/lib/diagnostics.js";
import { runSelfTests } from "../functions/lib/self-test.js";
import { logEvent } from "../functions/lib/throttle.js";
import { insertUser, json, makeEnv, ORIGIN, req, sessionCookieFor } from "./helpers.mjs";

const SECRETS = {
  SESSION_SECRET: "super-secret-session-value-0123456789abcdef",
  ADMIN_SECRET: "super-secret-admin-value-0123456789abcdef0123",
  STRIPE_SECRET_KEY: "sk_live_should_never_leak",
  STRIPE_WEBHOOK_SECRET: "whsec_should_never_leak",
  RESEND_API_KEY: "re_should_never_leak",
};

async function adminCookie(env, { twoFactor = true } = {}) {
  const admin = await insertUser(env, { role: "admin", totp_enabled: twoFactor ? 1 : 0 });
  return { admin, cookie: await sessionCookieFor(env, admin.id) };
}

const get = (handler, env, path, cookie) =>
  handler({ request: req(path, { headers: cookie ? { Cookie: cookie } : {} }), env });

test("status: anonymous and non-admin callers are refused", async () => {
  const env = makeEnv(SECRETS);
  assert.equal((await get(diagnostics, env, "/api/admin/diagnostics")).status, 403);

  const user = await insertUser(env, { role: "user", totp_enabled: 1 });
  const cookie = await sessionCookieFor(env, user.id);
  assert.equal((await get(diagnostics, env, "/api/admin/diagnostics", cookie)).status, 403);
});

test("status: an admin without 2FA is refused", async () => {
  const env = makeEnv(SECRETS);
  const { cookie } = await adminCookie(env, { twoFactor: false });
  const res = await get(diagnostics, env, "/api/admin/diagnostics", cookie);
  assert.equal(res.status, 403);
  assert.match((await json(res)).error, /two-factor/i);
});

test("status: an admin with 2FA gets a report that never contains a secret value", async () => {
  const env = makeEnv(SECRETS);
  const { cookie } = await adminCookie(env);
  const res = await get(diagnostics, env, "/api/admin/diagnostics", cookie);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /no-store/);

  const text = await res.text();
  for (const secret of Object.values(SECRETS)) assert.ok(!text.includes(secret), "leaked " + secret.slice(0, 8));

  const report = JSON.parse(text);
  const ids = report.groups.flatMap((g) => g.checks.map((c) => c.id));
  for (const id of ["SESSION_SECRET", "STRIPE_WEBHOOK_SECRET", "db-reach", "db-tables", "waf"]) assert.ok(ids.includes(id), id);
  assert.equal(report.summary.fail, 0);
  const warned = report.groups.flatMap((g) => g.checks).filter((c) => c.status === "warn").map((c) => c.id).sort();
  assert.deepEqual(warned, ["ARGON2", "INSTALLERS"], "fixture has no R2 bucket and uses cheap Argon2 settings");
});

test("status: missing configuration is reported as FAIL, not hidden", async () => {
  const env = makeEnv({ SESSION_SECRET: "", RESEND_API_KEY: undefined });
  const report = await collectStatus(env);
  const by = Object.fromEntries(report.groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  assert.equal(by.SESSION_SECRET.status, "fail");
  assert.equal(by.RESEND_API_KEY.status, "fail");
  assert.equal(by.STRIPE_WEBHOOK_SECRET.status, "fail");
  assert.equal(by.INSTALLERS.status, "warn");
  assert.equal(by["db-reach"].status, "ok");
  assert.equal(by["db-tables"].status, "ok");
  assert.equal(by.waf.status, "manual");
});

test("status: weak or short secrets are warnings", async () => {
  const report = await collectStatus(makeEnv({ ...SECRETS, SESSION_SECRET: "short" }));
  const by = Object.fromEntries(report.groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  assert.equal(by.SESSION_SECRET.status, "warn");
});

test("status: reports missing tables and a dead database as failures", async () => {
  const env = makeEnv(SECRETS);
  env.DB.raw.exec("DROP TABLE legal_notices");
  let by = Object.fromEntries((await collectStatus(env)).groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  assert.equal(by["db-tables"].status, "fail");
  assert.match(by["db-tables"].detail, /legal_notices/);

  const dead = { ...SECRETS, DB: { prepare() { throw new Error("D1_ERROR: connection lost"); } } };
  const quiet = console.error;
  console.error = () => {};
  try {
    const report = await collectStatus(dead);
    by = Object.fromEntries(report.groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  } finally {
    console.error = quiet;
  }
  assert.equal(by["db-reach"].status, "fail");
  assert.ok(!by["db-reach"].detail.includes("D1_ERROR"), "raw database error must not reach the panel");
});

test("status: 24h activity counts and admin-without-2FA warning", async () => {
  const env = makeEnv(SECRETS);
  for (let i = 0; i < 3; i += 1) await logEvent(env, "login_failed", { ip: "1.1.1.1" });
  await insertUser(env, { role: "admin", totp_enabled: 0 });
  const by = Object.fromEntries((await collectStatus(env)).groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  assert.equal(by["act-login_failed"].detail, "3");
  assert.equal(by["admins-2fa"].status, "warn");
});

test("status: reading the report purges events past the retention window", async () => {
  const env = makeEnv(SECRETS);
  const { cookie } = await adminCookie(env);
  await env.DB.prepare("INSERT INTO auth_events (event_type, meta, created_at) VALUES ('ancient', '{}', datetime('now', '-400 days'))").run();
  await get(diagnostics, env, "/api/admin/diagnostics", cookie);
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM auth_events WHERE event_type = 'ancient'").first();
  assert.equal(row.c, 0);
});

test("status: reads are throttled", async () => {
  const env = makeEnv(SECRETS);
  const { admin, cookie } = await adminCookie(env);
  for (let i = 0; i < 30; i += 1) await logEvent(env, "admin_diagnostics_viewed", { email: admin.email });
  assert.equal((await get(diagnostics, env, "/api/admin/diagnostics", cookie)).status, 429);
});

// --- live self-test -------------------------------------------------------

function siteFetch({ csp = "default-src 'self'; script-src 'self'; frame-ancestors 'none'", apiNosniff = true, csrf = 403, admin = 403 } = {}) {
  return async (url, init = {}) => {
    const { pathname } = new URL(url);
    const headers = new Headers();
    if (pathname === "/") {
      if (csp) headers.set("content-security-policy", csp);
      headers.set("x-content-type-options", "nosniff");
      headers.set("strict-transport-security", "max-age=31536000");
      headers.set("x-frame-options", "DENY");
      return new Response("<html></html>", { status: 200, headers });
    }
    if (pathname.startsWith("/api/admin/")) return new Response("{}", { status: admin });
    if (init.method === "POST") return new Response("{}", { status: csrf });
    if (apiNosniff) headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", "no-store");
    return new Response("{}", { status: 200, headers });
  };
}

const byId = (report) => Object.fromEntries(report.results.map((r) => [r.id, r]));

test("self-test: a healthy deployment passes every check it can run", async () => {
  const env = makeEnv(SECRETS);
  const report = await runSelfTests(env, { origin: ORIGIN, fetchImpl: siteFetch() });
  const failed = report.results.filter((r) => r.status === "fail");
  assert.deepEqual(failed, []);
  assert.equal(report.summary.fail, 0);
  assert.ok(report.summary.pass >= 12, "ran " + report.summary.pass);
  assert.equal(byId(report)["stripe-signature"].status, "pass");
  assert.equal(byId(report)["argon2"].status, "pass");
});

test("self-test: leaves no probe rows behind", async () => {
  const env = makeEnv(SECRETS);
  await runSelfTests(env, { origin: ORIGIN, fetchImpl: siteFetch() });
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM auth_events WHERE event_type LIKE 'selftest_%'").first();
  assert.equal(row.c, 0);
});

test("self-test: skips what it cannot run instead of failing", async () => {
  const env = makeEnv({ ...SECRETS, STRIPE_WEBHOOK_SECRET: undefined });
  const report = await runSelfTests(env, { origin: ORIGIN, fetchImpl: async () => { throw new Error("offline"); } });
  const r = byId(report);
  assert.equal(r["stripe-signature"].status, "skip");
  assert.equal(r["http-static-headers"].status, "skip");
  assert.equal(report.summary.fail, 0);
});

test("self-test: catches a missing CSP, missing API headers, open CSRF and open admin routes", async () => {
  const env = makeEnv(SECRETS);
  const bad = await runSelfTests(env, { origin: ORIGIN, fetchImpl: siteFetch({ csp: "", apiNosniff: false, csrf: 200, admin: 200 }) });
  const r = byId(bad);
  for (const id of ["http-static-headers", "http-api-headers", "http-csrf", "http-admin-gate"]) {
    assert.equal(r[id].status, "fail", id);
  }

  const unsafe = await runSelfTests(env, { origin: ORIGIN, fetchImpl: siteFetch({ csp: "script-src 'self' 'unsafe-inline'" }) });
  assert.equal(byId(unsafe)["http-static-headers"].status, "fail");
});

test("self-test endpoint: admin-only, POST, and rate limited", async () => {
  const env = makeEnv(SECRETS);
  const anon = await selfTest({ request: req("/api/admin/self-test", { method: "POST", body: {} }), env });
  assert.equal(anon.status, 403);

  const { admin, cookie } = await adminCookie(env);
  const forbiddenOrigin = await selfTest({ request: req("/api/admin/self-test", { method: "POST", body: {}, origin: "https://evil.example", headers: { Cookie: cookie } }), env });
  assert.equal(forbiddenOrigin.status, 403);

  for (let i = 0; i < 6; i += 1) await logEvent(env, "admin_self_test_run", { email: admin.email });
  const limited = await selfTest({ request: req("/api/admin/self-test", { method: "POST", body: {}, headers: { Cookie: cookie } }), env });
  assert.equal(limited.status, 429);
});
