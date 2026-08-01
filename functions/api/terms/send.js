import {
  errorResponse,
  jsonResponse,
  normalizeEmail,
  readJson,
  validateEmail,
} from "../../lib/auth.js";
import { sendTermsEmail } from "../../lib/email.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

const SUCCESS_MESSAGE =
  "If the address is valid, the full Terms of Service will arrive shortly.";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const email = normalizeEmail(body.email);
  const ip = clientIp(request);

  if (!validateEmail(email)) {
    return jsonResponse({ success: true, message: SUCCESS_MESSAGE });
  }

  const result = await sendTermsEmail(env, email);

  if (!result.ok) {
    console.error("Terms email failed:", result.reason);
    await logAuthEvent(env, "terms_email_failed", { ip, reason: result.reason });
    return errorResponse(
      "Could not send the Terms of Service right now. Try again later.",
      503
    );
  }

  await logAuthEvent(env, "terms_email_sent", { ip });

  return jsonResponse({ success: true, message: SUCCESS_MESSAGE });
}
