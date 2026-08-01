#!/usr/bin/env node
/**
 * Send a test SMS via Twilio to verify credentials before adding them to Cloudflare.
 *
 * Usage:
 *   TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx TWILIO_FROM_NUMBER=+1xxx \
 *     node scripts/test-twilio-sms.mjs +4915223693645
 */

const to = process.argv[2];
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

if (!to || !accountSid || !authToken || !from) {
  console.error("Usage:");
  console.error("  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=... \\");
  console.error("    node scripts/test-twilio-sms.mjs +4915223693645");
  process.exit(1);
}

const code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
const url =
  "https://api.twilio.com/2010-04-01/Accounts/" +
  encodeURIComponent(accountSid) +
  "/Messages.json";

const body = new URLSearchParams({
  To: to,
  From: from,
  Body: "KANASAKA test code: " + code,
});

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: "Basic " + btoa(accountSid + ":" + authToken),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});

const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}

if (!response.ok) {
  console.error("[twilio] FAILED", response.status, data.message || data.raw || data);
  process.exit(1);
}

console.log("[twilio] OK — message sent to", to);
console.log("[twilio] SID:", data.sid);
console.log("[twilio] Test code (for your eyes only):", code);
