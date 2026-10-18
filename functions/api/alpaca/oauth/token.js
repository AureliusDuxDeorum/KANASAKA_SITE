import { errorResponse, jsonResponse, readJson } from "../../../lib/auth.js";
import {
  alpacaOAuthConfigured,
  exchangeAlpacaAuthorizationCode,
} from "../../../lib/alpaca-oauth.js";
import { clientIp, logAuthEvent } from "../../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!alpacaOAuthConfigured(env)) {
    return errorResponse(
      "Alpaca OAuth is not configured yet. Add ALPACA_CLIENT_ID and ALPACA_CLIENT_SECRET in Cloudflare Pages.",
      503
    );
  }

  let payload;
  try {
    payload = await readJson(request);
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }

  try {
    const token = await exchangeAlpacaAuthorizationCode(env, payload);
    await logAuthEvent(env, "alpaca_oauth_exchange", {
      ip: clientIp(request),
      scope: token.scope || null,
    });
    return jsonResponse(token);
  } catch (err) {
    return errorResponse(err.message || "Token exchange failed.", 400);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
