// GET /api/oauth/authorize?client_id=...&redirect_uri=...&state=...
// Browser-facing half of the KS_Link OAuth-provider flow (see
// functions/lib/ks-link-oauth.js's module doc). Requires an existing site
// session cookie -- if absent, sends the user to log in first and back here
// afterward, same shape any "continue to X" login redirect already needs.
//
// With &check=1 the same validation runs but no code is issued and the answer is
// plain JSON ({ ok: true } or { error }): the sign-in page uses it to show the
// real reason when the hand-over to the app cannot work, instead of a redirect
// to a ks-link:// address that the browser drops silently.
//
// Two ways to finish, chosen by redirect_uri:
//   ks-link://oauth/callback   redirect to the app with ?code=...&state=... (the
//                              browser has to start the app, which fails when it
//                              is already running: see docs/KS_LINK_OAUTH.md);
//   urn:kanasaka:oauth:poll    no redirect to the app: the approval is stored and
//                              the browser lands on /link/connected/. The running
//                              app collects it by polling /api/oauth/poll.
import { jsonResponse, resolveSession } from "../../lib/auth.js";
import { assertAllowedRedirect, createAuthorizationCode, isValidCodeChallenge, ksLinkOAuthConfigured, POLL_REDIRECT_URI } from "../../lib/ks-link-oauth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env.DB || !ksLinkOAuthConfigured(env)) {
    return jsonResponse({ error: "OAuth is not configured on the server." }, 500);
  }

  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";

  // PKCE is mandatory -- see migrations/019_oauth_pkce.sql.
  if (url.searchParams.get("code_challenge_method") !== "S256" || !isValidCodeChallenge(codeChallenge)) {
    return jsonResponse({ error: "A PKCE S256 code_challenge is required." }, 400);
  }

  let safeRedirectUri;
  try {
    safeRedirectUri = assertAllowedRedirect(redirectUri);
  } catch (err) {
    return jsonResponse({ error: err.message }, 400);
  }

  if (clientId.trim() !== String(env.KS_LINK_OAUTH_CLIENT_ID).trim()) {
    return jsonResponse({ error: "Unknown client." }, 400);
  }

  const checkOnly = url.searchParams.get("check") === "1";

  const { user } = await resolveSession(request, env);
  if (!user && checkOnly) {
    return jsonResponse({ error: "You are not signed in on this browser." }, 401);
  }
  if (!user) {
    const returnTo = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${url.origin}/login/?return_to=${returnTo}`, 302);
  }

  if (!user.email_verified) {
    return jsonResponse({ error: "Verify your email address on kanasaka.com before linking KS_Link." }, 403);
  }

  const pollMode = safeRedirectUri === POLL_REDIRECT_URI;

  if (checkOnly) {
    return jsonResponse({ ok: true, mode: pollMode ? "poll" : "app" });
  }

  const code = await createAuthorizationCode(env, { userId: user.id, clientId, redirectUri: safeRedirectUri, codeChallenge });

  if (pollMode) {
    return Response.redirect(`${url.origin}/link/connected/`, 302);
  }

  const redirect = new URL(safeRedirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return Response.redirect(redirect.toString(), 302);
}
