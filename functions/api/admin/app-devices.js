// POST /api/admin/app-devices -- sign out an account's app devices (KS_C1). For an admin helping a user whose device was lost, or
// closing a compromised account. The device list itself comes with /api/admin/lookup.
//   body:  { q: "<email or account ID>", deviceId: "<id>" }   one device
//          { q: "<email or account ID>", all: true }          every device
// Session-or-secret gated like the other admin endpoints (the session path also needs two-factor on, see requireAdminAccess). It
// signs devices out, it never grants anything, so it does not ask for the admin's password again the way a role change does.
import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { deleteAllAppSessions, deleteAppSessionById } from "../../lib/app-sessions.js";
import { normalizeAccountId } from "../../lib/ks-stocks-access.js";
import { adminActorLabel, clientIp, logAuthEvent, requireAdminAccess, requireSameOrigin, throttleAdminAction } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user: actingUser, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const actor = adminActorLabel(actingUser);
  const ip = clientIp(request);

  if (await throttleAdminAction(env, "admin_app_devices", actor, { max: 20, windowMinutes: 10 })) {
    return errorResponse("Too many requests. Try again later.", 429);
  }

  const body = await readJson(request);
  if (!body) return errorResponse("Invalid request body.");

  const query = String(body.q || "").trim();
  if (!query) return errorResponse("Provide an email or account ID.");
  if (!body.all && !body.deviceId) return errorResponse("Say which device, or all.");

  const target = await env.DB.prepare("SELECT id, email FROM users WHERE email = ? COLLATE NOCASE OR account_id = ? COLLATE NOCASE")
    .bind(query, normalizeAccountId(query))
    .first();
  if (!target) return errorResponse("No account found.", 404);

  let removed = 0;
  if (body.all === true) {
    const before = await env.DB.prepare("SELECT COUNT(*) AS c FROM app_sessions WHERE user_id = ?").bind(target.id).first();
    await deleteAllAppSessions(env, target.id);
    removed = Number(before.c);
  } else {
    removed = (await deleteAppSessionById(env, target.id, String(body.deviceId))) ? 1 : 0;
    if (!removed) return errorResponse("No such device.", 404);
  }

  await logAuthEvent(env, "admin_app_devices_revoked", { ip, email: actor, targetEmail: target.email, all: body.all === true, count: removed });
  return jsonResponse({ removed });
}
