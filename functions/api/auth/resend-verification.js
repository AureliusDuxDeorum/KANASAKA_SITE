import {
  createEmailToken,
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  validateEmail,
  VERIFY_TOKEN_HOURS,
} from "../../lib/auth.js";
import { sendVerificationEmail } from "../../lib/email.js";
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
  const ipLimited = await enforceRateLimit(env, `resend:ip:${ip}`, "resendIp");
  if (ipLimited) return ipLimited;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const genericMessage =
    "If an account exists for that email, a verification link has been sent.";

  if (!validateEmail(email)) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const emailLimited = await enforceRateLimit(
    env,
    `resend:email:${email}`,
    "resendEmail"
  );
  if (emailLimited) return emailLimited;

  const user = await env.DB.prepare(
    "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!user || user.email_verified) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const token = await createEmailToken(env, user.id, "verify", VERIFY_TOKEN_HOURS);
  await sendVerificationEmail(env, email, token);
  await logAuthEvent(env, "verification_resent", { ip, userId: user.id });

  return jsonResponse({ success: true, message: genericMessage });
}
