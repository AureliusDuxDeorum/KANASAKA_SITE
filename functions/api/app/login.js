// POST /api/app/login -- signing in from a native app (KS_C1) with a KANASAKA account.
//
// The same credential checks as the website login (lib/login-flow.js: the same throttles, verified-email rule and second step), but
// it starts an APP session (lib/app-sessions.js), not a website one: no cookie is set, and the website session and the account's
// other devices are left alone. It sits outside /api/auth/ on purpose, so the managed challenge the WAF puts on /api/auth/login
// (which a native app cannot solve) does not apply; see docs/CLOUDFLARE_WAF.md.
//
//   body:  { email, password, client, device }
//   200    { token, expiresAt, profile, plan }
//   200    { twoFactorRequired, challenge, method, methods, phoneMasked, emailMasked, expiresIn }
//            -> finish with POST /api/app/two-factor
//   400/401/429/503   { error }
import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { appSessionsTableExists } from "../../lib/schema.js";
import { appPlan, appProfile, cleanDeviceLabel, createAppSession, loadProfileUser, normalizeClient } from "../../lib/app-sessions.js";
import { authenticateLogin } from "../../lib/login-flow.js";
import { logAuthEvent, notifyLogin, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  if (!(await appSessionsTableExists(env))) {
    return errorResponse("App sign-in is not available yet. Try again later.", 503);
  }

  const body = await readJson(request);
  if (!body) return errorResponse("Invalid request body.");

  const client = normalizeClient(body.client);
  if (!client) return errorResponse("Unknown app.");

  const result = await authenticateLogin(context, body, { remember: false });
  if (result.response) return result.response;
  const { user, ip, location } = result;

  const session = await createAppSession(env, { userId: user.id, client, device: body.device });
  await logAuthEvent(env, "login_success", { ip, userId: user.id, method: "app:" + client });
  await notifyLogin(env, user.email, {
    success: true,
    reason: "Signed in to the " + client.toUpperCase() + " app on " + cleanDeviceLabel(body.device) + ".",
    location,
    userId: user.id,
  });

  return jsonResponse({ token: session.token, expiresAt: session.expiresAt, profile: appProfile(await loadProfileUser(env, user.id), env), plan: appPlan() });
}
