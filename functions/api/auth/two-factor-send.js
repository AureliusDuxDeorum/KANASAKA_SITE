import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { sendLoginCodeForChallenge } from "../../lib/two-factor.js";
import { allowSend, clientIp, requireSameOrigin } from "../../lib/security.js";
import { publicError, errorStatus } from "../../lib/errors.js";

// "Email me a code instead": during the second sign-in step, an account that has
// both an authenticator app and email codes can ask for the emailed one.
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const body = await readJson(request);
  const challenge = String((body && body.challenge) || "");
  if (!challenge) {
    return errorResponse("Two-factor challenge is missing.");
  }

  const ip = clientIp(request);
  if (!(await allowSend(env, "twofa_code", { ip }, { ip: 20 }))) {
    return errorResponse("Too many codes requested. Try again in a few minutes.", 429);
  }

  try {
    const sent = await sendLoginCodeForChallenge(env, challenge, function (userId) {
      return allowSend(env, "twofa_code", { userId }, { user: 5 });
    });
    return jsonResponse({
      success: true,
      emailMasked: sent.emailMasked,
      message: "We sent a 6-digit code to " + sent.emailMasked + ".",
    });
  } catch (err) {
    return errorResponse(publicError(err, "Could not send verification code."), errorStatus(err, 400));
  }
}
