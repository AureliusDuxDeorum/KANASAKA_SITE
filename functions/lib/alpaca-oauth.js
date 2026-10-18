const ALLOWED_REDIRECT_URIS = new Set([
  "http://127.0.0.1:8742/oauth/callback",
  "https://kanasaka.com/api/alpaca/oauth/callback",
]);

const TOKEN_URL = "https://api.alpaca.markets/oauth/token";

export function alpacaOAuthConfigured(env) {
  return Boolean(env.ALPACA_CLIENT_ID && env.ALPACA_CLIENT_SECRET);
}

export function assertAllowedRedirect(redirectUri) {
  const value = String(redirectUri || "").trim();
  if (!ALLOWED_REDIRECT_URIS.has(value)) {
    throw new Error("Redirect URI is not allowed.");
  }
  return value;
}

export async function exchangeAlpacaAuthorizationCode(env, payload) {
  if (!alpacaOAuthConfigured(env)) {
    throw new Error("Alpaca OAuth is not configured on the server.");
  }

  const code = String(payload.code || "").trim();
  const clientId = String(payload.client_id || "").trim();
  const redirectUri = assertAllowedRedirect(payload.redirect_uri);

  if (!code) {
    throw new Error("Authorization code is required.");
  }

  if (clientId.toLowerCase() !== String(env.ALPACA_CLIENT_ID).trim().toLowerCase()) {
    throw new Error("Client ID does not match.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: String(env.ALPACA_CLIENT_SECRET),
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data && data.message
        ? String(data.message)
        : `Alpaca token exchange failed (${response.status}).`;
    throw new Error(message);
  }

  if (!data.access_token) {
    throw new Error("Alpaca did not return an access token.");
  }

  return {
    access_token: String(data.access_token),
    token_type: data.token_type ? String(data.token_type) : "bearer",
    scope: data.scope ? String(data.scope) : "",
  };
}
