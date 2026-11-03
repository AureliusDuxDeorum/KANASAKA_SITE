import assert from "node:assert/strict";
import { test } from "node:test";

import { allowSend } from "../functions/lib/security.js";
import { countRecentEvents, logEvent, purgeOldEvents, tooManyRecentEvents } from "../functions/lib/throttle.js";
import { makeEnv } from "./helpers.mjs";

test("counts events by ip, email and userId inside the window only", async () => {
  const env = makeEnv();
  await logEvent(env, "t", { ip: "1.1.1.1", email: "a@x.com", userId: 7 });
  await logEvent(env, "t", { ip: "1.1.1.1", email: "b@x.com", userId: 8 });
  await env.DB.prepare(
    "INSERT INTO auth_events (event_type, meta, created_at) VALUES ('t', ?, datetime('now', '-2 hours'))"
  )
    .bind(JSON.stringify({ ip: "1.1.1.1" }))
    .run();

  assert.equal(await countRecentEvents(env, "t", "ip", "1.1.1.1", 15), 2);
  assert.equal(await countRecentEvents(env, "t", "ip", "1.1.1.1", 180), 3);
  assert.equal(await countRecentEvents(env, "t", "email", "a@x.com", 15), 1);
  assert.equal(await countRecentEvents(env, "t", "userId", 8, 15), 1);
  assert.equal(await countRecentEvents(env, "other", "ip", "1.1.1.1", 15), 0);
});

test("only whitelisted meta keys can be used as a throttle key", async () => {
  const env = makeEnv();
  await logEvent(env, "t", { ip: "1.1.1.1" });
  // an injected "field" must never reach the SQL
  assert.equal(await countRecentEvents(env, "t", "ip') OR 1=1 --", "1.1.1.1", 15), 0);
  assert.equal(await countRecentEvents(env, "t", "ip", "", 15), 0);
  assert.equal(await countRecentEvents(env, "t", "ip", undefined, 15), 0);
});

test("tooManyRecentEvents trips exactly at the limit", async () => {
  const env = makeEnv();
  for (let i = 0; i < 3; i += 1) await logEvent(env, "t", { ip: "9.9.9.9" });
  assert.equal(await tooManyRecentEvents(env, "t", "ip", "9.9.9.9", { max: 3 }), true);
  assert.equal(await tooManyRecentEvents(env, "t", "ip", "9.9.9.9", { max: 4 }), false);
});

test("throttles fail open when the database errors", async () => {
  const env = { DB: { prepare() { throw new Error("db down"); } } };
  assert.equal(await tooManyRecentEvents(env, "t", "ip", "1.1.1.1", { max: 1 }), false);
});

test("purgeOldEvents removes only events past the retention window", async () => {
  const env = makeEnv();
  await logEvent(env, "fresh", { ip: "1" });
  await env.DB.prepare(
    "INSERT INTO auth_events (event_type, meta, created_at) VALUES ('old', '{}', datetime('now', '-120 days'))"
  ).run();
  const removed = await purgeOldEvents(env, 90);
  assert.equal(removed, 1);
  const left = await env.DB.prepare("SELECT event_type FROM auth_events").all();
  assert.deepEqual(left.results.map((r) => r.event_type), ["fresh"]);
});

test("allowSend limits per email and per ip, and blocked requests are not recorded", async () => {
  const env = makeEnv();
  const who = { ip: "5.5.5.5", email: "victim@example.com" };

  for (let i = 0; i < 3; i += 1) assert.equal(await allowSend(env, "reset", who, { email: 3, ip: 10 }), true);
  assert.equal(await allowSend(env, "reset", who, { email: 3, ip: 10 }), false, "4th mail to one address");
  assert.equal(await countRecentEvents(env, "reset_send", "email", "victim@example.com", 15), 3, "blocked attempt must not extend the window");

  // a different address from the same ip is still fine until the ip cap
  assert.equal(await allowSend(env, "reset", { ip: "5.5.5.5", email: "other@example.com" }, { email: 3, ip: 10 }), true);

  for (let i = 0; i < 6; i += 1) await allowSend(env, "reset", { ip: "5.5.5.5", email: "n" + i + "@example.com" }, { email: 3, ip: 10 });
  assert.equal(await allowSend(env, "reset", { ip: "5.5.5.5", email: "fresh@example.com" }, { email: 3, ip: 10 }), false, "ip cap");
});
