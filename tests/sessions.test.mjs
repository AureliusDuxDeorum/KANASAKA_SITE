import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumeEmailToken,
  createEmailToken,
  createSession,
  deleteAllUserSessions,
  resolveSession,
} from "../functions/lib/auth.js";
import { insertUser, makeEnv, req } from "./helpers.mjs";

const cookie = (token) => ({ Cookie: "__Host-kanasaka_session=" + token });

test("a fresh session resolves to its user", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  const session = await createSession(env, user.id, true);
  const { user: found } = await resolveSession(req("/api/auth/session", { headers: cookie(session.token) }), env);
  assert.equal(found.id, user.id);
});

test("session tokens are stored hashed, never raw", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  const session = await createSession(env, user.id, true);
  const rows = (await env.DB.prepare("SELECT * FROM sessions").all()).results;
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows[0]).includes(session.token));
});

test("a session that expired earlier today no longer resolves", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  const session = await createSession(env, user.id, true);
  await env.DB.prepare("UPDATE sessions SET expires_at = ?").bind(new Date(Date.now() - 60_000).toISOString()).run();
  const { user: found } = await resolveSession(req("/", { headers: cookie(session.token) }), env);
  assert.equal(found, null);
});

test("unverified accounts and unknown tokens never resolve", async () => {
  const env = makeEnv();
  const user = await insertUser(env, { email_verified: 0 });
  const session = await createSession(env, user.id, true);
  assert.equal((await resolveSession(req("/", { headers: cookie(session.token) }), env)).user, null);
  assert.equal((await resolveSession(req("/", { headers: cookie("nope") }), env)).user, null);
  assert.equal((await resolveSession(req("/"), env)).user, null);
});

test("deleteAllUserSessions revokes every session", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  const a = await createSession(env, user.id, true);
  const b = await createSession(env, user.id, false);
  await deleteAllUserSessions(env, user.id);
  assert.equal((await resolveSession(req("/", { headers: cookie(a.token) }), env)).user, null);
  assert.equal((await resolveSession(req("/", { headers: cookie(b.token) }), env)).user, null);
});

test("a non-remembered session gets a browser-session cookie (no Max-Age)", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  assert.equal((await createSession(env, user.id, false)).maxAge, null);
  assert.ok((await createSession(env, user.id, true)).maxAge > 0);
});

test("email codes are single-use and expire", async () => {
  const env = makeEnv();
  const user = await insertUser(env);
  await createEmailToken(env, user.id, "verify", 0.25, "123456");
  assert.ok(await consumeEmailToken(env, "123456", "verify"));
  assert.equal(await consumeEmailToken(env, "123456", "verify"), null, "single use");

  await createEmailToken(env, user.id, "verify", 0.25, "654321");
  await env.DB.prepare("UPDATE email_tokens SET expires_at = ?").bind(new Date(Date.now() - 60_000).toISOString()).run();
  assert.equal(await consumeEmailToken(env, "654321", "verify"), null, "expired earlier today");
});
