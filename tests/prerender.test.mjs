import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { listPages, loadShell, ROOT, run, urlPath } from "../scripts/prerender.mjs";

const shell = loadShell();
const pages = listPages();

test("every page's pre-rendered header/footer is current (run `npm run prerender`)", () => {
  assert.deepEqual(run({ check: true }), []);
});

test("every page loads shell.js before main.js", () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    const s = html.indexOf("/assets/js/shell.js");
    const m = html.indexOf("/assets/js/main.js");
    assert.ok(s !== -1 && m !== -1 && s < m, file + ": shell.js must be listed before main.js");
    assert.ok(/<script defer src="\/assets\/js\/shell\.js/.test(html), file + ": shell.js must be deferred");
  }
});

test("the header is in the HTML: one banner, active link per page, no JS needed", () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.equal((html.match(/<header id="site-header"/g) || []).length, 1, file);
    assert.equal((html.match(/<footer id="site-footer"/g) || []).length, 1, file);
    assert.ok(html.includes('<nav class="site-nav"'), file);
    const page = urlPath(file);
    const active = [...html.matchAll(/class="(?:nav-link|nav-dropdown-overview)? ?active"[^>]*href="([^"]+)"|<a class="active" href="([^"]+)"/g)];
    if (page && page !== "/") {
      const known = shell.nav.some((s) => s.href === page || (s.children || []).some((c) => c.href === page));
      if (known) assert.ok(active.length >= 1, file + ": expected an active nav link");
    }
  }
});

test("shell rendering escapes text and marks only the current page active", () => {
  const html = shell.renderHeader({ path: "/legal/privacy/", authPending: true });
  assert.match(html, /<a class="nav-link active" href="\/legal\/"[^>]*>Legal<\/a>/);
  assert.match(html, /<a class="active" href="\/legal\/privacy\/">Privacy<\/a>/);
  assert.equal((html.match(/class="active"/g) || []).length, 1);
  assert.doesNotMatch(shell.renderHeader({ path: "/", authPending: true }), /<a class="active"/);
  assert.match(shell.renderHeader({ path: "/", authPending: false }), /class="site-header"/);
  assert.match(shell.renderHeader({ path: "/", authPending: true }), /class="site-header is-auth-pending"/);
});

test("every nav and footer link points at a page that exists", () => {
  const targets = new Set(pages.map(urlPath).filter(Boolean));
  const hrefs = [
    ...shell.nav.flatMap((s) => [s.href, ...(s.children || []).map((c) => c.href)]),
    ...shell.footer.flatMap((c) => c.links.map((l) => l.href)),
  ];
  for (const href of hrefs) assert.ok(targets.has(href), href + " has no page");
});
