import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestGet as remote } from "../functions/api/app/remote.js";
import { onRequestPost as appLogout } from "../functions/api/app/logout.js";
import { onRequestDelete as devicesDelete } from "../functions/api/app/devices.js";
import { onRequest as apiMiddleware } from "../functions/api/_middleware.js";
import { createAppSession, deleteAllAppSessions, deleteAppSession, deleteAppSessionById, deleteOtherAppSessions, listAppSessions, MAX_APP_DEVICES } from "../functions/lib/app-sessions.js";
import { hashPassword } from "../functions/lib/auth.js";
import { insertUser, makeEnv, req } from "./helpers.mjs";

const IP = { "CF-Connecting-IP": "203.0.113.30" };
const bearer = (token) => ({ Authorization: "Bearer " + token });

/** A stand-in for the Durable Object namespace: records which object was asked for and what it was sent. */
function fakeRelay() {
  const calls = [];
  const ns = {
    calls,
    idFromName: (name) => ({ name }),
    get: (id) => ({
      fetch: async (request) => {
        const body = request.method === "POST" ? await request.json() : null;
        calls.push({ object: id.name, url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body });
        return { status: 101, relay: true };
      },
    }),
  };
  return ns;
}

async function account(env) {
  return insertUser(env, { password_hash: await hashPassword("Correct-Horse-Battery-9!x", env), account_id: "rel_" + Math.random().toString(36).slice(2, 8) });
}
async function device(env, user, label = "Desk") {
  const { token } = await createAppSession(env, { userId: user.id, client: "ks-c1", device: label });
  const [row] = (await listAppSessions(env, user.id)).filter((s) => s.label === label);
  return { token, id: row.id };
}
const upgrade = (token, extra = {}) => req("/api/app/remote", { headers: { ...IP, Upgrade: "websocket", ...(token ? bearer(token) : {}), ...extra } });

test("an upgrade with a good token goes to the account's relay with the session id, and nothing the client sent", async () => {
  const env = makeEnv({ REMOTE_RELAY: fakeRelay() });
  const user = await account(env);
  const d = await device(env, user);
  const res = await remote({ request: upgrade(d.token, { "X-Relay-Session": "forged", "X-Relay-User": "999" }), env });
  assert.equal(res.status, 101);
  const [call] = env.REMOTE_RELAY.calls;
  assert.equal(call.object, "user:" + user.id);
  assert.equal(call.headers["x-relay-session"], d.id);
  assert.equal(call.headers["x-relay-user"], undefined);
  assert.equal(call.headers.upgrade, "websocket");
});

test("no token, a bad token, no upgrade, or no relay bound are each refused", async () => {
  const env = makeEnv({ REMOTE_RELAY: fakeRelay() });
  const user = await account(env);
  const d = await device(env, user);
  assert.equal((await remote({ request: upgrade(null), env })).status, 401);
  assert.equal((await remote({ request: upgrade("x".repeat(43)), env })).status, 401);
  assert.equal((await remote({ request: req("/api/app/remote", { headers: { ...IP, ...bearer(d.token) } }), env })).status, 426);
  const unbound = makeEnv();
  const user2 = await account(unbound);
  const d2 = await device(unbound, user2);
  assert.equal((await remote({ request: upgrade(d2.token), env: unbound })).status, 503);
  assert.equal(env.REMOTE_RELAY.calls.length, 0);
});

test("a switching-protocols response passes through the API middleware untouched", async () => {
  const sentinel = { status: 101, headers: new Headers(), body: null, webSocket: {} };
  const res = await apiMiddleware({ request: req("/api/app/remote", { headers: IP }), env: makeEnv(), next: async () => sentinel });
  assert.equal(res, sentinel);
});

test("signing out tells the relay to drop that device", async () => {
  const env = makeEnv({ REMOTE_RELAY: fakeRelay() });
  const user = await account(env);
  const d = await device(env, user);
  await appLogout({ request: req("/api/app/logout", { method: "POST", headers: { ...IP, ...bearer(d.token) } }), env });
  const revoke = env.REMOTE_RELAY.calls.find((c) => c.method === "POST");
  assert.deepEqual([revoke.object, revoke.url.endsWith("/revoke"), revoke.body], ["user:" + user.id, true, { sessions: [d.id] }]);
});

test("signing a device out by id, the others, or every device reaches the relay", async () => {
  const env = makeEnv({ REMOTE_RELAY: fakeRelay() });
  const user = await account(env);
  const a = await device(env, user, "A");
  const b = await device(env, user, "B");
  const c = await device(env, user, "C");
  const revoked = () => env.REMOTE_RELAY.calls.filter((x) => x.method === "POST").map((x) => x.body.sessions);

  assert.equal(await deleteAppSessionById(env, user.id, a.id), true);
  await deleteOtherAppSessions(env, user.id, c.id);
  assert.deepEqual(revoked(), [[a.id], [b.id]]);

  await deleteAllAppSessions(env, user.id);
  assert.deepEqual(revoked().at(-1), "all");

  // Another account's relay is never told.
  assert.ok(env.REMOTE_RELAY.calls.every((x) => x.object === "user:" + user.id));
});

test("the device that falls off the end of the cap is dropped from the relay", async () => {
  const env = makeEnv({ REMOTE_RELAY: fakeRelay() });
  const user = await account(env);
  const first = await device(env, user, "first");
  for (let i = 0; i < MAX_APP_DEVICES; i++) await createAppSession(env, { userId: user.id, client: "ks-c1", device: "d" + i });
  const sent = env.REMOTE_RELAY.calls.filter((x) => x.method === "POST").flatMap((x) => x.body.sessions);
  assert.ok(sent.includes(first.id), "the evicted session was not revoked at the relay");
});

test("a failing or missing relay never breaks sign-out", async () => {
  const broken = { idFromName: () => ({}), get: () => ({ fetch: async () => { throw new Error("down"); } }) };
  const env = makeEnv({ REMOTE_RELAY: broken });
  const user = await account(env);
  const d = await device(env, user);
  await deleteAppSession(env, d.token);
  assert.equal((await listAppSessions(env, user.id)).length, 0);
  const none = makeEnv();
  const u2 = await account(none);
  const d2 = await device(none, u2);
  await deleteAppSession(none, d2.token);
  assert.equal((await listAppSessions(none, u2.id)).length, 0);
});
