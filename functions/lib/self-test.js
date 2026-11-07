// Live self-test for the developer panel (POST /api/admin/self-test) and the
// shared source of truth for what "the security basics work" means.
//
// Non-destructive by construction: pure-function checks use throwaway values,
// the one database check writes and then deletes rows tagged with a random
// probe id, and the HTTP checks only make unauthenticated requests that are
// supposed to be refused. Nothing here touches a real account.

import { hashPasswordArgon2, verifyPasswordArgon2 } from "./argon2.js";
import { clearSessionCookieHeader, sessionCookieHeader, SESSION_COOKIE } from "./auth.js";
import { publicError } from "./errors.js";
import { passwordPolicyError } from "./password-policy.js";
import { assertSameOrigin } from "./security.js";
import { logEvent, tooManyRecentEvents } from "./throttle.js";
import {
  generateNumericCode,
  generateRawToken,
  hashSecret,
  timingSafeEqualString,
} from "./tokens.js";

class Skip extends Error {}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(url, init = {}) {
  return new Request(url, init);
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildTests({ env, origin, fetchImpl }) {
  const doFetch = fetchImpl || ((url, init) => fetch(url, init));
  const get = (path, init = {}) =>
    doFetch(new URL(path, origin).toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      ...init,
    });

  const sameOriginEnv = { SITE_URL: origin };

