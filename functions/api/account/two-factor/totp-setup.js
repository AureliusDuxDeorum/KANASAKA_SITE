import {
  errorResponse,
  getSessionUser,
  jsonResponse,
} from "../../../lib/auth.js";
import { beginTotpSetup } from "../../../lib/two-factor.js";
import { requireSameOrigin, allowSend, clientIp } from "../../../lib/security.js";

import { publicError, errorStatus } from "../../../lib/errors.js";

// Step 1 of authenticator-app 2FA: mint a secret and hand it back once, as an
// otpauth:// link (for the QR code) plus the manual-entry key. Nothing is
// switched on until /totp-enable proves the app produces matching codes.
export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
  }

  if (!(await allowSend(env, "twofa_totp_setup", { ip: clientIp(request), userId: user.id }, { user: 10, ip: 30 }))) {
    return errorResponse("Too many attempts. Try again in a few minutes.", 429);
  }

  if (user.totp_enabled) {
    return errorResponse("Two-factor authentication is already enabled.", 409);
  }

  try {
    const setup = await beginTotpSetup(env, user.id);
    return jsonResponse(
      {
        success: true,
        secret: setup.secret,
        otpauthUri: setup.otpauthUri,
        message: "Scan the QR code with your authenticator app, then enter the 6-digit code it shows.",
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    return errorResponse(publicError(err, "Could not start authenticator setup."), errorStatus(err, 400));
  }
}
