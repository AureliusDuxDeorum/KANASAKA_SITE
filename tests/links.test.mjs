// Every internal link, script, stylesheet, image and icon in the HTML points at
// something that exists. Catches a renamed page or a typo before it ships.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { listPages, ROOT } from "../scripts/prerender.mjs";

function resolves(url) {
  let p = url.split("#")[0].split("?")[0];
  if (!p) return true;
  if (p.startsWith("/api/")) return true; // served by Functions
  const abs = path.join(ROOT, decodeURIComponent(p));
  if (p.endsWith("/")) return fs.existsSync(path.join(abs, "index.html"));
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

test("internal links and asset references in every page resolve", () => {
  const broken = [];
  let checked = 0;
  for (const file of listPages()) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of html.matchAll(/\b(?:href|src)="(\/[^"/][^"]*|\/)"/g)) {
      checked += 1;
      if (!resolves(m[1])) broken.push(file + " -> " + m[1]);
    }
  }
  assert.ok(checked > 500, "checked " + checked);
  assert.deepEqual(broken, []);
});

test("scripts and stylesheets are versioned with a content hash (?v=) so a changed file always has a new URL", () => {
  const unversioned = [];
  for (const file of listPages()) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of html.matchAll(/(?:href|src)="(\/assets\/(?:js|css)\/[^"]+)"/g)) {
      if (!/\?v=[0-9a-f]{8}$/.test(m[1])) unversioned.push(file + " -> " + m[1]);
    }
  }
  assert.deepEqual(unversioned, []);
});
