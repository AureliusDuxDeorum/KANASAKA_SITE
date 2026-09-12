import {
  deleteAllUserSessions,
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { disableEmail2fa, disableSms2fa } from "../../../lib/two-factor.js";
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

  const row = await env.DB.prepare(
    "SELECT totp_enabled, phone_e164 FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first();

  if (!row || !row.totp_enabled) {
    return errorResponse("Two-factor authentication is not enabled.", 400);
  }

  try {
    if (row.phone_e164) {
      await disableSms2fa(env, user.id, code);
    } else {
      await disableEmail2fa(env, user.id, code);
    }
    await deleteAllUserSessions(env, user.id);
    await logAuthEvent(env, "twofa_disabled", { ip: clientIp(request), userId: user.id });

    return jsonResponse({
      success: true,
      message: "Two-factor authentication disabled. Sign in again on each device.",
    });
  } catch (err) {
    return errorResponse(err.message || "Could not disable two-factor authentication.", 401);
  }
}
