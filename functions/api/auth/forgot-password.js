import {
  createEmailToken,
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  RESET_TOKEN_HOURS,
  validateEmail,
} from "../../lib/auth.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import {
  clientIp,
  enforceRateLimit,
  logAuthEvent,
  requireSameOrigin,
} from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);
  const ipLimited = await enforceRateLimit(env, `forgot:ip:${ip}`, "forgotIp");
  if (ipLimited) return ipLimited;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const genericMessage =
    "If an account exists for that email, a password reset link has been sent.";

  if (!validateEmail(email)) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const emailLimited = await enforceRateLimit(
    env,
    `forgot:email:${email}`,
    "forgotEmail"
  );
  if (emailLimited) return emailLimited;

  const user = await env.DB.prepare(
    "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!user || !user.email_verified) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const token = await createEmailToken(env, user.id, "reset", RESET_TOKEN_HOURS);
  await sendPasswordResetEmail(env, email, token);
  await logAuthEvent(env, "password_reset_requested", { ip, userId: user.id });

  return jsonResponse({ success: true, message: genericMessage });
}
