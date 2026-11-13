import {
  createSession,
  deleteAllUserSessions,
  errorResponse,
  jsonResponse,
  readJson,
  sessionCookieHeader,
  sessionPayload,
} from "../../lib/auth.js";
import { authenticateLogin } from "../../lib/login-flow.js";
import { purgeOldEvents, logAuthEvent, notifyLogin, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const remember = body.remember === true || body.remember === "true";
  const result = await authenticateLogin(context, body, { remember });
  if (result.response) return result.response;
  const { user, ip, location } = result;

  await deleteAllUserSessions(env, user.id);
  const session = await createSession(env, user.id, remember);
  await logAuthEvent(env, "login_success", { ip, userId: user.id });
  // Retention housekeeping (no cron here): occasionally trim old audit rows.
  if (Math.random() < 0.02) await purgeOldEvents(env);
  await notifyLogin(env, user.email, { success: true, reason: "Signed in successfully.", location, userId: user.id });

  return jsonResponse(sessionPayload(user, env), 200, {
    "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
  });
}
