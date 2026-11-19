import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { enableTotp2fa } from "../../../lib/two-factor.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../../lib/security.js";

import { publicError, errorStatus } from "../../../lib/errors.js";

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
    return errorResponse("Enter the 6-digit code from your authenticator app.");
  }

  try {
    const result = await enableTotp2fa(env, user.id, code);
    await logAuthEvent(env, "twofa_enabled", { ip: clientIp(request), userId: user.id, method: "totp" });
    return jsonResponse(
      {
        success: true,
        backupCodes: result.backupCodes,
        message: "Two-factor authentication is now enabled with your authenticator app.",
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    return errorResponse(publicError(err, "Could not enable two-factor authentication."), errorStatus(err, 400));
  }
}
