import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { runSelfTests } from "../../lib/self-test.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const actor = adminActorLabel(user);

  // The run includes an Argon2 hash and several self-requests, so it gets a
  // much tighter limit than the read-only panels.
  if (await throttleAdminAction(env, "admin_self_test_run", actor, { max: 6, windowMinutes: 10 })) {
    return errorResponse("Too many test runs. Try again in a few minutes.", 429);
  }

  await logAuthEvent(env, "admin_self_test_run", { ip: clientIp(request), email: actor });

  const report = await runSelfTests(env, { origin: new URL(request.url).origin });
  return jsonResponse(report);
}
