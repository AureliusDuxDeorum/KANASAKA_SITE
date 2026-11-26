// A local relay for developing the KS_C1 desktop and phone apps: the real relay Worker (room.js and the AccountRelay Durable Object)
// running in the Workers runtime through Miniflare, with the app-session check replaced by "the bearer token IS the session id".
// Never deploy or expose this: it has no authentication.
//   node scripts/relay/dev.mjs [port]            (default 8787)  ->  ws://127.0.0.1:<port>/
// Point a development build of KS_C1 at it; every device must use a different bearer token (that is what tells devices apart here).
// All devices share one account ("user:dev"). Needs the runtime `npx wrangler` installs (miniflare, workerd, esbuild).
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8787);
const wrapper = `
export { AccountRelay } from ${JSON.stringify(path.join(here, "index.js"))};
export default {
  async fetch(request, env) {
    const stub = env.REL.get(env.REL.idFromName("user:dev"));
    const url = new URL(request.url);
    if (url.pathname === "/revoke") return stub.fetch(new Request("https://relay/revoke", { method: "POST", body: await request.text() }));
    const session = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1];
    if (!session) return new Response("Not signed in.", { status: 401 });
    return stub.fetch(new Request("https://relay/connect", { headers: { Upgrade: request.headers.get("Upgrade") || "", "X-Relay-Session": session } }));
  },
};`;
const out = await build({ stdin: { contents: wrapper, resolveDir: here, loader: "js" }, bundle: true, format: "esm", write: false, logLevel: "warning" });
const mf = new Miniflare({ modules: true, script: out.outputFiles[0].text, durableObjects: { REL: "AccountRelay" }, compatibilityDate: "2024-11-12", host: "127.0.0.1", port });
const url = (await mf.ready).toString().replace("http", "ws");
console.log(`relay ready at ${url}  (POST ${url.replace("ws", "http")}revoke {"sessions":[...]|"all"} drops devices)`);
process.on("SIGINT", async () => { await mf.dispose(); process.exit(0); });
