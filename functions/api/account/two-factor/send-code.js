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
} from "../../../lib/two-factor.js";
import { requireSameOrigin } from "../../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
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

    const row = await env.DB.prepare("SELECT phone_e164 FROM users WHERE id = ?")
      .bind(user.id)
      .first();

    if (row && row.phone_e164) {
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
    return errorResponse(err.message || "Could not send verification code.", 400);
  }
}
