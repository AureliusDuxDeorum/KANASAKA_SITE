import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { cancelPendingRoleChange } from "../../lib/pending-changes.js";
import { clientIp, logAuthEvent } from "../../lib/security.js";

// Reached by clicking the cancel link in a pending-role-change email --
// possession of the (long, random, single-use) token is the credential
// here, the same "magic link" pattern as email verification/reset links.
// No session or admin check: the whole point is that the affected account
// (who may not even be logged in, or isn't an admin at all) can stop an
// unauthorized change without needing to authenticate first.
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    return errorResponse("Missing cancellation token.", 400);
  }

  const cancelled = await cancelPendingRoleChange(env, token);
  if (!cancelled) {
    return jsonResponse(
      {
        success: false,
        message:
          "This role change is no longer pending -- it may have already been applied, already cancelled, or the link is invalid.",
      },
      404
    );
  }

  await logAuthEvent(env, "admin_role_change_cancelled", {
    ip: clientIp(request),
    userId: cancelled.user_id,
    previousRole: cancelled.previous_role,
    attemptedRole: cancelled.new_role,
  });

  return jsonResponse({
    success: true,
    message: "The pending role change (to " + cancelled.new_role + ") was cancelled.",
  });
}
