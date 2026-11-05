import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildSitemap, listPages, OG_IMAGE, ROOT, seoInfo, SITE, UNLISTED_PREFIXES, urlPath } from "../scripts/prerender.mjs";

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const pages = listPages().map((file) => ({ file, html: read(file), page: urlPath(file) }));
const noindex = (html) => /<meta name="robots" content="[^"]*noindex/i.test(html);
const listed = pages.filter((p) => p.page && !noindex(p.html) && !UNLISTED_PREFIXES.some((u) => p.page.startsWith(u)));

test("every public, indexable page has a title and a 50-160 character description", () => {
  assert.ok(listed.length >= 14);
  for (const p of listed) {
    const info = seoInfo(p.html, p.file);
    assert.ok(info, p.file + ": missing <title> or <meta name=\"description\">");
    assert.ok(info.description.length >= 50 && info.description.length <= 160, p.file + ": description is " + info.description.length + " characters");
  }
});

test("titles and descriptions are unique across indexable pages", () => {
  for (const key of ["title", "description"]) {
    const seen = new Map();
    for (const p of listed) {
      const value = seoInfo(p.html, p.file)[key];
      assert.ok(!seen.has(value), p.file + " repeats the " + key + " of " + seen.get(value));
      seen.set(value, p.file);
    }
  }
});

test("canonical and Open Graph tags point at the page's own URL and a real image", () => {
  assert.ok(fs.existsSync(path.join(ROOT, OG_IMAGE.slice(1))));
  for (const p of listed) {
    assert.ok(p.html.includes('<link rel="canonical" href="' + SITE + p.page + '">'), p.file + ": canonical");
    assert.ok(p.html.includes('<meta property="og:url" content="' + SITE + p.page + '">'), p.file + ": og:url");
    assert.ok(p.html.includes('<meta property="og:image" content="' + SITE + OG_IMAGE + '">'), p.file + ": og:image");
    assert.equal((p.html.match(/rel="canonical"/g) || []).length, 1, p.file);
  }
});

test("noindex and account pages carry no canonical or share tags", () => {
  for (const p of pages.filter((q) => !listed.includes(q))) {
    assert.ok(!p.html.includes("<!-- seo -->"), p.file + " should not advertise itself");
  }
});

test("the Organization JSON-LD is on the home page only and parses", () => {
  const withLd = pages.filter((p) => p.html.includes("application/ld+json"));
  assert.deepEqual(withLd.map((p) => p.file), ["index.html"]);
  const json = JSON.parse(withLd[0].html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(json["@type"], "Organization");
  assert.equal(json.name, "KANASAKA");
  assert.ok(!JSON.stringify(json).includes("@kanasaka.com"), "no email address in structured data");
});

test("sitemap.xml lists exactly the indexable pages; robots.txt points at it", () => {
  assert.equal(read("sitemap.xml"), buildSitemap());
  const locs = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), listed.map((p) => SITE + p.page).sort());
  const robots = read("robots.txt");
  assert.match(robots, /^Sitemap: https:\/\/kanasaka\.com\/sitemap\.xml$/m);
  for (const line of robots.split("\n").filter((l) => l.startsWith("Disallow: "))) {
    const prefix = line.slice("Disallow: ".length);
    assert.ok(!locs.some((l) => l.startsWith(SITE + prefix)), prefix + " is disallowed but in the sitemap");
  }
});

test("404.html exists, is noindex and uses the shared shell", () => {
  const html = read("404.html");
  assert.ok(noindex(html));
  assert.ok(html.includes('<header id="site-header"') && html.includes("<h1>Page not found</h1>"));
  assert.ok(!html.includes("rel=\"canonical\""));
});
