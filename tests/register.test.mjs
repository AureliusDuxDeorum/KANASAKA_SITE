// Registration, including the Terms-version handshake that broke it twice: the
// page sends the version it was built with and the server accepts only the
// current one, so a client and a server that disagree (or a stale cached script)
// show up as "You must accept the current Terms...".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { onRequestPost as register } from "../functions/api/auth/register.js";
import { CURRENT_TOS_VERSION } from "../functions/lib/terms.js";
import { json, makeEnv, req, ROOT } from "./helpers.mjs";

const PASSWORD = "Correct-Horse-Battery-9!x";
const quiet = async (fn) => {
  const log = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = log;
  }
};

async function withEmail(ok, fn) {
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: init && init.body });
    return ok ? new Response(JSON.stringify({ id: "mail_1" }), { status: 200 }) : new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 });
  };
  try {
    return await fn(sent);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const post = (env, body) => register({ request: req("/api/auth/register", { method: "POST", body, headers: { "CF-Connecting-IP": "203.0.113.9" } }), env });
const payload = (extra = {}) => ({ email: "new.person@example.com", password: PASSWORD, tosAccepted: true, tosVersion: CURRENT_TOS_VERSION, ...extra });

test("register: a new account is created and a verification code is emailed", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test" });
  await withEmail(true, async (sent) => {
    const res = await post(env, payload());
    assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
    assert.equal(sent.length, 1);
    assert.ok(sent[0].url.includes("resend.com"));
  });
  const row = await env.DB.prepare("SELECT email, email_verified, tos_version FROM users WHERE email = ?").bind("new.person@example.com").first();
  assert.equal(row.email_verified, 0);
  assert.equal(row.tos_version, CURRENT_TOS_VERSION);
});

test("register: an old Terms version is refused with a clear message", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test" });
  await withEmail(true, async () => {
    const res = await post(env, payload({ tosVersion: String(Number(CURRENT_TOS_VERSION) - 1) }));
    assert.equal(res.status, 400);
    assert.match((await json(res)).error, /current Terms of Service/);
  });
  const none = await withEmail(true, async () => post(env, payload({ tosAccepted: false })));
  assert.equal(none.status, 400);
});

test("register: if the verification email cannot be sent, nothing is left behind", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test" });
  const res = await quiet(() => withEmail(false, () => post(env, payload())));
  assert.equal(res.status, 503);
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE email = ?").bind("new.person@example.com").first();
  assert.equal(row.c, 0);
});

test("the Terms version is the same in the server, the acceptance dialog and the registration form", () => {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
  const dialog = read("assets/js/tos.js").match(/var TOS_VERSION = "([^"]+)"/);
  const form = read("assets/js/auth.js").match(/TOS_VERSION\) \|\| "([^"]+)"/);
  assert.ok(dialog && form, "could not find the version constants");
  assert.equal(dialog[1], CURRENT_TOS_VERSION, "assets/js/tos.js vs functions/lib/terms.js");
  assert.equal(form[1], CURRENT_TOS_VERSION, "fallback in assets/js/auth.js vs functions/lib/terms.js");
});
