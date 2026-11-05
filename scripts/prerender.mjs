// Writes the parts of every page that are generated from shared data:
//
//   <!-- shell:header -->  ... <!-- /shell:header -->   from assets/js/shell.js
//   <!-- shell:footer -->  ... <!-- /shell:footer -->   from assets/js/shell.js
//   <!-- seo -->           ... <!-- /seo -->             canonical, Open Graph, Twitter card
//                                                        (and Organization JSON-LD on the home page)
//   sitemap.xml, and the Sitemap line in robots.txt
//
// The <title> and <meta name="description"> stay hand-written in each page (the
// description is required, 50-160 characters, on every indexable page).
//
// Idempotent. `node scripts/prerender.mjs --check` writes nothing and exits 1
// if any page is out of date (that is what the test suite runs).
//
// There is no build step on the host (the build command is empty), so this
// runs here, and its output is committed.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([".git", ".github", ".wrangler", "node_modules", "functions", "tests", "docs", "scripts", "migrations", "assets", ".well-known"]);

export function loadShell() {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "assets/js/shell.js"), "utf8"), sandbox, { filename: "shell.js" });
  return sandbox.KanasakaShell;
}

export function listPages() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!(dir === ROOT && SKIP_DIRS.has(entry.name))) walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".html")) {
        out.push(path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join("/"));
      }
    }
  })(ROOT);
  return out.sort();
}

// "index.html" -> "/", "legal/privacy/index.html" -> "/legal/privacy/", "404.html" -> null
export function urlPath(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return "/" + file.slice(0, -"index.html".length);
  return null;
}

function inject(html, name, content) {
  const open = "<!-- " + name + " -->";
  const close = "<!-- /" + name + " -->";
  const block = open + "\n" + content + "\n" + close;
  const a = html.indexOf(open);
  const b = html.indexOf(close);
  if (a !== -1 && b > a) return html.slice(0, a) + block + html.slice(b + close.length);
  const slotId = name === "shell:header" ? "site-header" : "site-footer";
  const slot = '<div id="' + slotId + '"></div>';
  if (html.includes(slot)) return html.replace(slot, () => block);
  throw new Error("no " + name + " markers or #" + slotId + " slot");
}

export const SITE = "https://kanasaka.com";
export const OG_IMAGE = "/assets/images/og-default.png";

// Pages that are reachable but must not be advertised: not in the sitemap, no
// share tags. (Everything robots.txt disallows is covered by its prefixes.)
export const UNLISTED_PREFIXES = ["/account/", "/admin/", "/login/", "/register/", "/verify/", "/forgot-password/", "/reset-password/", "/products/ks-stocks/"];

function attr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// -> { title, description } for a page, or null when it is not indexable
export function seoInfo(html, file) {
  const page = urlPath(file);
  if (!page || UNLISTED_PREFIXES.some((prefix) => page.startsWith(prefix))) return null;
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) return null;
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title || !description) return null;
  return { page, title, description };
}

function seoBlock(info) {
  const url = SITE + info.page;
  const lines = [
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="KANASAKA">',
    '<meta property="og:title" content="' + info.title + '">',
    '<meta property="og:description" content="' + info.description + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:image" content="' + SITE + OG_IMAGE + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="KANASAKA">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + info.title + '">',
    '<meta name="twitter:description" content="' + info.description + '">',
    '<meta name="twitter:image" content="' + SITE + OG_IMAGE + '">',
  ];
  if (info.page === "/") {
    // Only facts that are already public on the site.
    const org = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "KANASAKA",
      url: SITE + "/",
      logo: SITE + "/assets/icons/icon-512.png",
      address: { "@type": "PostalAddress", addressCountry: "DE" },
    };
    lines.push('<script type="application/ld+json">' + JSON.stringify(org).replace(/</g, "\\u003c") + "</script>");
  }
  return lines.map((line) => "  " + line).join("\n");
}

function setSeo(html, info) {
  const open = "  <!-- seo -->";
  const close = "  <!-- /seo -->";
  const a = html.indexOf(open);
  const b = html.indexOf(close);
  if (a !== -1 && b > a) html = html.slice(0, a).replace(/\n$/, "") + html.slice(b + close.length);
  if (!info) return html;
  const block = open + "\n" + seoBlock(info) + "\n" + close;
  const marker = '  <meta name="theme-color"';
  const at = html.indexOf(marker);
  if (at === -1) throw new Error("no theme-color meta to anchor the SEO block");
  return html.slice(0, at) + block + "\n" + html.slice(at);
}

export function renderPage(html, file, shell) {
  const page = urlPath(file);
  let out = inject(html, "shell:header", shell.renderHeader({ path: page, authPending: true }));
  out = inject(out, "shell:footer", shell.renderFooter());
  out = setSeo(out, seoInfo(out, file));
  return out;
}

export function buildSitemap() {
  const urls = [];
  for (const file of listPages()) {
    const info = seoInfo(fs.readFileSync(path.join(ROOT, file), "utf8"), file);
    if (info) urls.push(info.page);
  }
  urls.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => "  <url><loc>" + SITE + u + "</loc></url>").join("\n") +
    "\n</urlset>\n"
  );
}

const SITEMAP_LINE = "Sitemap: " + SITE + "/sitemap.xml";

function syncFile(file, wanted, check, stale) {
  const abs = path.join(ROOT, file);
  const have = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (have !== wanted) {
    stale.push(file);
    if (!check) fs.writeFileSync(abs, wanted);
  }
}

export function run({ check = false } = {}) {
  const shell = loadShell();
  const stale = [];
  for (const file of listPages()) {
    const abs = path.join(ROOT, file);
    const before = fs.readFileSync(abs, "utf8");
    let after;
    try {
      after = renderPage(before, file, shell);
    } catch (err) {
      throw new Error(file + ": " + err.message);
    }
    if (after !== before) {
      stale.push(file);
      if (!check) fs.writeFileSync(abs, after);
    }
  }
  syncFile("sitemap.xml", buildSitemap(), check, stale);
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8").replace(/\n*Sitemap:.*\n*/g, "\n").trimEnd();
  syncFile("robots.txt", robots + "\n\n" + SITEMAP_LINE + "\n", check, stale);
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const changed = run({ check });
  if (check && changed.length) {
    console.error("Out of date (run `npm run prerender`):\n  " + changed.join("\n  "));
    process.exit(1);
  }
  console.log(check ? "Pre-rendered pages are up to date." : "Pre-rendered " + changed.length + " page(s).");
}
