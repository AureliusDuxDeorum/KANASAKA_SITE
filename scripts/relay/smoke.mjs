// Manual check of the relay Worker in the real Workers runtime (workerd), through Miniflare. Not part of `npm test`: it needs the
// runtime that `npx wrangler` installs (miniflare, workerd, esbuild, ws in node_modules). Run from the repo root:
//   node scripts/relay/smoke.mjs
// It connects a desktop and a phone to one AccountRelay, forwards a frame, refuses a stolen device id, revokes a session, and
// expects the right close codes and announcements.
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import WebSocket from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = `
export { AccountRelay } from ${JSON.stringify(path.join(here, "index.js"))};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const stub = env.REL.get(env.REL.idFromName("user:1"));
    if (url.pathname === "/revoke") return stub.fetch(new Request("https://relay/revoke", { method: "POST", body: await request.text() }));
    return stub.fetch(new Request("https://relay/connect", { headers: { Upgrade: "websocket", "X-Relay-Session": url.searchParams.get("s") } }));
  },
};`;
const out = await build({ stdin: { contents: wrapper, resolveDir: here, loader: "js" }, bundle: true, format: "esm", write: false, logLevel: "warning" });
const mf = new Miniflare({ modules: true, script: out.outputFiles[0].text, durableObjects: { REL: "AccountRelay" }, compatibilityDate: "2024-11-12" });
const url = (await mf.ready).toString().replace("http", "ws");

const hex = (c) => c.repeat(32);
const pub = Buffer.alloc(32, 7).toString("base64");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hello = (role, id, name) => JSON.stringify({ hello: { role, deviceId: id, name, public: pub } });
const idBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const open = (s) =>
  new Promise((res, rej) => {
    const w = new WebSocket(url + "?s=" + s);
    w.msgs = [];
    w.on("message", (d, bin) => w.msgs.push(bin ? new Uint8Array(d) : JSON.parse(d.toString())));
    w.on("open", () => res(w));
    w.on("error", rej);
  });
let ok = true;
const check = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) ok = false;
};

const desk = await open("s1");
desk.send(hello("desktop", hex("d"), "Desk"));
await wait(200);
const phone = await open("s2");
phone.send(hello("phone", hex("a"), "Pixel"));
await wait(300);
check(JSON.stringify(desk.msgs[0]) === '{"peers":[]}', "desktop gets an empty peer list");
check(phone.msgs[0].peers?.[0]?.id === hex("d"), "phone is told about the desktop");
check(desk.msgs.some((m) => m["peer-joined"]?.id === hex("a")), "desktop is told the phone joined");
phone.send(new Uint8Array([...idBytes(hex("d")), 2, 5, 5, 5, 5]));
await wait(200);
const got = desk.msgs.find((m) => m instanceof Uint8Array);
check(got && Buffer.from(got.slice(0, 16)).toString("hex") === hex("a") && got[16] === 2 && got.length === 21, "a binary frame is forwarded with the sender's id");
const thief = await open("s3");
const stolen = new Promise((r) => thief.on("close", (c) => r(c)));
thief.send(hello("phone", hex("a"), "Fake"));
check((await stolen) === 4403, "another session cannot take a device id (close 4403)");
const revoked = new Promise((r) => phone.on("close", (c) => r(c)));
const res = await mf.dispatchFetch("http://x/revoke", { method: "POST", body: JSON.stringify({ sessions: ["s2"] }) });
check(res.status === 204 && (await revoked) === 4401, "revoking a session closes its socket (4401)");
await wait(200);
check(desk.msgs.some((m) => m["peer-left"] === hex("a")), "desktop is told the phone left");
desk.close();
await mf.dispose();
process.exit(ok ? 0 : 1);
