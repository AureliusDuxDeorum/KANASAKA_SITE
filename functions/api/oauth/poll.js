// POST /api/oauth/poll -- server-to-server only (KS_Link's relay, with the client
// secret), the second half of poll mode (see functions/api/oauth/authorize.js and
// docs/KS_LINK_OAUTH.md). The app keeps running while the browser signs the person
// in; the relay asks here with the app's PKCE verifier until the approval exists.
//
//   body:   { client_id, client_secret, code_verifier }
//   202     { status: "pending" }           nothing approved yet (or expired / never started)
//   200     { status: "approved", site_user_id, email, display_name, account_id }   single use
//   400     { error }                       bad client, secret or verifier
import { jsonResponse } from "../../lib/auth.js";
import { pollAuthorization } from "../../lib/ks-link-oauth.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Same rule as /api/oauth/token: the relay sends no Origin header, a browser on
  // another site is refused.
  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  if (!env.DB) {
    return jsonResponse({ error: "Not configured." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  try {
    const result = await pollAuthorization(env, {
      clientId: body.client_id,
      clientSecret: body.client_secret,
      codeVerifier: body.code_verifier,
    });
    if (!result) return jsonResponse({ status: "pending" }, 202);
    return jsonResponse({ status: "approved", ...result });
  } catch (err) {
    return jsonResponse({ error: err.message }, 400);
  }
}
