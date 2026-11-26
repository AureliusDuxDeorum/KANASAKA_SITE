import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_DEVICES, MAX_MESSAGE_BYTES, RelayRoom } from "../scripts/relay/room.js";

const hex = (c) => c.repeat(32);
const pub = (n) => Buffer.alloc(32, n).toString("base64");
const idBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

class Conn {
  constructor() {
    this.sent = [];
    this.closed = null;
  }
  send(data) {
    this.sent.push(data);
  }
  close(code, reason) {
    this.closed = { code, reason };
  }
  texts() {
    return this.sent.filter((s) => typeof s === "string").map((s) => JSON.parse(s));
  }
  frames() {
    return this.sent.filter((s) => typeof s !== "string");
  }
}

const hello = (role, id, name = "Device", n = 1) => JSON.stringify({ hello: { role, deviceId: id, name, public: pub(n) } });

function join(room, session, role, id, name, n) {
  const conn = new Conn();
  const cid = room.attach(conn, { sessionId: session });
  room.onText(cid, hello(role, id, name, n));
  return { conn, cid };
}

test("a hello is answered with the other devices, and they are told about the newcomer", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  assert.deepEqual(desk.conn.texts(), [{ peers: [] }]);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  assert.deepEqual(phone.conn.texts()[0], { peers: [{ id: hex("d"), name: "Desk", public: pub(1), role: "desktop" }] });
  assert.deepEqual(desk.conn.texts()[1], { "peer-joined": { id: hex("a"), name: "Pixel", public: pub(2), role: "phone" } });
});

test("a bad hello closes the connection", () => {
  for (const bad of [
    { role: "root", deviceId: hex("a"), name: "x", public: pub(1) },
    { role: "phone", deviceId: "short", name: "x", public: pub(1) },
    { role: "phone", deviceId: hex("a"), name: "x".repeat(61), public: pub(1) },
    { role: "phone", deviceId: hex("a"), name: "x", public: Buffer.alloc(31).toString("base64") },
    { role: "phone", deviceId: hex("a"), name: "x", public: "not base64!" },
    { role: "phone", deviceId: hex("a"), name: 5, public: pub(1) },
  ]) {
    const room = new RelayRoom();
    const conn = new Conn();
    const cid = room.attach(conn, { sessionId: "s1" });
    room.onText(cid, JSON.stringify({ hello: bad }));
    assert.equal(conn.closed?.code, 4400, JSON.stringify(bad));
  }
  const room = new RelayRoom();
  const conn = new Conn();
  const cid = room.attach(conn, { sessionId: "s1" });
  room.onText(cid, "not json");
  assert.equal(conn.closed?.code, 4400);
});

test("a data frame is forwarded to its target with the sender's id in front", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  const frame = new Uint8Array([...idBytes(hex("d")), 2, 9, 9, 9, 9]);
  room.onBinary(phone.cid, frame);
  const got = desk.conn.frames();
  assert.equal(got.length, 1);
  assert.deepEqual([...got[0]], [...idBytes(hex("a")), 2, 9, 9, 9, 9]);
});

test("frames to nobody, before a hello, or too short are dropped", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  room.onBinary(phone.cid, new Uint8Array([...idBytes(hex("e")), 2, 1, 1]));
  room.onBinary(phone.cid, new Uint8Array(10));
  const lurker = new Conn();
  const lid = room.attach(lurker, { sessionId: "s3" });
  room.onBinary(lid, new Uint8Array([...idBytes(hex("d")), 2, 1, 1]));
  assert.equal(desk.conn.frames().length, 0);
  assert.equal(lurker.closed, null);
});

test("a frame over the size cap closes the sender", () => {
  const room = new RelayRoom();
  join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  room.onBinary(phone.cid, new Uint8Array(MAX_MESSAGE_BYTES + 1));
  assert.equal(phone.conn.closed?.code, 4413);
});

test("a device id cannot be claimed by another session", () => {
  const room = new RelayRoom();
  join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const thief = join(room, "s2", "desktop", hex("d"), "Fake", 9);
  assert.equal(thief.conn.closed?.code, 4403);
});

