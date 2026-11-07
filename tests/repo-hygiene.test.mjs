// The repo root is also the deploy root, so a stray file here is a published
// file. Anything new at the top level has to be added here on purpose.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { isBlockedPath, onRequest } from "../functions/_middleware.js";
import { ROOT } from "./helpers.mjs";

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

const ROOT_FILES = new Set([
  ".gitignore", ".node-version", "404.html", "ARD.txt", "_headers", "_routes.json", "favicon.ico",
  "index.html", "package-lock.json", "package.json", "robots.txt", "schema.sql", "site.webmanifest",
  "sitemap.xml", "wrangler.toml",
]);
const ROOT_DIRS = new Set([
  ".github", ".well-known", "account", "admin", "assets", "changelog", "company", "developers", "docs",
  "downloads", "forgot-password", "functions", "legal", "link", "login", "media", "migrations", "products",
  "register", "research", "reset-password", "scripts", "support", "tests", "verify",
]);

test("only known files and folders sit at the repo root", () => {
  const unknown = new Set();
  for (const file of tracked) {
    const parts = file.split("/");
    if (parts.length === 1) { if (!ROOT_FILES.has(file)) unknown.add(file); }
    else if (!ROOT_DIRS.has(parts[0])) unknown.add(parts[0] + "/");
  }
  assert.deepEqual([...unknown], [], "Unexpected top-level entries (they would be published): " + [...unknown].join(", "));
});

test("_routes.json covers every path the guard blocks, plus /api/*", () => {
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, "_routes.json"), "utf8"));
  assert.equal(routes.version, 1);
  assert.ok(routes.include.includes("/api/*"), "/api/* must stay routed so the API middleware runs");
  assert.ok(routes.include.length <= 100);
  const probes = ["/schema.sql", "/wrangler.toml", "/package.json", "/ARD.txt", "/functions/lib/auth.js", "/migrations/003_profile.sql", "/docs/SECURITY.md", "/tests/helpers.mjs", "/scripts/stamp-version.mjs", "/.github/workflows/ci.yml"];
  const covers = (p) => routes.include.some((rule) => (rule.endsWith("/*") ? p.startsWith(rule.slice(0, -1)) : p === rule));
  for (const p of probes) {
    assert.ok(isBlockedPath(p), p + " should be blocked");
    assert.ok(covers(p), p + " is not listed in _routes.json, so the guard would never run for it");
  }
});

test("the guard answers 404 for repo files and passes everything else on", async () => {
  const ctx = (p) => ({ request: new Request("https://kanasaka.com" + p), next: async () => new Response("ok") });
  for (const p of ["/schema.sql", "/wrangler.toml", "/docs/SECURITY.md", "/Docs/Security.md", "/functions/lib/auth.js", "/tests/", "/%73chema.sql", "/ARD.txt", "//schema.sql"]) {
    const res = await onRequest(ctx(p));
    assert.equal(res.status, 404, p);
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
  }
  for (const p of ["/", "/api/auth/session", "/legal/privacy/", "/.well-known/security.txt", "/robots.txt", "/sitemap.xml", "/support/faq/", "/assets/js/main.js"]) {
    assert.equal(await (await onRequest(ctx(p))).text(), "ok", p);
  }
});
