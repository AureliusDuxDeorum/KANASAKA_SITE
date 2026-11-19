// POST /api/app/two-factor-send -- "email me a code instead", during the second sign-in step. The same as the website's
// /api/auth/two-factor-send (it sets no cookie and the challenge is all it needs); this path exists so a native app stays on /api/app/,
// outside the managed challenge the WAF puts on /api/auth/.
import { requireSameOrigin } from "../../lib/security.js";
import { onRequestPost as sendEmailCode } from "../auth/two-factor-send.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request, context.env);
  if (originError) return originError;
  return sendEmailCode(context);
}
