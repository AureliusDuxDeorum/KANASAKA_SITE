// The account's signed-in app devices, for the account's own app session.
//   GET    /api/app/devices                 -> { devices: [{ id, client, label, createdAt, lastUsedAt, current }] }
//   DELETE /api/app/devices?id=<id>         sign out that device (it may be this one)
//   DELETE /api/app/devices?others=1        sign out every device except this one
import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { deleteAppSessionById, deleteOtherAppSessions, listAppSessions, resolveAppSession } from "../../lib/app-sessions.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return errorResponse("Authentication service is not configured.", 503);

  const { user, session } = await resolveAppSession(request, env);
  if (!user) return errorResponse("Not signed in.", 401);

  const devices = (await listAppSessions(env, user.id)).map((d) => ({ ...d, current: d.id === session.id }));
  return jsonResponse({ devices });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.DB) return errorResponse("Authentication service is not configured.", 503);

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user, session } = await resolveAppSession(request, env);
  if (!user) return errorResponse("Not signed in.", 401);

  const url = new URL(request.url);
  const ip = clientIp(request);

  if (url.searchParams.get("others") === "1") {
    const removed = await deleteOtherAppSessions(env, user.id, session.id);
    await logAuthEvent(env, "app_devices_signed_out", { ip, userId: user.id, count: removed });
    return jsonResponse({ removed });
  }

  const id = String(url.searchParams.get("id") || "");
  if (!id) return errorResponse("Say which device to sign out.");
  const removed = await deleteAppSessionById(env, user.id, id);
  if (!removed) return errorResponse("No such device.", 404);
  await logAuthEvent(env, "app_device_signed_out", { ip, userId: user.id, device: id });
  return jsonResponse({ removed: 1 });
}
