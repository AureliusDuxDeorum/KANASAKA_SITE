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

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);

  if (!validateEmail(email)) {
    return jsonResponse({
      success: true,
      message: "If an account exists for that email, a verification link has been sent.",
    });
  }

  const user = await env.DB.prepare(
    "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
  )
    .bind(email)
    .first();

  if (!user || user.email_verified) {
    return jsonResponse({
      success: true,
      message: "If an account exists for that email, a verification link has been sent.",
    });
  }

  const token = await createEmailToken(env, user.id, "verify", VERIFY_TOKEN_HOURS);
  await sendVerificationEmail(env, email, token);

  return jsonResponse({
    success: true,
    message: "If an account exists for that email, a verification link has been sent.",
  });
}
