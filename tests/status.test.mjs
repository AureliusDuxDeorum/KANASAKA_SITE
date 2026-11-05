import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStatus, onRequestGet } from "../functions/api/status.js";
import { makeEnv } from "./helpers.mjs";

const bucket = (impl) => ({ head: impl || (async () => null) });

test("status: everything answering reports operational", async () => {
  const env = { ...makeEnv(), INSTALLERS: bucket() };
  const status = await buildStatus(env);
  assert.equal(status.status, "operational");
  assert.deepEqual(status.components.map((c) => [c.id, c.ok]), [["site", true], ["api", true], ["database", true], ["downloads", true]]);
  assert.ok(!Number.isNaN(Date.parse(status.checkedAt)));
});

test("status: a failing database or bucket reports degraded, never the error", async () => {
  const env = {
    DB: { prepare() { throw new Error("D1_ERROR: no such table secret_table"); } },
    INSTALLERS: bucket(async () => { throw new Error("r2 exploded with key abc123"); }),
  };
  const status = await buildStatus(env);
  assert.equal(status.status, "degraded");
  assert.equal(status.components.find((c) => c.id === "database").ok, false);
  assert.equal(status.components.find((c) => c.id === "downloads").ok, false);
  assert.equal(status.components.find((c) => c.id === "site").ok, true);
  const text = JSON.stringify(status);
  assert.ok(!/D1_ERROR|secret_table|abc123|exploded/.test(text));
});

test("status: missing bindings count as down, and the response carries only booleans", async () => {
  const status = await buildStatus({});
  assert.equal(status.status, "degraded");
  for (const c of status.components) assert.deepEqual(Object.keys(c).sort(), ["id", "label", "ok"]);
});

test("status: a hung dependency is cut off by the timeout", async () => {
  const started = Date.now();
  const status = await buildStatus({ DB: { prepare: () => ({ first: () => new Promise(() => {}) }) }, INSTALLERS: bucket() });
  assert.equal(status.components.find((c) => c.id === "database").ok, false);
  assert.ok(Date.now() - started < 5000);
});

test("status: GET returns JSON, cacheable for 30 s", async () => {
  const res = await onRequestGet({ env: { ...makeEnv(), INSTALLERS: bucket() } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.equal(res.headers.get("cache-control"), "public, max-age=30");
  assert.equal((await res.json()).status, "operational");
});
