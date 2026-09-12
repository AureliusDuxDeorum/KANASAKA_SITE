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
import { sendLoginNotificationEmail } from "../../lib/email.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

async function notifyLogin(env, email, details) {
  try {
    await sendLoginNotificationEmail(env, email, details);
  } catch (err) {
    console.error("Login notification email failed:", err);
  }
}

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
    const remember = user.remember !== false;
    const session = await createSession(env, user.user_id, remember);
    await logAuthEvent(env, "login_success", {
      ip,
      userId: user.user_id,
      method: "sms",
    });
    await notifyLogin(env, user.email, {
      success: true,
      reason: "Two-factor verification code was correct. Signed in successfully.",
      ip,
    });

    return jsonResponse(sessionPayload(user, env), 200, {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    });
  } catch (err) {
    await logAuthEvent(env, "login_2fa_failed", { ip, userId: err.userId });
    if (err.userEmail) {
      await notifyLogin(env, err.userEmail, {
        success: false,
        reason: "The two-factor verification code entered was incorrect.",
        ip,
      });
    }
    return errorResponse(err.message || "Two-factor verification failed.", 401);
  }
}
