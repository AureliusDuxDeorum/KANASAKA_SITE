import {
  errorResponse,
  getSessionUser,
  jsonResponse,
} from "../../../lib/auth.js";
import { sendTotpSetupEmailCode } from "../../../lib/two-factor.js";
import { requireSameOrigin, allowSend, clientIp } from "../../../lib/security.js";

import { publicError, errorStatus } from "../../../lib/errors.js";

// Step 0 of authenticator setup for an account that doesn't have email codes
// yet: confirm access to the account's email first.
export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
  }

  if (!(await allowSend(env, "twofa_code", { ip: clientIp(request), userId: user.id }, { user: 5, ip: 20 }))) {
    return errorResponse("Too many codes requested. Try again in a few minutes.", 429);
  }

  try {
    const sent = await sendTotpSetupEmailCode(env, user.id);
    return jsonResponse({
      success: true,
      emailMasked: sent.emailMasked,
      message: "We sent a 6-digit code to " + sent.emailMasked + ".",
    });
  } catch (err) {
    return errorResponse(publicError(err, "Could not send verification code."), errorStatus(err, 400));
  }
}
