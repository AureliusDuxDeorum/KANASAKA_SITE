// Guards the things the site's Content-Security-Policy and routing rules rely
// on, so a change that would only break in the browser (or silently open a
// hole) fails here first.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const html = tracked.filter((f) => f.endsWith(".html"));
const js = tracked.filter((f) => f.startsWith("assets/js/") && f.endsWith(".js"));
const functions = tracked.filter((f) => f.startsWith("functions/") && f.endsWith(".js") && !f.startsWith("functions/vendor/"));

function headersFor(pattern) {
  const lines = read("_headers").split("\n");
  const out = {};
  let active = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { active = line.trim() === pattern; continue; }
    if (active) {
      const i = line.indexOf(":");
      out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

test("_headers: CSP forbids inline code, plugins and framing", () => {
  const csp = headersFor("/*")["content-security-policy"];
  assert.ok(csp, "CSP present");
  const directive = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) || "");

  assert.equal(directive("script-src"), "script-src 'self'");
  assert.equal(directive("style-src"), "style-src 'self'");
  assert.equal(directive("object-src"), "object-src 'none'");
  assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive("connect-src"), "connect-src 'self'");
  assert.equal(directive("base-uri"), "base-uri 'self'");
  assert.equal(directive("form-action"), "form-action 'self'");
  assert.ok(!/unsafe-(inline|eval)/.test(csp), "no unsafe-* anywhere");
  assert.ok(!/https?:\/\//.test(csp), "no third-party origins");
  assert.ok(csp.includes("upgrade-insecure-requests"));
});

test("_headers: baseline security headers", () => {
  const h = headersFor("/*");
  assert.match(h["strict-transport-security"], /max-age=\d{8,}/);
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["x-frame-options"], "DENY");
  assert.ok(h["referrer-policy"]);
  assert.ok(h["permissions-policy"]);
});

test("pages contain nothing the CSP would block: no inline scripts, handlers, <style> or style=", () => {
  for (const file of html) {
    const text = read(file);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(text), file + ": inline <script>");
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(text), file + ": inline event handler");
    assert.ok(!/<style[\s>]/i.test(text), file + ": <style> block");
    assert.ok(!/\sstyle\s*=/i.test(text), file + ": style attribute");
    assert.ok(!/javascript:/i.test(text), file + ": javascript: URL");
  }
});

test("scripts do not emit inline style attributes or evaluate strings", () => {
  for (const file of js) {
    const text = read(file);
    assert.ok(!/style\s*=\s*\\?["']/.test(text), file + ": writes a style attribute");
    assert.ok(!/setAttribute\(\s*["']style["']/.test(text), file + ": setAttribute('style')");
    assert.ok(!/\beval\(|new Function\(/.test(text), file + ": eval / new Function");
    assert.ok(!/document\.write\(/.test(text), file + ": document.write");
  }
});

test("no third-party hosts are loaded by pages, scripts or styles", () => {
  const files = [...html, ...js, ...tracked.filter((f) => f.endsWith(".css"))];
  for (const file of files) {
    // resources the browser fetches on its own -- plain <a href> links to other
    // sites (legal references) are fine
    const hits = [...read(file).matchAll(/<(?:script|img|iframe|source|video|audio|embed|object|link)\b[^>]*?\b(?:src|href|data)\s*=\s*["'](?:https?:)?\/\/(?!kanasaka\.com)[^"']+/gi)];
    const loaded = hits.filter((m) => !/rel=["']?(canonical|alternate)/.test(m[0]));
    assert.equal(loaded.length, 0, file + ": " + (loaded[0] && loaded[0][0]));
    assert.ok(!/@import\s+url\(\s*["']?https?:/i.test(read(file)), file + ": remote @import");
  }
});

test("every state-changing API route checks the origin (middleware is the backstop, this is the contract)", () => {
  const exempt = new Set(["functions/api/stripe/webhook.js"]);
  for (const file of functions.filter((f) => f.startsWith("functions/api/") && !f.endsWith("_middleware.js"))) {
    const text = read(file);
    if (!/onRequest(Post|Put|Patch|Delete)\b/.test(text)) continue;
    if (exempt.has(file)) continue;
    assert.ok(/requireSameOrigin|assertSameOrigin/.test(text), file + " lacks a same-origin check");
  }
});

test("API handlers never echo raw error messages to the client", () => {
  for (const file of functions.filter((f) => f.startsWith("functions/api/"))) {
    const text = read(file);
    assert.ok(!/errorResponse\(\s*(err|error)\.message/.test(text), file + ": returns err.message directly");
    assert.ok(!/["']\s*\+\s*\(?(err|error)\.message/.test(text), file + ": concatenates err.message into a response");
  }
});

test("admin endpoints are gated", () => {
  // cancel-role-change is the emailed "this wasn't me" link: the long random
  // single-use token is its credential, so it is deliberately session-less.
  const tokenOnly = new Set(["functions/api/admin/cancel-role-change.js"]);
  for (const file of functions.filter((f) => f.startsWith("functions/api/admin/") && !tokenOnly.has(f))) {
    assert.ok(/requireAdminAccess|requireAdmin\(/.test(read(file)), file + " has no admin gate");
  }
});

test("session cookie keeps its hardening", () => {
  const auth = read("functions/lib/auth.js");
  assert.ok(auth.includes('"__Host-kanasaka_session"'));
  assert.ok(/HttpOnly; Secure; SameSite=Strict/.test(auth));
});

test("expiry comparisons use datetime() on both sides (ISO strings vs datetime('now'))", () => {
  for (const file of functions) {
    const text = read(file);
    assert.ok(!/[^(]\bexpires_at\s*[<>]=?\s*datetime\('now'\)/.test(text.replace(/datetime\([\w.]*expires_at\)/g, "")), file + ": raw expires_at comparison");
  }
});

test("no secrets are committed", () => {
  const patterns = [/sk_live_[0-9A-Za-z]{10,}/, /sk_test_[0-9A-Za-z]{10,}/, /whsec_[0-9A-Za-z]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /re_[A-Za-z0-9]{20,}/, /gh[pousr]_[A-Za-z0-9]{30,}/];
  for (const file of tracked) {
    if (/\.(png|jpg|jpeg|webp|ico|ttf|woff2?|wasm|exe)$/i.test(file)) continue;
    const text = read(file);
    for (const pattern of patterns) assert.ok(!pattern.test(text), file + " matches " + pattern);
  }
});

test("security.txt and robots.txt are published", () => {
  assert.match(read(".well-known/security.txt"), /^Contact: mailto:/m);
  assert.match(read(".well-known/security.txt"), /^Expires: /m);
  assert.match(read("robots.txt"), /Disallow: \/api\//);
});
