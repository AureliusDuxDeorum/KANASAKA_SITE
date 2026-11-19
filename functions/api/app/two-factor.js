// POST /api/app/two-factor -- the second step of signing in from a native app, after /api/app/login answered { twoFactorRequired,
// challenge }. Same verification as the website (lib/two-factor.js): an authenticator code, an emailed or texted code, or a backup
// code. Returns an app session, not a cookie.
//
//   body:  { challenge, code, client, device }
//   200    { token, expiresAt, profile, plan }
import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { appSessionsTableExists } from "../../lib/schema.js";
import { appPlan, appProfile, cleanDeviceLabel, createAppSession, loadProfileUser, normalizeClient } from "../../lib/app-sessions.js";
import { errorStatus, publicError } from "../../lib/errors.js";
import { approxLocation, clientIp, logAuthEvent, notifyLogin, requireSameOrigin } from "../../lib/security.js";
import { verifyTwoFactorLogin } from "../../lib/two-factor.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  if (!(await appSessionsTableExists(env))) {
    return errorResponse("App sign-in is not available yet. Try again later.", 503);
  }

  const ip = clientIp(request);
  const location = approxLocation(request);
  const body = await readJson(request);
  if (!body) return errorResponse("Invalid request body.");

  const client = normalizeClient(body.client);
  if (!client) return errorResponse("Unknown app.");

  const challenge = String(body.challenge || "");
  const code = String(body.code || "");
  if (!challenge) return errorResponse("Two-factor challenge is missing.");
  if (!code) return errorResponse("Enter your verification code.");

  try {
    const user = await verifyTwoFactorLogin(env, challenge, code);
    const session = await createAppSession(env, { userId: user.user_id, client, device: body.device });
    await logAuthEvent(env, "login_success", { ip, userId: user.user_id, method: "app:" + client + ":2fa" });
    await notifyLogin(env, user.email, {
      success: true,
      reason: "Two-factor verification code was correct. Signed in to the " + client.toUpperCase() + " app on " + cleanDeviceLabel(body.device) + ".",
      location,
      userId: user.user_id,
    });

    return jsonResponse({ token: session.token, expiresAt: session.expiresAt, profile: appProfile(await loadProfileUser(env, user.user_id), env), plan: appPlan() });
  } catch (err) {
    await logAuthEvent(env, "login_2fa_failed", { ip, userId: err.userId });
    if (err.userEmail) {
      await notifyLogin(env, err.userEmail, {
        success: false,
        reason: "The two-factor verification code entered was incorrect.",
        location,
        userId: err.userId,
      });
    }
    return errorResponse(publicError(err, "Two-factor verification failed."), errorStatus(err, 401));
  }
}
