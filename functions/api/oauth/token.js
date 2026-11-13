// POST /api/oauth/token -- server-to-server only, called by KS_Link's relay
// (never the KS_Link app directly, which is why this takes a client_secret
// the app itself never holds). Body: { code, client_id, client_secret,
// code_verifier }. Returns { site_user_id, email, display_name, account_id }
// as a plain JSON response -- no JWT, this response is consumed once,
// directly, by the relay's own request, not parsed/trusted by a client.
import { jsonResponse } from "../../lib/auth.js";
import { exchangeAuthorizationCode } from "../../lib/ks-link-oauth.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Called server-to-server by KS_Link's relay, which sends no Origin header
  // and so passes; what this refuses is a browser on another site calling it.
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
    const result = await exchangeAuthorizationCode(env, {
      code: body.code,
      clientId: body.client_id,
      clientSecret: body.client_secret,
      codeVerifier: body.code_verifier,
    });
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message }, 400);
  }
}
