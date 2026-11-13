// POST /api/ks-link/two-factor -- the second step of signing in to the KS_Link app, after
// /api/ks-link/login answered { twoFactorRequired, challenge }. Same verification as the
// website (lib/two-factor.js), but it returns a one-time sign-in code instead of a cookie.
//
//   body:  { challenge, code, code_challenge }
//   200    { code }
import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { errorStatus, publicError } from "../../lib/errors.js";
import { issueAppSigninCode, ksLinkOAuthConfigured, isValidCodeChallenge } from "../../lib/ks-link-oauth.js";
import { approxLocation, clientIp, logAuthEvent, notifyLogin, requireSameOrigin } from "../../lib/security.js";
import { verifyTwoFactorLogin } from "../../lib/two-factor.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB || !ksLinkOAuthConfigured(env)) {
    return errorResponse("App sign-in is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);
  const location = approxLocation(request);
  const body = await readJson(request);
  if (!body) return errorResponse("Invalid request body.");

  const challenge = String(body.challenge || "");
  const code = String(body.code || "");
  if (!challenge) return errorResponse("Two-factor challenge is missing.");
  if (!code) return errorResponse("Enter the code you were sent.");
  if (!isValidCodeChallenge(body.code_challenge)) {
    return errorResponse("A PKCE S256 code_challenge is required.");
  }

  try {
    const user = await verifyTwoFactorLogin(env, challenge, code);
    const signinCode = await issueAppSigninCode(env, { userId: user.user_id, codeChallenge: body.code_challenge });
    await logAuthEvent(env, "login_success", { ip, userId: user.user_id, method: "ks-link-app-2fa" });
    await notifyLogin(env, user.email, {
      success: true,
      reason: "Two-factor verification code was correct. Signed in to the KS_Link app.",
      location,
      userId: user.user_id,
    });
    return jsonResponse({ code: signinCode });
  } catch (err) {
    await logAuthEvent(env, "login_2fa_failed", { ip, userId: err.userId });
    if (err.userEmail) {
      await notifyLogin(env, err.userEmail, {
        success: false,
        reason: "The two-factor verification code entered was incorrect.",
        location,
        userId: err.userId,
      });
    }
    return errorResponse(publicError(err, "Two-factor verification failed."), errorStatus(err, 401));
  }
}
