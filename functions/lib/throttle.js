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
