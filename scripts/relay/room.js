// The relay's logic for one account: who is connected, who may talk to whom, and what is forwarded. No Cloudflare APIs in here,
// so it is tested with plain objects (tests/relay-room.test.mjs); index.js wraps it in a Durable Object.
//
// The relay carries ciphertext it cannot read. A device's frames are binary: 16 bytes naming the target, then the rest, which the
// relay never looks into. On the way out the target id is replaced by the sender's, so the receiver knows who sent it.
//
// Wire contract (the same one the KS_C1 desktop speaks; see docs/REMOTE_RELAY.md):
//   device -> relay  text   {"hello":{"role":"desktop"|"phone","deviceId":<32 hex>,"name":<=60 chars>,"public":<base64 of 32 bytes>}}
//   relay -> device  text   {"peers":[{id,name,public,role}, ...]}        the other connected devices, in answer to a hello
//   relay -> others  text   {"peer-joined":{id,name,public,role}}  /  {"peer-left":"<id>"}
//   device <-> device  binary  <16-byte target id><anything>
//
// Close codes: 4400 bad hello, 4401 signed out, 4403 device id taken, 4409 replaced by a newer connection of the same device,
// 4429 too many devices or too much traffic, 4413 message too big, 4000 connection too old (sign in again).

export const MAX_DEVICES = 10;
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 4096;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 600;
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const ID_RE = /^[0-9a-f]{32}$/;
const PUBLIC_RE = /^[A-Za-z0-9+/]{43}=$/;
const ROLES = new Set(["desktop", "phone"]);

const hexOf = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const bytesOf = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));

function parseHello(text) {
  let v;
  try {
    v = JSON.parse(text);
  } catch (_) {
    return null;
  }
  const h = v && typeof v === "object" ? v.hello : null;
  if (!h || typeof h !== "object") return null;
  if (!ROLES.has(h.role) || typeof h.deviceId !== "string" || !ID_RE.test(h.deviceId)) return null;
  if (typeof h.name !== "string" || h.name.length < 1 || h.name.length > 60) return null;
  if (typeof h.public !== "string" || !PUBLIC_RE.test(h.public)) return null;
  return { id: h.deviceId, name: h.name, public: h.public, role: h.role };
}

export class RelayRoom {
  constructor({ now = Date.now, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
    this.now = now;
    this.maxAgeMs = maxAgeMs;
    this.conns = new Map();
    this.devices = new Map();
    this.next = 1;
  }

  /** A new socket for an authenticated session. `conn` needs send(data) and close(code, reason). */
  attach(conn, { sessionId }) {
    const cid = this.next++;
    this.conns.set(cid, { conn, sessionId, at: this.now(), entry: null, windowStart: this.now(), count: 0, replaced: false });
    return cid;
  }

  onText(cid, text) {
    const c = this.conns.get(cid);
    if (!c || this.limited(c)) return;
    if (c.entry) return;
    if (String(text).length > MAX_TEXT_BYTES) return c.conn.close(4400, "bad hello");
    const entry = parseHello(text);
    if (!entry) return c.conn.close(4400, "bad hello");

    // One session is one device, and a device id belongs to the session that first used it.
    for (const other of this.conns.values()) {
      if (other !== c && other.sessionId === c.sessionId && other.entry && other.entry.id !== entry.id) return c.conn.close(4403, "device id taken");
    }
    const ownerCid = this.devices.get(entry.id);
    const owner = ownerCid === undefined ? null : this.conns.get(ownerCid);
    if (owner && owner.sessionId !== c.sessionId) return c.conn.close(4403, "device id taken");
    if (!owner && this.devices.size >= MAX_DEVICES) return c.conn.close(4429, "too many devices");
    if (owner) {
      owner.replaced = true;
      owner.conn.close(4409, "replaced");
    }

    c.entry = entry;
    this.devices.set(entry.id, cid);
    const peers = [...this.devices.entries()].filter(([id]) => id !== entry.id).map(([, other]) => this.conns.get(other).entry);
    c.conn.send(JSON.stringify({ peers }));
    this.broadcast({ "peer-joined": entry }, cid);
  }

  onBinary(cid, bytes) {
    const c = this.conns.get(cid);
    if (!c || this.limited(c) || !c.entry) return;
    if (bytes.byteLength > MAX_MESSAGE_BYTES) return c.conn.close(4413, "message too big");
    if (bytes.byteLength < 17) return;
    const targetCid = this.devices.get(hexOf(bytes.subarray(0, 16)));
    const target = targetCid === undefined || targetCid === cid ? null : this.conns.get(targetCid);
    if (!target) return;
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    out.set(bytesOf(c.entry.id), 0);
    target.conn.send(out);
  }

  onClose(cid) {
    const c = this.conns.get(cid);
    if (!c) return;
    this.conns.delete(cid);
    if (c.entry && !c.replaced && this.devices.get(c.entry.id) === cid) {
      this.devices.delete(c.entry.id);
      this.broadcast({ "peer-left": c.entry.id }, cid);
    }
  }

  /** Close the connections of these sessions (or every one), because they were signed out. */
  revoke(sessionIds) {
    for (const c of this.conns.values()) {
      if (sessionIds === "all" || sessionIds.includes(c.sessionId)) c.conn.close(4401, "signed out");
    }
  }

  /** Close connections that have lived too long, so a session that expired or was revoked cannot stay connected for ever. */
  sweep() {
    for (const c of this.conns.values()) {
      if (this.now() - c.at >= this.maxAgeMs) c.conn.close(4000, "sign in again");
    }
  }

  size() {
    return this.conns.size;
  }

  limited(c) {
    const t = this.now();
    if (t - c.windowStart >= RATE_WINDOW_MS) {
      c.windowStart = t;
      c.count = 0;
    }
    if (++c.count > RATE_LIMIT) {
      c.conn.close(4429, "too much traffic");
      return true;
    }
    return false;
  }

  broadcast(message, exceptCid) {
    const text = JSON.stringify(message);
    for (const cid of this.devices.values()) {
      if (cid !== exceptCid) this.conns.get(cid)?.conn.send(text);
    }
  }
}