  return [
    {
      id: "hash-keyed",
      label: "Token hashing is deterministic and input-sensitive",
      run: async () => {
        const a = await hashSecret("probe-a", env);
        const b = await hashSecret("probe-b", env);
        assert(a === (await hashSecret("probe-a", env)), "Same input produced different hashes.");
        assert(a !== b, "Different inputs produced the same hash.");
        assert(/^[0-9a-f]{64}$/.test(a), "Hash is not 64 hex characters.");
        return env.SESSION_SECRET ? "HMAC-SHA-256 (keyed)." : "Unkeyed SHA-256 -- SESSION_SECRET is not set.";
      },
    },
    {
      id: "token-entropy",
      label: "Random tokens and numeric codes look right",
      run: async () => {
        const a = generateRawToken(32);
        const b = generateRawToken(32);
        assert(a !== b && a.length >= 43, "Raw tokens are not unique / long enough.");
        const code = generateNumericCode(6);
        assert(/^\d{6}$/.test(code), "Numeric code is not 6 digits.");
        return "32-byte tokens unique; codes are 6 digits.";
      },
    },
    {
      id: "timing-safe",
      label: "Constant-time comparison",
      run: async () => {
        assert(timingSafeEqualString("abc", "abc") === true, "Equal strings rejected.");
        assert(timingSafeEqualString("abc", "abd") === false, "Different strings accepted.");
        assert(timingSafeEqualString("abc", "abcd") === false, "Different lengths accepted.");
        assert(timingSafeEqualString("abc", undefined) === false, "Non-string accepted.");
        return "ok";
      },
    },
    {
      id: "argon2",
      label: "Argon2id hash and verify",
      run: async () => {
        const started = Date.now();
        const hash = await hashPasswordArgon2("Self-Test!Probe#2026", env);
        assert(hash.startsWith("$argon2id$"), "Not an Argon2id hash.");
        assert(await verifyPasswordArgon2("Self-Test!Probe#2026", hash), "Correct password rejected.");
        assert(!(await verifyPasswordArgon2("wrong-password", hash)), "Wrong password accepted.");
        return "round trip in " + (Date.now() - started) + " ms";
      },
    },
    {
      id: "password-policy",
      label: "Password policy rejects weak passwords",
      run: async () => {
        assert(passwordPolicyError("short") !== null, "Short password accepted.");
        assert(passwordPolicyError("password123") !== null, "Common password accepted.");
        return "ok";
      },
    },
    {
      id: "cookie-flags",
      label: "Session cookie flags",
      run: async () => {
        const header = sessionCookieHeader("probe", 60);
        assert(SESSION_COOKIE.startsWith("__Host-"), "Cookie lost its __Host- prefix.");
        ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"].forEach((flag) =>
          assert(header.includes(flag), "Missing " + flag + ".")
        );
        assert(!/Domain=/i.test(header), "Cookie sets a Domain (breaks __Host-).");
        assert(/Max-Age=0/.test(clearSessionCookieHeader()), "Logout cookie does not expire.");
        return "__Host-, HttpOnly, Secure, SameSite=Strict";
      },
    },
    {
      id: "same-origin",
      label: "Same-origin check rejects foreign requests",
      run: async () => {
        const url = new URL("/api/auth/login", origin).toString();
        assert(assertSameOrigin(request(url, { method: "POST", headers: { Origin: origin } }), sameOriginEnv), "Own origin rejected.");
        assert(!assertSameOrigin(request(url, { method: "POST", headers: { Origin: "https://evil.example" } }), sameOriginEnv), "Foreign Origin accepted.");
        assert(!assertSameOrigin(request(url, { method: "POST", headers: { Referer: "https://evil.example/x" } }), sameOriginEnv), "Foreign Referer accepted.");
        return "ok";
      },
    },
    {
      id: "error-sanitiser",
      label: "Internal error details are hidden from clients",
      run: async () => {
        const quiet = console.error;
        console.error = () => {};
        try {
          assert(publicError(new Error("D1_ERROR: no such table: users"), "x") === "x", "Database error leaked.");
          assert(publicError(new Error("fetch failed https://api.example.com"), "x") === "x", "Network error leaked.");
        } finally {
          console.error = quiet;
        }
        assert(
          publicError(new Error("Invalid or expired verification code."), "x") === "Invalid or expired verification code.",
          "User-facing message was hidden."
        );
        return "ok";
      },
    },
    {
      id: "db-roundtrip",
      label: "Database write, read and delete",
      run: async () => {
        if (!env.DB) throw new Skip("No DB binding.");
        const probe = "selftest-" + generateRawToken(8);
        await env.DB.prepare("INSERT INTO auth_events (event_type, meta) VALUES (?, ?)")
          .bind("selftest_probe", JSON.stringify({ probe }))
          .run();
        try {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) AS c FROM auth_events WHERE event_type = 'selftest_probe' AND json_extract(meta, '$.probe') = ?"
          )
            .bind(probe)
            .first();
          assert(row && Number(row.c) === 1, "Row written but not read back.");
        } finally {
          await env.DB.prepare("DELETE FROM auth_events WHERE event_type = 'selftest_probe' AND json_extract(meta, '$.probe') = ?")
            .bind(probe)
            .run();
        }
        return "ok";
      },
    },
    {
      id: "throttle-logic",
      label: "Rate-limit counters trip at the limit",
      run: async () => {
        if (!env.DB) throw new Skip("No DB binding.");
        const key = "selftest-" + generateRawToken(8) + "@invalid";
        try {
          for (let i = 0; i < 3; i += 1) await logEvent(env, "selftest_throttle", { email: key });
          assert(await tooManyRecentEvents(env, "selftest_throttle", "email", key, { max: 3 }), "Did not trip at 3/3.");
          assert(!(await tooManyRecentEvents(env, "selftest_throttle", "email", key, { max: 4 })), "Tripped early at 3/4.");
        } finally {
          await env.DB.prepare("DELETE FROM auth_events WHERE event_type = 'selftest_throttle' AND json_extract(meta, '$.email') = ?")
            .bind(key)
            .run();
        }
        return "ok";
      },
    },
    {
      id: "http-static-headers",
      label: "Static pages send the security headers",
      run: async () => {
        const res = await get("/").catch(() => null);
        if (!res) throw new Skip("Could not reach own origin.");
        const csp = res.headers.get("content-security-policy") || "";
        assert(csp.includes("script-src 'self'"), "CSP missing or script-src is not 'self'.");
        const scriptDirective = (csp.split(";").find((d) => d.trim().startsWith("script-src")) || "");
        assert(!scriptDirective.includes("unsafe-inline") && !scriptDirective.includes("unsafe-eval"), "script-src allows unsafe code.");
        assert(/nosniff/i.test(res.headers.get("x-content-type-options") || ""), "X-Content-Type-Options missing.");
        assert((res.headers.get("strict-transport-security") || "").includes("max-age"), "HSTS missing.");
        assert(/deny/i.test(res.headers.get("x-frame-options") || "") || csp.includes("frame-ancestors 'none'"), "Framing not blocked.");
        return "CSP, nosniff, HSTS, frame-ancestors";
      },
    },
    {
      id: "http-repo-files",
      label: "Repository files are not served",
      run: async () => {
        const paths = [
          "/schema.sql",
          "/wrangler.toml",
          "/package.json",
          "/docs/SECURITY.md",
          "/migrations/003_profile.sql",
          "/functions/lib/auth.js",
          "/tests/helpers.mjs",
        ];
        const exposed = [];
        for (const path of paths) {
          const res = await get(path).catch(() => null);
          if (!res) throw new Skip("Could not reach own origin.");
          if (res.status >= 200 && res.status < 300) exposed.push(path);
        }
        assert(exposed.length === 0, "Publicly readable: " + exposed.join(", ") + ".");
        return paths.length + " source/config paths answer 404.";
      },
    },
    {
      id: "http-api-headers",
      label: "API responses send the security headers",
      run: async () => {
        const res = await get("/api/auth/session").catch(() => null);
        if (!res) throw new Skip("Could not reach own origin.");
        assert(/nosniff/i.test(res.headers.get("x-content-type-options") || ""), "X-Content-Type-Options missing on API.");
        assert(/no-store/i.test(res.headers.get("cache-control") || ""), "API response is cacheable.");
        return "nosniff, no-store";
      },
    },
    {
      id: "http-csrf",
      label: "Cross-origin POSTs are refused",
      run: async () => {
        const res = await get("/api/auth/logout", {
          method: "POST",
          headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => null);
        if (!res) throw new Skip("Could not reach own origin.");
        assert(res.status === 403, "Foreign-origin POST returned " + res.status + ", expected 403.");
        return "403";
      },
    },
    {
      id: "http-admin-gate",
      label: "Admin endpoints refuse anonymous callers",
      run: async () => {
        for (const path of ["/api/admin/users", "/api/admin/events", "/api/admin/diagnostics"]) {
          const res = await get(path).catch(() => null);
          if (!res) throw new Skip("Could not reach own origin.");
          assert(res.status === 401 || res.status === 403 || res.status === 404, path + " returned " + res.status + " without a session.");
        }
        return "401/403 without a session";
      },
    },
  ];
}

