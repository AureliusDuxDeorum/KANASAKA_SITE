import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
} from "../../lib/auth.js";
import { CURRENT_TOS_VERSION } from "../../lib/terms.js";
import { usersHaveTosColumns } from "../../lib/schema.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Authentication required.", 401);
  }

  const hasTos = await usersHaveTosColumns(env);
  if (!hasTos) {
    return errorResponse("Terms acceptance is not available yet.", 503);
  }

  const body = await readJson(request);
  const tosVersion = String((body && body.tosVersion) || "");

  if (tosVersion !== CURRENT_TOS_VERSION) {
    return errorResponse("Invalid Terms of Service version.");
  }

  await env.DB.prepare(
    "UPDATE users SET tos_accepted_at = datetime('now'), tos_version = ? WHERE id = ?"
  )
    .bind(CURRENT_TOS_VERSION, user.id)
    .run();

  await logAuthEvent(env, "tos_accepted", {
    ip: clientIp(request),
    userId: user.id,
    version: CURRENT_TOS_VERSION,
  });

  return jsonResponse({
    success: true,
    tosVersion: CURRENT_TOS_VERSION,
    message: "Terms of Service accepted.",
  });
}
