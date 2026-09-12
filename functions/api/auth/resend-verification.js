import {
  createVerificationCode,
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  validateEmail,
} from "../../lib/auth.js";
import { sendVerificationCodeEmail } from "../../lib/email.js";
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

  const email = normalizeEmail(body.email);
  const genericMessage =
    "If an account exists for that email, a verification code has been sent.";

  if (!validateEmail(email)) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const user = await env.DB.prepare(
    "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!user || user.email_verified) {
    return jsonResponse({ success: true, message: genericMessage });
  }

  const code = await createVerificationCode(env, user.id);
  await sendVerificationCodeEmail(env, email, code);
  await logAuthEvent(env, "verification_resent", { ip, userId: user.id });

  return jsonResponse({ success: true, message: genericMessage });
}
