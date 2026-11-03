import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { createSession } from "../functions/lib/auth.js";
import { clearAuthSchemaCache } from "../functions/lib/schema.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ORIGIN = "https://kanasaka.com";

function toSqliteValue(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

// A D1-shaped wrapper over a real in-memory SQLite database built from
// schema.sql plus the migrations, so queries run against the same schema and
// SQL dialect the site uses in production.
export function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8"));
  for (const file of fs.readdirSync(path.join(ROOT, "migrations")).sort()) {
    if (/wipe/.test(file)) continue;
    db.exec(fs.readFileSync(path.join(ROOT, "migrations", file), "utf8"));
  }

  const d1 = {
    raw: db,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values.map(toSqliteValue);
          return statement;
        },
        async first() {
          const row = db.prepare(sql).get(...args);
          return row ? { ...row } : null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args).map((row) => ({ ...row })), success: true };
        },
        async run() {
          const info = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        },
      };
      return statement;
    },
    toString() {
      return "test-db-" + (d1.id ||= Math.random().toString(36).slice(2));
    },
  };
  return d1;
}

export function makeEnv(overrides = {}) {
  clearAuthSchemaCache();
  return {
    DB: makeDb(),
    SITE_URL: ORIGIN,
    SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
    ARGON2_MEMORY_KIB: "8192",
    ARGON2_ITERATIONS: "1",
    ...overrides,
  };
}

let counter = 0;

export async function insertUser(env, fields = {}) {
  counter += 1;
  const row = {
    email: "user" + counter + "@example.com",
    password_hash: "x",
    email_verified: 1,
    role: "user",
    totp_enabled: 0,
    ...fields,
  };
  const keys = Object.keys(row);
  const result = await env.DB.prepare(
    "INSERT INTO users (" + keys.join(", ") + ") VALUES (" + keys.map(() => "?").join(", ") + ")"
  )
    .bind(...keys.map((k) => row[k]))
    .run();
  return { id: result.meta.last_row_id, ...row };
}

export async function sessionCookieFor(env, userId) {
  const session = await createSession(env, userId, true);
  return "__Host-kanasaka_session=" + session.token;
}

export function req(pathname, { method = "GET", headers = {}, body, origin = ORIGIN } = {}) {
  const init = { method, headers: { ...headers } };
  if (origin && method !== "GET" && !init.headers.Origin) init.headers.Origin = origin;
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers["Content-Type"] ||= "application/json";
  }
  return new Request(ORIGIN + pathname, init);
}

export async function json(response) {
  return JSON.parse(await response.text());
}

export function backdate(env, table, column, id, ms) {
  return env.DB.prepare("UPDATE " + table + " SET " + column + " = ? WHERE id = ?")
    .bind(new Date(Date.now() + ms).toISOString(), id)
    .run();
}
