import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { resendSmsSetup, sendDisableSmsCode } from "../../../lib/two-factor.js";
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

    const result = await sendDisableSmsCode(env, user.id);
    return jsonResponse({
      success: true,
      phoneMasked: result.phoneMasked,
      message: "We sent a verification code to " + result.phoneMasked + ".",
    });
  } catch (err) {
    return errorResponse(err.message || "Could not send verification code.", 400);
  }
}
