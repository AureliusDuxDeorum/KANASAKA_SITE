// Small, dependency-free helpers for the auth_events-based throttles. Kept
// apart from security.js (which pulls in email/session code) so low-level
// modules like two-factor.js can use them without import cycles, and so the
// test suite can exercise them against a bare D1 stub.

// auth_events.meta is a JSON blob. Only these keys may be used as a throttle
// key -- the JSON path below is built from this list, never from input.
const KEY_FIELDS = new Set(["email", "ip", "userId"]);

export async function logEvent(env, eventType, meta = {}) {
  if (!env.DB) return;

  try {
    await env.DB.prepare("INSERT INTO auth_events (event_type, meta) VALUES (?, ?)")
      .bind(eventType, JSON.stringify(meta))
      .run();
  } catch {
    // Migration may not be applied yet.
  }
}

// Number of `eventType` events whose meta.<field> equals `value` within the
// window. Returns 0 on any error (throttles fail open: a broken check must
// never lock a legitimate user out).
export async function countRecentEvents(env, eventType, field, value, windowMinutes) {
  if (!KEY_FIELDS.has(field) || value === undefined || value === null || value === "") {
    return 0;
  }

  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM auth_events
       WHERE event_type = ?
         AND json_extract(meta, '$.${field}') = ?
         AND created_at > datetime('now', ?)`
    )
      .bind(eventType, value, `-${windowMinutes} minutes`)
      .first();
    return row ? Number(row.c) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function tooManyRecentEvents(env, eventType, field, value, options = {}) {
  const max = options.max || 8;
  const windowMinutes = options.windowMinutes || 15;
  return (await countRecentEvents(env, eventType, field, value, windowMinutes)) >= max;
}

// Retention: auth_events holds IPs and email addresses, so it is trimmed.
// Called lazily (admin events/diagnostics reads), no cron needed.
export const EVENT_RETENTION_DAYS = 90;

export async function purgeOldEvents(env, days = EVENT_RETENTION_DAYS) {
  try {
    const result = await env.DB.prepare(
      "DELETE FROM auth_events WHERE created_at < datetime('now', ?)"
    )
      .bind(`-${Math.trunc(days)} days`)
      .run();
    return (result && result.meta && result.meta.changes) || 0;
  } catch {
    return 0;
  }
}

// Expired credentials and challenges are otherwise only removed per user (on the next sign-in
// or 2FA attempt), so rows for people who never come back would pile up. Each table keeps a
// day of grace: expires_at is written both as ISO text and as datetime('now') text depending
// on the table, and the two only compare reliably a day apart.
const EXPIRING_TABLES = [
  "sessions",
  "email_tokens",
  "sms_otp_codes",
  "twofa_challenges",
  "app_sessions",
];

export async function purgeExpiredRows(env) {
  let removed = 0;
  for (const table of EXPIRING_TABLES) {
    try {
      const result = await env.DB.prepare(
        `DELETE FROM ${table} WHERE expires_at < datetime('now', '-1 day')`
      ).run();
      removed += (result && result.meta && result.meta.changes) || 0;
    } catch {
      // Table not migrated yet.
    }
  }
  return removed;
}

// Everything the lazy housekeeping hook (no cron on Pages) should trim.
export async function runHousekeeping(env) {
  return (await purgeOldEvents(env)) + (await purgeExpiredRows(env));
}
