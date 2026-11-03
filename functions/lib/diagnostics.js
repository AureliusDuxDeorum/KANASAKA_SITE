// Read-only status report for the developer panel (GET /api/admin/diagnostics).
//
// Everything here answers "is this deployment configured and healthy?" without
// ever returning a secret value: configuration is reported as present/missing,
// never echoed. A check is { id, label, status, detail } with status
//   ok    -- fine
//   warn  -- works, but weaker than it should be
//   fail  -- broken or missing something the site depends on
//   info  -- context only
//   manual -- cannot be verified from inside the app (e.g. Cloudflare WAF)

import { argon2Params } from "./argon2.js";
import { getAuthSchema } from "./schema.js";

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "email_tokens",
  "auth_events",
  "twofa_challenges",
  "sms_otp_codes",
  "twofa_backup_codes",
  "user_avatars",
  "legal_notices",
  "legal_notice_acks",
  "pending_role_changes",
];

const ACTIVITY_EVENTS = [
  ["login_success", "Successful logins"],
  ["login_failed", "Failed logins"],
  ["login_2fa_failed", "Failed 2FA sign-ins"],
  ["otp_failed", "Wrong one-time codes"],
  ["register_attempt", "Registration attempts"],
  ["admin_lockout_notified", "Admin lockouts"],
];

function check(id, label, status, detail = "") {
  return { id, label, status, detail };
}

function present(value) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function secretCheck(env, key, label, { required = true, minLength = 0, note = "" } = {}) {
  const value = env[key];
  if (!present(value)) {
    return check(
      key,
      label,
      required ? "fail" : "info",
      required ? "Not set." + (note ? " " + note : "") : "Not set (optional)." + (note ? " " + note : "")
    );
  }
  if (minLength && String(value).length < minLength) {
    return check(key, label, "warn", "Set, but shorter than " + minLength + " characters.");
  }
  return check(key, label, "ok", "Set.");
}

export function configurationChecks(env) {
  const checks = [
    secretCheck(env, "SESSION_SECRET", "Session signing secret", {
      minLength: 32,
      note: "Without it session and code hashes fall back to unkeyed SHA-256.",
    }),
    secretCheck(env, "ADMIN_SECRET", "Admin bearer secret", { required: false, minLength: 32 }),
    secretCheck(env, "RESEND_API_KEY", "Email provider key (Resend)"),
    secretCheck(env, "STRIPE_SECRET_KEY", "Stripe secret key"),
    secretCheck(env, "STRIPE_WEBHOOK_SECRET", "Stripe webhook secret"),
    check(
      "DB",
      "D1 database binding",
      env.DB ? "ok" : "fail",
      env.DB ? "Bound." : "No DB binding -- accounts cannot work."
    ),
    check(
      "INSTALLERS",
      "R2 installers binding",
      env.INSTALLERS ? "ok" : "warn",
      env.INSTALLERS ? "Bound." : "Not bound -- installer downloads and the KS_Link updater are offline."
    ),
  ];

  let siteUrl = "";
  try {
    siteUrl = new URL(env.SITE_URL || "").origin;
  } catch {
    siteUrl = "";
  }
  checks.push(
    check(
      "SITE_URL",
      "Site URL",
      siteUrl.startsWith("https://") ? "ok" : "fail",
      siteUrl
        ? siteUrl + (siteUrl.startsWith("https://") ? "" : " (must be https)")
        : "Missing or invalid -- same-origin checks fall back to kanasaka.com."
    )
  );

  const twilio = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  checks.push(
    check("SMS", "SMS provider (Twilio)", twilio ? "ok" : "info", twilio ? "Configured." : "Not configured -- 2FA uses email codes.")
  );

  const params = argon2Params(env);
  checks.push(
    check(
      "ARGON2",
      "Password hashing (Argon2id)",
      params.memorySize >= 19456 && params.iterations >= 2 ? "ok" : "warn",
      params.memorySize + " KiB, " + params.iterations + " passes, " + params.parallelism + " lane(s)"
    )
  );

  checks.push(
    check(
      "SUBSCRIPTIONS",
      "KS Package subscriptions",
      "info",
      String(env.KS_PACKAGE_SUBSCRIPTIONS_OPEN) === "true" ? "Open." : "Closed (paused message shown)."
    )
  );

  return checks;
}

