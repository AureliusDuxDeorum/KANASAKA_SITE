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
    assert.ok(!/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>\s*\S/i.test(text), file + ": inline <script>");
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

// ── design system guards (docs/DESIGN.md) ────────────────────────────────

const css = tracked.filter((f) => f.startsWith("assets/css/") && f.endsWith(".css"));

function pageFile(href) {
  const clean = href.split("#")[0].split("?")[0];
  return clean.replace(/^\//, "") + "index.html";
}

test("navigation and footer only link to real, indexable pages", () => {
  const main = read("assets/js/shell.js");
  const hrefs = [...new Set([...main.matchAll(/href:\s*"(\/[^"#]*)/g)].map((m) => m[1]))];
  assert.ok(hrefs.length >= 8, "found the nav/footer links");
  for (const href of hrefs) {
    const file = pageFile(href);
    assert.ok(fs.existsSync(path.join(ROOT, file)), href + " has no page");
    const text = read(file);
    assert.ok(!/name="robots" content="noindex"/.test(text), href + " is noindex but linked from the nav");
    assert.ok(!/This section is in development/.test(text), href + " is a stub but linked from the nav");
  }
});

test("every unfinished page is marked noindex and uses the shared template", () => {
  for (const file of html.filter((f) => /This section is in development/.test(read(f)))) {
    const text = read(file);
    assert.ok(/name="robots" content="noindex"/.test(text), file + " should be noindex");
    assert.ok(text.includes('class="page-header"') && text.includes('class="callout"'), file + " should use the template");
    assert.ok(!text.includes("coming-soon-box"), file + " still uses the old Coming Soon box");
  }
});

test("every page loads tokens.css before the other stylesheets, plus components.css", () => {
  for (const file of html) {
    const text = read(file);
    const order = ["tokens.css", "style.css", "redesign.css", "components.css"].map((n) => text.indexOf("/assets/css/" + n));
    assert.ok(order.every((i) => i > -1), file + " is missing a stylesheet");
    assert.deepEqual([...order].sort((a, b) => a - b), order, file + ": stylesheet order");
  }
});

test("fonts: every @font-face and preload points at a file that exists", () => {
  const refs = new Set();
  for (const file of css) for (const m of read(file).matchAll(/url\("?(\/assets\/fonts\/[^")]+)"?\)/g)) refs.add(m[1]);
  for (const file of html) for (const m of read(file).matchAll(/href="(\/assets\/fonts\/[^"]+)"/g)) refs.add(m[1]);
  assert.ok(refs.size >= 2);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(ROOT, ref.slice(1))), ref + " is missing");
  assert.ok(read("assets/css/style.css").includes('font-family: "Inter"'), "Inter must be loaded, not assumed installed");
});

test("type scale: no new off-scale font sizes, tracking or radii", () => {
  const allowedSize = new Set(["50px", "30px", "28px", "22px", "20px", "16px", "13px", "12px", "10px", "1.8rem", "0.95rem"]);
  const allowedTracking = new Set(["0.06em", "0.2em", "0.1em", "0.08em"]);
  for (const file of css.filter((f) => !f.endsWith("tokens.css"))) {
    const text = read(file);
    for (const m of text.matchAll(/font-size:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v.startsWith("var(") || v.startsWith("clamp(") || v.startsWith("inherit")) continue;
      assert.ok(allowedSize.has(v), file + ": font-size " + v + " is not on the scale (use a --text-* token)");
    }
    for (const m of text.matchAll(/letter-spacing:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (v.startsWith("var(") || v === "0" || v === "normal") continue;
      assert.ok(allowedTracking.has(v), file + ": letter-spacing " + v + " is not a token");
    }
    for (const m of text.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim();
      assert.ok(/^(0|var\(--radius(-round)?\)|0 [^;]*)$/.test(v) || v === "50%", file + ": border-radius " + v + " (use --radius)");
    }
  }
});

test("status colours come from tokens, not literals", () => {
  for (const file of css.filter((f) => !f.endsWith("tokens.css"))) {
    assert.ok(!/#e5484d/i.test(read(file)), file + ": use var(--color-danger)");
  }
});

test("unreleased product areas are not advertised anywhere public", () => {
  // Robotics and biotech are still in development: no mention in pages, nav,
  // footer or scripts until they are announced (remove this test then).
  const files = [...html, ...js, ".well-known/security.txt", "site.webmanifest"].filter((f) => tracked.includes(f));
  for (const file of files) {
    assert.ok(!/robotic|bio-?tech/i.test(read(file)), file + " mentions an unreleased product area");
  }
});

// ── motion guards (docs/DESIGN.md > Motion) ──────────────────────────────

test("every page loads motion.css after components.css, and main.js loads the motion layer", () => {
  for (const file of html) {
    const text = read(file);
    const a = text.indexOf("/assets/css/components.css");
    const b = text.indexOf("/assets/css/motion.css");
    assert.ok(a > -1 && b > a, file + ": motion.css must follow components.css");
  }
  assert.ok(read("assets/js/main.js").includes("/assets/js/motion.js"), "main.js must load motion.js");
});

test("keyframes only animate cheap properties", () => {
  const forbidden = /(^|[;{\s])(filter|backdrop-filter|box-shadow|width|height|top|left|right|bottom|margin[a-z-]*|padding[a-z-]*|font-size|letter-spacing)\s*:/;
  for (const file of css) {
    for (const m of read(file).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) {
      assert.ok(!forbidden.test(m[2]), file + ": @keyframes " + m[1] + " animates a layout/paint-heavy property");
    }
  }
});

test("motion.css animations are all gated by the data-motion attribute", () => {
  const text = read("assets/css/motion.css");
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = m;
    if (selector.includes("@keyframes") || /^\s*(from|to|\d+%|0%,)/.test(selector.trim())) continue;
    if (/animation(-name)?\s*:/.test(body) && !/animation(-name)?\s*:\s*none/.test(body)) {
      assert.ok(/data-motion|vt-wipe/.test(selector), "ungated animation in motion.css: " + selector.trim().slice(0, 80));
    }
  }
});

test("infinite animations outside motion.css have a reduced-motion branch in the same file", () => {
  for (const file of css.filter((f) => !f.endsWith("motion.css"))) {
    const text = read(file);
    if (/infinite/.test(text)) assert.ok(/prefers-reduced-motion/.test(text), file + " has an infinite animation but no prefers-reduced-motion rule");
  }
});

// ── motion phase 2 guards ────────────────────────────────────────────────

test("glitch effects are Accent-only (data-fx=\"2\") in every stylesheet", () => {
  for (const file of css) {
    for (const m of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      const body = m[2];
      if (/^@keyframes|^(from|to|\d+%)/.test(selector)) continue;
      if (/ks-glitch|tick-flicker/.test(body) && /animation/.test(body)) {
        assert.ok(/data-fx="2"/.test(selector), file + ": glitch animation outside data-fx=\"2\": " + selector.slice(0, 80));
      }
    }
  }
});

test("every page runs motion-boot.js before the deferred scripts and the first paint", () => {
  for (const file of html) {
    const text = read(file);
    const boot = text.indexOf("/assets/js/motion-boot.js");
    const firstDeferred = text.indexOf("<script defer");
    assert.ok(boot > -1, file + ": motion-boot.js missing");
    assert.ok(!/<script[^>]*motion-boot[^>]*\b(defer|async)\b/.test(text), file + ": motion-boot.js must be synchronous");
    assert.ok(firstDeferred === -1 || boot < firstDeferred, file + ": motion-boot.js must precede deferred scripts");
  }
});

test("the console makes no network requests and the boot sequence only reads the build stamp", () => {
  const consoleJs = read("assets/js/console.js");
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage/.test(consoleJs), "console.js must be network- and storage-free");
  const bootJs = read("assets/js/boot.js");
  const fetches = [...bootJs.matchAll(/\.fetch\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ["/assets/site-meta.json"]);
});

test("motion.js and motion-boot.js agree on the gate (storage keys, tiers)", () => {
  const a = read("assets/js/motion.js");
  const b = read("assets/js/motion-boot.js");
  for (const key of ["kanasaka-motion", "kanasaka-theme"]) {
    assert.ok(a.includes(key) || key === "kanasaka-theme", "motion.js lost " + key);
    assert.ok(b.includes(key), "motion-boot.js lost " + key);
  }
  assert.ok(/theme === "accent" \? 2 : 1/.test(a), "motion.js: accent = fx 2, everything else 1");
  assert.ok(/theme === "accent" \? "2" : "1"/.test(b), "motion-boot.js: accent = fx 2, everything else 1");
});

test("effects that run in Dark and Light are not limited to Accent", () => {
  const text = read("assets/css/motion.css");
  for (const sel of [".hero-floor", ".scan-sweep", ".pl-on", ".showcase-media::after"]) {
    const rules = [...text.matchAll(/([^{}]*\bdata-fx="1"[^{}]*)\{/g)].map((m) => m[1]);
    assert.ok(rules.some((r) => r.includes(sel)), sel + " must also be enabled at data-fx=\"1\"");
  }
});
