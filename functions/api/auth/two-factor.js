import {
  createSession,
  deleteAllUserSessions,
  errorResponse,
  jsonResponse,
  readJson,
  sessionCookieHeader,
  sessionPayload,
} from "../../lib/auth.js";
import { verifyTwoFactorLogin } from "../../lib/two-factor.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);
  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const challenge = String(body.challenge || "");
  const code = String(body.code || "");

  if (!challenge) {
    return errorResponse("Two-factor challenge is missing.");
  }

  if (!code) {
    return errorResponse("Enter the 6-digit code from your text message.");
  }

  try {
    const user = await verifyTwoFactorLogin(env, challenge, code);
    await deleteAllUserSessions(env, user.user_id);
    const session = await createSession(env, user.user_id);
    await logAuthEvent(env, "login_success", {
      ip,
      userId: user.user_id,
      method: "sms",
    });

    return jsonResponse(sessionPayload(user), 200, {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    });
  } catch (err) {
    await logAuthEvent(env, "login_2fa_failed", { ip });
    return errorResponse(err.message || "Two-factor verification failed.", 401);
  }
}
