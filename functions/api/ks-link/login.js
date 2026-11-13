// POST /api/ks-link/login -- signing in to the KS_Link app with a KANASAKA account.
//
// The app asks here directly (over HTTPS, from the app itself): the relay never sees the
// password. It runs the same credential checks as the website login (lib/login-flow.js --
// same throttles, same verified-email rule, same two-factor step) but starts NO site
// session and signs nobody out on the website. On success it returns a single-use,
// short-lived code that is bound to a PKCE challenge the app made; only the app, holding
// the matching verifier, can have the relay redeem it (functions/api/oauth/token.js).
//
//   body:      { email, password, code_challenge }
//   200        { code }
//   200        { twoFactorRequired, challenge, method, phoneMasked, emailMasked, expiresIn }
//                -> finish with POST /api/ks-link/two-factor
//   400/401/429/503   { error }  (same wording as the website for credential failures)
import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { authenticateLogin } from "../../lib/login-flow.js";
import { issueAppSigninCode, ksLinkOAuthConfigured, isValidCodeChallenge } from "../../lib/ks-link-oauth.js";
import { logAuthEvent, notifyLogin, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB || !ksLinkOAuthConfigured(env)) {
    return errorResponse("App sign-in is not configured.", 503);
  }

  // A browser on another website must not be able to drive this; a native app sends no Origin.
  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const body = await readJson(request);
  if (!body) return errorResponse("Invalid request body.");
  if (!isValidCodeChallenge(body.code_challenge)) {
    return errorResponse("A PKCE S256 code_challenge is required.");
  }

  const result = await authenticateLogin(context, body, { remember: false });
  if (result.response) return result.response;
  const { user, ip, location } = result;

  const code = await issueAppSigninCode(env, { userId: user.id, codeChallenge: body.code_challenge });
  await logAuthEvent(env, "login_success", { ip, userId: user.id, method: "ks-link-app" });
  await notifyLogin(env, user.email, { success: true, reason: "Signed in to the KS_Link app.", location, userId: user.id });
  return jsonResponse({ code });
}
