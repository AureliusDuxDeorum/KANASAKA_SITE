// Runs in front of every /api/* function. Two jobs:
//
//  1. CSRF backstop. Every state-changing route already calls
//     requireSameOrigin itself; this makes the rule global so a route added
//     later cannot forget it. The one exception is the Stripe webhook, which
//     is called by Stripe (no browser Origin) and authenticates with its own
//     signature instead.
//  2. Security headers on API responses. `_headers` only covers static files,
//     so JSON/avatar/installer responses from Functions did not get them.
//     Headers a handler already set (Cache-Control on the avatar, the R2
//     metadata on installer downloads) are left alone.

import { assertSameOrigin } from "../lib/security.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PATHS = new Set(["/api/stripe/webhook"]);

const API_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

export function applyApiHeaders(response) {
  const next = new Response(response.body, response);
  Object.entries(API_HEADERS).forEach(function ([name, value]) {
    if (!next.headers.has(name)) next.headers.set(name, value);
  });
  if (!next.headers.has("Cache-Control")) {
    next.headers.set("Cache-Control", "no-store");
  }
  return next;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!SAFE_METHODS.has(request.method)) {
    const { pathname } = new URL(request.url);
    if (!CSRF_EXEMPT_PATHS.has(pathname) && !assertSameOrigin(request, env)) {
      return applyApiHeaders(
        new Response(JSON.stringify({ error: "Forbidden." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  }

  return applyApiHeaders(await context.next());
}
