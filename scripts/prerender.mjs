// Writes the parts of every page that are generated from shared data:
//
//   <!-- shell:header -->  ... <!-- /shell:header -->   from assets/js/shell.js
//   <!-- shell:footer -->  ... <!-- /shell:footer -->   from assets/js/shell.js
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

export function renderPage(html, file, shell) {
  const page = urlPath(file);
  let out = inject(html, "shell:header", shell.renderHeader({ path: page, authPending: true }));
  out = inject(out, "shell:footer", shell.renderFooter());
  return out;
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
