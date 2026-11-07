// The site no longer sells anything. This keeps payment, billing and
// subscription wording out of every page, script, stylesheet, API route and doc,
// so it cannot creep back in unnoticed.
//
// Deliberately not covered: migrations/ (history), ARD.txt (a dated log of what
// was done, including the removal), tests/, and the three internal files that read
// the stored KS Stocks access status for accounts that already have it (database
// column names and the session fields the desktop app reads).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const SKIP = [/^migrations\//, /^tests\//, /^ARD\.txt$/, /^\.github\//, /^functions\/vendor\//, /^functions\/lib\/(ks-stocks-access|schema|auth)\.js$/, /^changelog\//, /\.(png|webp|ico|ttf|woff2?|jpg|jpeg|gif|wasm|lock)$/, /package-lock\.json$/];
const FORBIDDEN = /stripe|billing|\bcheckout\b|ks_package|ks package|refund|subscri|monetiz|paywall|pricing|per month|invoice|alpaca|ollama/i;

test("no payment, billing, subscription or pricing wording anywhere on the site", () => {
  const hits = [];
  for (const file of tracked) {
    if (SKIP.some((pattern) => pattern.test(file))) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    text.split("\n").forEach((line, i) => {
      if (FORBIDDEN.test(line)) hits.push(file + ":" + (i + 1) + "  " + line.trim().slice(0, 90));
    });
  }
  assert.deepEqual(hits, []);
});

test("the billing and checkout routes, pages and settings panel are gone", () => {
  for (const gone of ["functions/api/billing", "functions/api/stripe", "functions/lib/stripe.js", "functions/lib/billing.js", "legal/refunds", "products/ks-stocks"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, gone)), gone + " should not exist");
  }
  const settings = fs.readFileSync(path.join(ROOT, "account/settings/index.html"), "utf8");
  assert.ok(!/settings-panel-billing|data-settings-panel="billing"/.test(settings));
});
