import {
  errorResponse,
  getSessionUser,
  jsonResponse,
} from "../../../lib/auth.js";
import { beginEmailSetup } from "../../../lib/two-factor.js";
import { requireSameOrigin } from "../../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage two-factor authentication.", 401);
  }

  if (user.totp_enabled) {
    return errorResponse("Two-factor authentication is already enabled.", 409);
  }

  try {
    const setup = await beginEmailSetup(env, user.id);
    return jsonResponse({
      success: true,
      emailMasked: setup.emailMasked,
      message: "We sent a 6-digit code to " + setup.emailMasked + ".",
    });
  } catch (err) {
    return errorResponse(err.message || "Could not send verification code.", 400);
  }
}
