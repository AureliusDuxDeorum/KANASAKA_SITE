#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_NAME = "kanasaka.com";
const CONFIG_PATH = path.join(os.homedir(), ".config/.wrangler/config/default.toml");
const OUTPUT_PATH = path.join(process.cwd(), "docs/WAF_STATUS.txt");

const EXPECTED_RULES = [
  {
    id: "auth-post-flood",
    summary: "Rate limit auth POST routes (30 / 10 min / IP)",
    patterns: ['starts with "/api/auth/"', "POST"],
  },
  {
    id: "login-limit",
    summary: "Tighter login limit (10 / 10 min / IP)",
    patterns: ["/api/auth/login", "POST"],
  },
  {
    id: "reset-limit",
    summary: "Password reset limit (8 / hour / IP)",
    patterns: ["/api/auth/forgot-password", "/api/auth/reset-password"],
  },
  {
    id: "register-limit",
    summary: "Registration limit (6 / hour / IP)",
    patterns: ["/api/auth/register", "POST"],
  },
  {
    id: "auth-bots",
    summary: "Challenge bots on auth paths",
    patterns: ["/api/auth/", "cf.client.bot"],
  },
];

function readOAuthToken() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const match = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not read wrangler OAuth token. Run: npx wrangler login");
  }
  return match[1];
}

async function cf(pathname) {
  const token = readOAuthToken();
  const response = await fetch("https://api.cloudflare.com/client/v4" + pathname, {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(JSON.stringify(data.errors || data));
  }
  return data.result;
}

function flattenRules(entries) {
  const rules = [];
  for (const entry of entries || []) {
    const source = entry.rules || entry.rulesets || entry;
    if (Array.isArray(source)) {
      for (const item of source) {
        rules.push(item);
      }
    } else if (entry.description || entry.expression || entry.action) {
      rules.push(entry);
    }
  }
  return rules;
}

function scoreRule(rule, expected) {
  const blob = JSON.stringify(rule).toLowerCase();
  let hits = 0;
  for (const pattern of expected.patterns) {
    if (blob.includes(String(pattern).toLowerCase())) {
      hits += 1;
    }
  }
  return hits;
}

async function main() {
  const zones = await cf("/zones?name=" + encodeURIComponent(ZONE_NAME));
  const zone = zones[0];
  if (!zone) {
    throw new Error("Zone not found: " + ZONE_NAME);
  }

  const lines = [];
  lines.push("KANASAKA WAF STATUS");
  lines.push("Generated: " + new Date().toISOString());
  lines.push("Zone: " + ZONE_NAME + " (" + zone.id + ")");
  lines.push("");

  let rules = [];

  try {
    const rulesets = await cf(`/zones/${zone.id}/rulesets`);
    for (const ruleset of rulesets || []) {
      try {
        const detail = await cf(`/zones/${zone.id}/rulesets/${ruleset.id}`);
        rules = rules.concat(flattenRules(detail.rules || []));
      } catch {
        // Some ruleset types are not readable with this token scope.
      }
    }
  } catch (err) {
    lines.push("Ruleset lookup failed: " + err.message);
  }

  try {
    const firewallRules = await cf(`/zones/${zone.id}/firewall/rules?per_page=100`);
    rules = rules.concat(flattenRules(firewallRules || []));
  } catch {
    // Legacy endpoint may be unavailable depending on plan/API version.
  }

  lines.push("Matched custom/WAF rules found: " + rules.length);
  lines.push("");

  for (const expected of EXPECTED_RULES) {
    let best = { score: 0, rule: null };
    for (const rule of rules) {
      const score = scoreRule(rule, expected);
      if (score > best.score) {
        best = { score, rule };
      }
    }

    const status =
      best.score >= Math.min(2, expected.patterns.length) ? "LIKELY LIVE" : "MISSING/UNVERIFIED";
    lines.push("- [" + status + "] " + expected.summary);
    if (best.rule) {
      lines.push("  match: " + (best.rule.description || best.rule.expression || best.rule.action || "unnamed rule"));
    }
  }

  lines.push("");
  lines.push("Notes:");
  lines.push("- Cloudflare API visibility varies by plan and token scope.");
  lines.push("- If any rule shows MISSING/UNVERIFIED, apply it manually from docs/CLOUDFLARE_WAF.md.");
  lines.push("- Rule 5 (origin block) is intentionally skipped when KS Unify desktop auth is used.");

  const output = lines.join("\n") + "\n";
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(output);
  console.log("Saved:", OUTPUT_PATH);
}

main().catch(function (err) {
  console.error("[waf-check] Failed:", err.message || err);
  process.exit(1);
});
