import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import {
  resendSmsSetup,
  sendDisableEmailCode,
  sendDisableSmsCode,
  twoFactorColumns,
  twoFactorMethodsFromUser,
} from "../../../lib/two-factor.js";
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

  const body = await readJson(request);
  const purpose = String((body && body.purpose) || "disable");

  try {
    if (purpose === "setup") {
      const result = await resendSmsSetup(env, user.id);
      return jsonResponse({
        success: true,
        phoneMasked: result.phoneMasked,
        message: "We sent another code to " + result.phoneMasked + ".",
      });
    }

    const row = await env.DB.prepare(
      `SELECT u.totp_enabled, ${await twoFactorColumns(env, "u")} FROM users u WHERE u.id = ?`
    )
      .bind(user.id)
      .first();
    const methods = twoFactorMethodsFromUser(row);
    const wanted = String((body && body.method) || "");

    if (wanted === "totp" || (!wanted && methods.length === 1 && methods[0] === "totp")) {
      return errorResponse("Your authenticator app generates the code. Open it and enter the current 6 digits.", 400);
    }

    if (methods.includes("sms") && wanted !== "email") {
      const result = await sendDisableSmsCode(env, user.id);
      return jsonResponse({
        success: true,
        phoneMasked: result.phoneMasked,
        message: "We sent a verification code to " + result.phoneMasked + ".",
      });
    }

    const result = await sendDisableEmailCode(env, user.id);
    return jsonResponse({
      success: true,
      emailMasked: result.emailMasked,
      message: "We sent a verification code to " + result.emailMasked + ".",
    });
  } catch (err) {
    return errorResponse(publicError(err, "Could not send verification code."), errorStatus(err, 400));
  }
}
