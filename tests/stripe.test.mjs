import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyStripeWebhook } from "../functions/lib/stripe.js";
import { onRequestPost as webhook } from "../functions/api/stripe/webhook.js";
import { onRequest as middleware } from "../functions/api/_middleware.js";
import { makeEnv, ORIGIN } from "./helpers.mjs";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "ping" });

async function sign(t, body = BODY, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body)));
  return "t=" + t + ",v1=" + Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

const request = (header, body = BODY) =>
  new Request(ORIGIN + "/api/stripe/webhook", { method: "POST", headers: header ? { "stripe-signature": header } : {}, body });

const now = () => Math.floor(Date.now() / 1000);
const env = { STRIPE_WEBHOOK_SECRET: SECRET };

test("valid signature is accepted", async () => {
  const event = await verifyStripeWebhook(request(await sign(now())), env, BODY);
  assert.equal(event.id, "evt_1");
});

test("tampered body, wrong secret, missing header, stale and future timestamps are rejected", async () => {
  assert.equal(await verifyStripeWebhook(request(await sign(now())), env, BODY + " "), null);
  assert.equal(await verifyStripeWebhook(request(await sign(now(), BODY, "other")), env, BODY), null);
  assert.equal(await verifyStripeWebhook(request(null), env, BODY), null);
  assert.equal(await verifyStripeWebhook(request(await sign(now() - 3600)), env, BODY), null);
  assert.equal(await verifyStripeWebhook(request(await sign(now() + 3600)), env, BODY), null);
  assert.equal(await verifyStripeWebhook(request("t=abc,v1=zz"), env, BODY), null);
  assert.equal(await verifyStripeWebhook(request(await sign(now())), {}, BODY), null);
});

test("webhook handler: unsigned requests get 400 and nothing is processed", async () => {
  const res = await webhook({ request: request(null), env: makeEnv({ STRIPE_WEBHOOK_SECRET: SECRET }) });
  assert.equal(res.status, 400);
  const unconfigured = await webhook({ request: request(await sign(now())), env: makeEnv() });
  assert.equal(unconfigured.status, 503);
});

test("webhook is reachable through the middleware without a browser Origin", async () => {
  const res = await middleware({
    request: request(await sign(now())),
    env: makeEnv({ STRIPE_WEBHOOK_SECRET: SECRET }),
    next: () => webhook({ request: request(null), env: makeEnv({ STRIPE_WEBHOOK_SECRET: SECRET }) }),
  });
  assert.equal(res.status, 400, "reached the handler (which rejected the unsigned body) instead of a 403 from CSRF");
});