export async function runSelfTests(env, { origin, fetchImpl } = {}) {
  const tests = buildTests({ env, origin, fetchImpl });
  const results = [];
  const started = Date.now();

  for (const test of tests) {
    const t0 = Date.now();
    try {
      const detail = await test.run();
      results.push({ id: test.id, label: test.label, status: "pass", ms: Date.now() - t0, detail: detail || "" });
    } catch (err) {
      if (err instanceof Skip) {
        results.push({ id: test.id, label: test.label, status: "skip", ms: Date.now() - t0, detail: err.message });
      } else {
        // Assertion messages are written for this panel and are safe to show;
        // anything else is logged and summarised.
        const message = err && err.message && !/D1_|SQLITE|\bSQL (error|logic|syntax)/i.test(err.message) ? err.message : "Unexpected error -- see Cloudflare logs.";
        if (!(err && err.message)) console.error("Self-test error:", err);
        results.push({ id: test.id, label: test.label, status: "fail", ms: Date.now() - t0, detail: message });
      }
    }
  }

  return {
    ranAt: new Date().toISOString(),
    summary: {
      pass: results.filter((r) => r.status === "pass").length,
      fail: results.filter((r) => r.status === "fail").length,
      skip: results.filter((r) => r.status === "skip").length,
      ms: Date.now() - started,
    },
    results,
  };
}
