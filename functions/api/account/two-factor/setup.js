import { errorResponse, getSessionUser, jsonResponse, readJson } from "../../../lib/auth.js";
import { beginTotpSetup } from "../../../lib/two-factor.js";
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
    const setup = await beginTotpSetup(env, user.id, user.email);
    return jsonResponse({
      success: true,
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
      message: "Scan the setup key in your authenticator app, then confirm with a code.",
    });
  } catch (err) {
    return errorResponse(err.message || "Could not start two-factor setup.", 500);
  }
}
