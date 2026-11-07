// The Terms of Service exist in three places that must say the same thing: the
// page (legal/terms), the acceptance dialog (assets/js/tos.js) and the email copy
// (functions/lib/terms.js). Editing one and forgetting another has happened.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { CURRENT_TOS_VERSION, TERMS_EFFECTIVE_DATE } from "../functions/lib/terms.js";
import { ROOT } from "./helpers.mjs";

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function blocks(source) {
  const text = source
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/"\s*\+\s*\n\s*"/g, "")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&euro;/g, "€")
    .replace(/&[lr]squo;|&apos;/g, "'")
    .replace(/&[lr]dquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
  const out = [];
  for (const m of text.matchAll(/<(h[23]|p|li)\b[^>]*>(.*?)<\/\1>/gs)) {
    const value = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    // chrome that only one copy has
    if (/^(Effective date:|You requested a copy|KANASAKA Terms of Service$|Terms of Service$)/.test(value)) continue;
    out.push(value);
  }
  return out;
}

const copies = {
  page: blocks(read("legal/terms/index.html").slice(read("legal/terms/index.html").indexOf('<article class="content-card legal-card"'), read("legal/terms/index.html").indexOf("</article>"))),
  dialog: blocks(read("assets/js/tos.js").slice(read("assets/js/tos.js").indexOf("var TERMS_HTML"), read("assets/js/tos.js").indexOf("var scheduled"))),
  email: blocks(read("functions/lib/terms.js")),
};

test("the three copies of the Terms say the same thing", () => {
  assert.ok(copies.page.length > 30, "found " + copies.page.length + " blocks");
  assert.deepEqual(copies.dialog, copies.page, "assets/js/tos.js differs from legal/terms");
  assert.deepEqual(copies.email, copies.page, "functions/lib/terms.js differs from legal/terms");
});

test("sections are numbered 1..N without gaps", () => {
  const numbers = copies.page.filter((b) => /^\d+\. /.test(b)).map((b) => Number(b.split(".")[0]));
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
});

test("the effective date matches in all three, and cross-references point at a real section", () => {
  assert.ok(read("legal/terms/index.html").includes("Effective date: " + TERMS_EFFECTIVE_DATE));
  assert.ok(read("assets/js/tos.js").includes("Effective date: " + TERMS_EFFECTIVE_DATE));
  const titles = copies.page.filter((b) => /^\d+\. /.test(b));
  const maxSection = titles.length;
  for (const block of copies.page) for (const m of block.matchAll(/Section (\d+)/g)) assert.ok(Number(m[1]) <= maxSection, block.slice(0, 50) + " refers to Section " + m[1]);
  assert.ok(titles.some((t) => /^14\. KS_Link$/.test(t)), "KS_Link is Section 14 (referenced by Section 2 and 6)");
  assert.ok(CURRENT_TOS_VERSION);
});
