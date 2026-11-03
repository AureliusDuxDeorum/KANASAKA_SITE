import assert from "node:assert/strict";
import { test } from "node:test";

import { errorStatus, publicError } from "../functions/lib/errors.js";

test("user-facing messages pass through", () => {
  for (const message of [
    "Invalid or expired verification code.",
    "Enter a valid phone number with country code (e.g. +49 1522 3693645).",
    "Two-factor authentication is already enabled.",
    "Too many incorrect codes. Request a new code in a few minutes.",
  ]) {
    assert.equal(publicError(new Error(message), "fallback"), message);
  }
});

test("internal details are replaced by the fallback", () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const message of [
      "D1_ERROR: no such table: users",
      "UNIQUE constraint failed: users.email",
      "fetch failed",
      "Stripe: No such customer: cus_123",
      "TypeError: Cannot read properties of undefined",
      "request to https://api.resend.com/emails failed",
      "x".repeat(500),
    ]) {
      assert.equal(publicError(new Error(message), "fallback"), "fallback", message);
    }
    assert.equal(publicError(undefined, "fallback"), "fallback");
    assert.equal(publicError({}, "fallback"), "fallback");
  } finally {
    console.error = quiet;
  }
});

test("errorStatus honours an explicit status only", () => {
  assert.equal(errorStatus({ status: 429 }, 401), 429);
  assert.equal(errorStatus(new Error("x"), 401), 401);
  assert.equal(errorStatus({ status: "429" }, 401), 401);
});
