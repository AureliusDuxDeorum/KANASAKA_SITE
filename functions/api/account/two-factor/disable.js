import {
  deleteAllUserSessions,
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
  verifyPassword,
} from "../../../lib/auth.js";
import { disableSms2fa } from "../../../lib/two-factor.js";
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

  const password = String(body.password || "");
  const code = String(body.code || "");

  const row = await env.DB.prepare(
    "SELECT password_hash, totp_enabled FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first();

  if (!row || !row.totp_enabled) {
    return errorResponse("Two-factor authentication is not enabled.", 400);
  }

  const validPassword = await verifyPassword(password, row.password_hash, env);
  if (!validPassword) {
    return errorResponse("Current password is incorrect.", 401);
  }

  try {
    await disableSms2fa(env, user.id, code);
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
