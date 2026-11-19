// GET /api/app/session -- is this device still signed in? Bearer token in `Authorization`. Slides the expiry (at most hourly).
//   200  { authenticated: true, profile, plan, device: { id, label, expiresAt } }
//   401  { authenticated: false, error }
import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { appPlan, appProfile, resolveAppSession } from "../../lib/app-sessions.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const { user, session } = await resolveAppSession(request, env);
  if (!user) {
    return jsonResponse({ authenticated: false, error: "Not signed in." }, 401);
  }

  return jsonResponse({
    authenticated: true,
    profile: appProfile(user, env),
    plan: appPlan(),
    device: { id: session.id, label: session.label, expiresAt: session.expiresAt },
  });
}
