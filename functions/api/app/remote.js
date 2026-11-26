// GET /api/app/remote -- the remote-control relay, as a WebSocket. Bearer token in `Authorization` (an app session, like the rest of
// /api/app/). KS_C1 on a desktop and the KS_C1 phone app both connect here; the relay (a Durable Object per account, see
// scripts/relay/ and docs/REMOTE_RELAY.md) passes encrypted frames between the account's devices and cannot read them.
//
//   101  switching protocols (the socket)
//   401  not signed in
//   426  not a WebSocket upgrade
//   503  the relay is not deployed or bound yet (REMOTE_RELAY)
//
// This function is the only way in: the Durable Object has no public route, so who may connect is decided here, and only here.
import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { resolveAppSession } from "../../lib/app-sessions.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return errorResponse("Expected a WebSocket connection.", 426);
  }
  if (!env.REMOTE_RELAY) {
    return errorResponse("Remote is not available yet.", 503);
  }

  const { user, session } = await resolveAppSession(request, env);
  if (!user) {
    return jsonResponse({ error: "Not signed in." }, 401);
  }

  // One object per account. The session id is the only thing passed on, and it is set here, never taken from the client.
  const relay = env.REMOTE_RELAY.get(env.REMOTE_RELAY.idFromName("user:" + Math.trunc(Number(user.id))));
  return relay.fetch(new Request("https://relay/connect", { headers: { Upgrade: "websocket", "X-Relay-Session": session.id } }));
}
