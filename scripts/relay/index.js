// The remote relay Worker: one Durable Object per account (AccountRelay) that wraps RelayRoom (room.js).
//
// It has NO public route. workers_dev is off and the default handler answers 404; the only way to reach an AccountRelay is the
// REMOTE_RELAY binding that the Pages project holds, and the only code that uses it is functions/api/app/remote.js, which
// authenticates the app session first. Deploy notes: docs/REMOTE_RELAY.md.
import { RelayRoom } from "./room.js";

const SWEEP_EVERY_MS = 60 * 60 * 1000;

function safe(fn) {
  try {
    fn();
  } catch (_) {
    // The socket already closed.
  }
}

export class AccountRelay {
  constructor(state) {
    this.state = state;
    this.room = new RelayRoom();
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/revoke" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return new Response("Bad request", { status: 400 });
      }
      const sessions = body && body.sessions;
      if (sessions !== "all" && !(Array.isArray(sessions) && sessions.every((s) => typeof s === "string"))) {
        return new Response("Bad request", { status: 400 });
      }
      this.room.revoke(sessions);
      return new Response(null, { status: 204 });
    }

    if (pathname === "/connect" && request.headers.get("Upgrade") === "websocket") {
      const sessionId = request.headers.get("X-Relay-Session");
      if (!sessionId) return new Response("Bad request", { status: 400 });

      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      const cid = this.room.attach(
        { send: (data) => safe(() => server.send(data)), close: (code, reason) => safe(() => server.close(code, reason)) },
        { sessionId },
      );
      server.addEventListener("message", (event) => {
        if (typeof event.data === "string") this.room.onText(cid, event.data);
        else this.room.onBinary(cid, new Uint8Array(event.data));
      });
      const gone = () => this.room.onClose(cid);
      server.addEventListener("close", gone);
      server.addEventListener("error", gone);
      await this.state.storage.setAlarm(Date.now() + SWEEP_EVERY_MS);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm() {
    this.room.sweep();
    if (this.room.size() > 0) await this.state.storage.setAlarm(Date.now() + SWEEP_EVERY_MS);
  }
}

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
