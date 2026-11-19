import {
  deleteAllUserSessions,
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../../lib/auth.js";
import { removeTwoFactorMethod, twoFactorColumns, twoFactorMethodsFromUser } from "../../../lib/two-factor.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../../lib/security.js";
import { notifyKsLink } from "../../../lib/ks-link-revoke.js";

import { publicError, errorStatus } from "../../../lib/errors.js";
import { deleteAllAppSessions } from "../../../lib/app-sessions.js";

// Removes ONE second factor ({ method: "email" | "totp", code }); removing the
// last one switches two-factor off. With a single method enabled `method` may
// be left out.
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
    `SELECT u.totp_enabled, ${await twoFactorColumns(env, "u")} FROM users u WHERE u.id = ?`
  )
    .bind(user.id)
    .first();

  const methods = twoFactorMethodsFromUser(row);
  if (!methods.length) {
    return errorResponse("Two-factor authentication is not enabled.", 400);
  }

  const method = String(body.method || (methods.length === 1 ? methods[0] : ""));
  if (!methods.includes(method)) {
    return errorResponse("Choose which method to remove.", 400);
  }

  try {
    const result = await removeTwoFactorMethod(env, user.id, method, code);
    await deleteAllUserSessions(env, user.id);
    await deleteAllAppSessions(env, user.id);
    await notifyKsLink(context, user.id, "credentials");
    await logAuthEvent(env, result.remaining.length ? "twofa_method_removed" : "twofa_disabled", {
      ip: clientIp(request),
      userId: user.id,
      method,
    });

    return jsonResponse({
      success: true,
      remaining: result.remaining,
      message: result.remaining.length
        ? "Removed. Sign in again on each device."
        : "Two-factor authentication disabled. Sign in again on each device.",
    });
  } catch (err) {
    return errorResponse(publicError(err, "Could not disable two-factor authentication."), errorStatus(err, 401));
  }
}
