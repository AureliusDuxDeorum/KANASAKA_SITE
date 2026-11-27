import assert from "node:assert/strict";
import { test } from "node:test";

import { sendTwoFactorCodeEmail } from "../functions/lib/email.js";
import { makeEnv } from "./helpers.mjs";

// A two-factor code email that Resend refuses must surface as an error, never as a silent success
// (the sign-in screen would otherwise say "we sent a code" when nothing was sent).

async function withResend(response, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("a code email that is sent returns ok", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test" });
  const result = await withResend(new Response(JSON.stringify({ id: "m" }), { status: 200 }), () => sendTwoFactorCodeEmail(env, "a@example.com", "123456", "login"));
  assert.equal(result.ok, true);
});

test("a code email Resend refuses throws instead of passing silently", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test" });
  await assert.rejects(
    withResend(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }), () => sendTwoFactorCodeEmail(env, "a@example.com", "123456", "login")),
    /./
  );
});

test("a code email with no mail key configured throws too", async () => {
  const env = makeEnv();
  await assert.rejects(sendTwoFactorCodeEmail(env, "a@example.com", "123456", "login"), /RESEND_API_KEY/);
});
