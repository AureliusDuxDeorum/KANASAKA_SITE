import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { beginSmsSetup } from "../../../lib/two-factor.js";
import { requireSameOrigin, allowSend, clientIp } from "../../../lib/security.js";

import { publicError, errorStatus } from "../../../lib/errors.js";

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

  if (user.totp_enabled) {
    return errorResponse("Two-factor authentication is already enabled.", 409);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const phone = String(body.phone || "");
  if (!phone.trim()) {
    return errorResponse("Enter your phone number.");
  }

  try {
    const setup = await beginSmsSetup(env, user.id, phone);
    return jsonResponse({
      success: true,
      phoneMasked: setup.phoneMasked,
      message: "We sent a 6-digit code to " + setup.phoneMasked + ".",
    });
  } catch (err) {
    return errorResponse(publicError(err, "Could not send verification code."), errorStatus(err, 400));
  }
}
