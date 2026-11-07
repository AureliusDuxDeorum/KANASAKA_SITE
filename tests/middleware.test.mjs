import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequest } from "../functions/api/_middleware.js";
import { ORIGIN, req } from "./helpers.mjs";

const env = { SITE_URL: ORIGIN };

function run(request, next) {
  return onRequest({ request, env, next: next || (async () => new Response("{}", { headers: { "Content-Type": "application/json" } })) });
}

test("foreign-origin POST is refused before the handler runs", async () => {
  let reached = false;
  const res = await run(req("/api/auth/logout", { method: "POST", origin: "https://evil.example" }), async () => {
    reached = true;
    return new Response("{}");
  });
  assert.equal(res.status, 403);
  assert.equal(reached, false);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("same-origin and header-less POSTs (desktop app) pass", async () => {
  assert.equal((await run(req("/api/auth/logout", { method: "POST" }))).status, 200);
  assert.equal((await run(req("/api/auth/logout", { method: "POST", origin: null }))).status, 200);
});

test("foreign Referer without an Origin is refused", async () => {
  const res = await run(req("/api/account/delete", { method: "POST", origin: null, headers: { Referer: "https://evil.example/page" } }));
  assert.equal(res.status, 403);
});

test("no route is exempt: a POST from another origin is refused whatever the path", async () => {
  const res = await run(req("/api/oauth/token", { method: "POST", origin: "https://evil.example" }));
  assert.equal(res.status, 403);
});

test("GET responses get security headers and no-store", async () => {
  const res = await run(req("/api/auth/session"));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(res.headers.get("strict-transport-security"), /max-age=/);
});

test("headers a handler already set are kept", async () => {
  const res = await run(req("/api/account/avatar"), async () =>
    new Response("img", { headers: { "Cache-Control": "private, max-age=3600", "Content-Type": "image/png" } })
  );
  assert.equal(res.headers.get("cache-control"), "private, max-age=3600");
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("works on responses with immutable headers", async () => {
  const immutable = Response.redirect(ORIGIN + "/x", 302);
  const res = await run(req("/api/x"), async () => immutable);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
