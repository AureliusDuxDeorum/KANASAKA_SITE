// Tells KS_Link's relay when something happens to a KANASAKA account that must end what KS_Link
// has open for it. KS_Link accounts ARE KANASAKA accounts, but the relay keeps its own sessions
// (30 days) and its own data, so without this a stolen KS_Link token would survive the owner
// changing their password, and deleting the KANASAKA account would leave the KS_Link one behind.
//
//   "credentials"  password changed or reset, or two-factor sign-in switched off
//                  -> the relay ends every KS_Link session for the account
//   "deleted"      the KANASAKA account was deleted
//                  -> the relay erases the KS_Link account and its data
//
// The call is signed (HMAC-SHA256 over "<timestamp>.<body>" with the shared client secret, the
// same value the relay checks -- relay/src/signed_request.ts) so only this site can make it, and
// a captured request can neither be altered nor replayed after five minutes. It is best effort and
// never fails the action that triggered it, but a failure is written to the audit log so it is
// not silent.
import { logAuthEvent } from "./security.js";
import { ksLinkOAuthConfigured } from "./ks-link-oauth.js";

const DEFAULT_RELAY_URL = "https://link.kanasaka.com";
const ATTEMPTS = 2;
const TIMEOUT_MS = 5000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hex HMAC-SHA256 of `${timestamp}.${body}` -- must stay identical to the relay's signBody. */
export async function signRelayBody(secret, timestamp, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
}

async function send(env, userId, reason) {
  const body = JSON.stringify({ site_user_id: userId, reason });
  const timestamp = Date.now();
  const signature = await signRelayBody(String(env.KS_LINK_OAUTH_CLIENT_SECRET), timestamp, body);
  const base = String(env.KS_LINK_RELAY_URL || DEFAULT_RELAY_URL).replace(/\/+$/, "");

  let lastError = "unknown";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/internal/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-KS-Timestamp": String(timestamp), "X-KS-Signature": signature },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return { ok: true };
      lastError = `relay answered ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, reason: lastError };
}

/**
 * `context` is the Pages Functions context ({ env, waitUntil }): the call runs after the response
 * is sent where the platform allows it, so a slow relay never slows the person down.
 */
export function notifyKsLink(context, userId, reason) {
  const { env } = context;
  if (!ksLinkOAuthConfigured(env) || !Number.isInteger(userId)) return Promise.resolve();

  const work = send(env, userId, reason).then(async (result) => {
    if (!result.ok) await logAuthEvent(env, "ks_link_revoke_failed", { userId, reason, detail: String(result.reason).slice(0, 160) });
  });
  if (typeof context.waitUntil === "function") {
    context.waitUntil(work);
    return Promise.resolve();
  }
  return work;
}
