import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { enableSms2fa } from "../../../lib/two-factor.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const code = String(body.code || "");
  if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
    return errorResponse("Enter the 6-digit code from your text message.");
  }

  try {
    const result = await enableSms2fa(env, user.id, code);
    await logAuthEvent(env, "twofa_enabled", { ip: clientIp(request), userId: user.id });
    return jsonResponse({
      success: true,
      phoneMasked: result.phoneMasked,
      message: "Two-factor authentication is now enabled for " + result.phoneMasked + ".",
    });
  } catch (err) {
    return errorResponse(err.message || "Could not enable two-factor authentication.", 400);
  }
}