test("the same session reconnecting replaces its old connection without announcing a leave", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  const again = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  assert.equal(phone.conn.closed?.code, 4409);
  room.onClose(phone.cid);
  assert.equal(desk.conn.texts().filter((t) => t["peer-left"]).length, 0);
  assert.equal(desk.conn.texts().filter((t) => t["peer-joined"]).length, 2, "the rejoin is announced so both sides start a fresh session");
  assert.equal(again.conn.closed, null);
});

test("a leave is announced", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  room.onClose(phone.cid);
  assert.deepEqual(desk.conn.texts().at(-1), { "peer-left": hex("a") });
});

test("revoking a session closes only its connections, and 'all' closes every one", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  room.revoke(["s2"]);
  assert.equal(phone.conn.closed?.code, 4401);
  assert.equal(desk.conn.closed, null);
  room.revoke("all");
  assert.equal(desk.conn.closed?.code, 4401);
});

test("a device over the cap is refused", () => {
  const room = new RelayRoom();
  for (let i = 0; i < MAX_DEVICES; i++) join(room, "s" + i, "phone", String(i).padStart(2, "0").repeat(16), "P" + i, i);
  const extra = join(room, "sx", "phone", hex("f"), "Extra", 99);
  assert.equal(extra.conn.closed?.code, 4429);
});

test("a flood of messages closes the sender", () => {
  let t = 0;
  const room = new RelayRoom({ now: () => t });
  join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  const frame = new Uint8Array([...idBytes(hex("d")), 2, 1]);
  for (let i = 0; i < 2000 && !phone.conn.closed; i++) room.onBinary(phone.cid, frame);
  assert.equal(phone.conn.closed?.code, 4429);
  const calm = join(room, "s3", "phone", hex("b"), "Calm", 3);
  for (let i = 0; i < 100; i++) {
    t += 1000;
    room.onBinary(calm.cid, frame);
  }
  assert.equal(calm.conn.closed, null);
});

test("a long-lived connection is closed so it must sign in again", () => {
  let t = 0;
  const room = new RelayRoom({ now: () => t, maxAgeMs: 1000 });
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  t = 500;
  room.sweep();
  assert.equal(desk.conn.closed, null);
  t = 1500;
  room.sweep();
  assert.equal(desk.conn.closed?.code, 4000);
});

test("text after the hello is ignored, and a second hello cannot change the device", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  const before = desk.conn.sent.length;
  room.onText(phone.cid, hello("phone", hex("b"), "Other", 3));
  room.onText(phone.cid, JSON.stringify({ anything: 1 }));
  assert.equal(desk.conn.sent.length, before);
  assert.equal(phone.conn.closed, null);
});

test("a closed device is dropped at once, even if its socket never acknowledges the close", () => {
  const room = new RelayRoom();
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  room.revoke(["s2"]); // no onClose call: a client that ignores the close handshake
  assert.equal(phone.conn.closed?.code, 4401);
  assert.deepEqual(desk.conn.texts().at(-1), { "peer-left": hex("a") });
  desk.conn.sent.length = 0;
  room.onBinary(desk.cid, new Uint8Array([...idBytes(hex("a")), 2, 1, 1]));
  assert.equal(phone.conn.frames().length, 0, "a revoked device must not receive anything more");
  assert.equal(room.size(), 1);
});

test("the same holds for a device closed by the sweep, the rate limit, or an oversize frame", () => {
  let t = 0;
  const room = new RelayRoom({ now: () => t, maxAgeMs: 1000 });
  const desk = join(room, "s1", "desktop", hex("d"), "Desk", 1);
  const phone = join(room, "s2", "phone", hex("a"), "Pixel", 2);
  t = 2000;
  room.sweep();
  assert.equal(room.size(), 0);
  assert.ok(desk.conn.closed && phone.conn.closed);

  const room2 = new RelayRoom();
  join(room2, "s1", "desktop", hex("d"), "Desk", 1);
  const big = join(room2, "s2", "phone", hex("a"), "Pixel", 2);
  room2.onBinary(big.cid, new Uint8Array(MAX_MESSAGE_BYTES + 1));
  assert.equal(room2.size(), 1);
});