async function databaseChecks(env) {
  if (!env.DB) {
    return { checks: [check("db-reach", "Database reachable", "fail", "No DB binding.")], counts: null };
  }

  const checks = [];
  const started = Date.now();
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    checks.push(check("db-reach", "Database reachable", "ok", Date.now() - started + " ms"));
  } catch (err) {
    console.error("Diagnostics: database unreachable:", err);
    return {
      checks: [check("db-reach", "Database reachable", "fail", "Query failed -- see Cloudflare logs.")],
      counts: null,
    };
  }

  try {
    const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const have = new Set((result.results || []).map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !have.has(name));
    checks.push(
      check(
        "db-tables",
        "Required tables",
        missing.length ? "fail" : "ok",
        missing.length ? "Missing: " + missing.join(", ") + " (run the migrations)." : REQUIRED_TABLES.length + " present."
      )
    );
  } catch (err) {
    console.error("Diagnostics: table listing failed:", err);
    checks.push(check("db-tables", "Required tables", "fail", "Could not list tables."));
  }

  try {
    const schema = await getAuthSchema(env);
    const flags = [
      ["Hashed session tokens", schema.sessionsHashed],
      ["Hashed email tokens", schema.emailTokensHashed],
      ["Session rotation", schema.sessionsRotatable],
      ["Remember-me sessions", schema.sessionsRememberable],
    ];
    const off = flags.filter((flag) => !flag[1]).map((flag) => flag[0]);
    checks.push(
      check(
        "db-schema",
        "Auth schema",
        off.length ? "warn" : "ok",
        off.length ? "Legacy schema: missing " + off.join(", ") + "." : "Current."
      )
    );
  } catch (err) {
    console.error("Diagnostics: schema detection failed:", err);
    checks.push(check("db-schema", "Auth schema", "warn", "Could not inspect."));
  }

  const counts = {};
  const queries = {
    users: "SELECT COUNT(*) AS c FROM users",
    verifiedUsers: "SELECT COUNT(*) AS c FROM users WHERE email_verified = 1",
    activeSessions: "SELECT COUNT(*) AS c FROM sessions WHERE expires_at > datetime('now')",
    events: "SELECT COUNT(*) AS c FROM auth_events",
    adminsWithout2fa:
      "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND (totp_enabled IS NULL OR totp_enabled = 0)",
  };
  for (const [key, sql] of Object.entries(queries)) {
    try {
      const row = await env.DB.prepare(sql).first();
      counts[key] = row ? Number(row.c) : 0;
    } catch {
      counts[key] = null;
    }
  }

  checks.push(
    check(
      "db-counts",
      "Accounts",
      "info",
      (counts.users ?? "?") + " total, " + (counts.verifiedUsers ?? "?") + " verified, " + (counts.activeSessions ?? "?") + " active session(s)"
    )
  );

  if (counts.adminsWithout2fa) {
    checks.push(
      check(
        "admins-2fa",
        "Admin accounts without 2FA",
        "warn",
        counts.adminsWithout2fa + " admin account(s) cannot use admin tools until 2FA is on."
      )
    );
  } else if (counts.adminsWithout2fa === 0) {
    checks.push(check("admins-2fa", "Admin accounts without 2FA", "ok", "None."));
  }

  return { checks, counts };
}

async function activityChecks(env) {
  try {
    const result = await env.DB.prepare(
      `SELECT event_type, COUNT(*) AS c FROM auth_events
       WHERE created_at > datetime('now', '-24 hours') GROUP BY event_type`
    ).all();
    const byType = new Map((result.results || []).map((row) => [row.event_type, Number(row.c)]));

    const checks = ACTIVITY_EVENTS.map(function ([type, label]) {
      const count = byType.get(type) || 0;
      let status = "info";
      if (type === "login_failed" && count >= 100) status = "warn";
      if (type === "otp_failed" && count >= 25) status = "warn";
      if (type === "admin_lockout_notified" && count > 0) status = "warn";
      return check("act-" + type, label + " (24 h)", status, String(count));
    });

    const oldest = await env.DB.prepare("SELECT MIN(created_at) AS first FROM auth_events").first();
    checks.push(check("act-oldest", "Oldest stored event", "info", (oldest && oldest.first) || "none"));
    return checks;
  } catch (err) {
    console.error("Diagnostics: activity query failed:", err);
    return [check("act-error", "Recent activity", "warn", "Could not read auth_events.")];
  }
}

export function hardeningChecks() {
  // Things enforced in code that this report cannot observe at runtime, plus
  // the ones that live outside the app. Listed so they are not forgotten.
  return [
    check("waf", "Cloudflare WAF rate limits", "manual", "Verify in the Cloudflare dashboard (docs/CLOUDFLARE_WAF.md)."),
    check("dns", "DNSSEC / CAA records", "manual", "Verify at the DNS provider."),
    check("acct2fa", "2FA on Cloudflare, GitHub, Stripe, Resend", "manual", "Verify on each account."),
  ];
}

export async function collectStatus(env, { build = null } = {}) {
  const database = await databaseChecks(env);
  const groups = [
    { id: "config", title: "Configuration", checks: configurationChecks(env) },
    { id: "database", title: "Database", checks: database.checks },
  ];

  if (database.counts) {
    groups.push({ id: "activity", title: "Last 24 hours", checks: await activityChecks(env) });
  }

  groups.push({ id: "hardening", title: "Checked outside the app", checks: hardeningChecks() });

  if (build) {
    groups.unshift({
      id: "build",
      title: "Build",
      checks: [
        check("build-version", "Version", "info", String(build.version || "unknown")),
        check("build-date", "Built", "info", String(build.built || "unknown")),
        check("build-rev", "Revision", "info", String(build.rev || "unknown")),
      ],
    });
  }

  const all = groups.flatMap((group) => group.checks);
  const summary = {
    ok: all.filter((c) => c.status === "ok").length,
    warn: all.filter((c) => c.status === "warn").length,
    fail: all.filter((c) => c.status === "fail").length,
  };

  return { generatedAt: new Date().toISOString(), summary, groups };
}
