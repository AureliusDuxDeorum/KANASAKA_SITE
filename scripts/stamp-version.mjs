// Writes assets/site-meta.json: the build version and revision the footer HUD
// shows. Cloudflare's build command is empty, so run this before each deploy
// and commit the result (`npm run stamp`). If a build command is ever added,
// pages-build.mjs runs it too (CF_PAGES_COMMIT_SHA then supplies the revision).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();

const version =
  "v" + String(now.getUTCFullYear()).slice(2) + "." + pad(now.getUTCMonth() + 1) + "." + pad(now.getUTCDate());
const built = pad(now.getUTCHours()) + ":" + pad(now.getUTCMinutes()) + "Z";

let rev = "";
try {
  rev = (process.env.CF_PAGES_COMMIT_SHA || execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()).slice(0, 7);
} catch {
  // no git available: leave the revision out rather than guess
}

const meta = { version, built, rev };
writeFileSync(new URL("../assets/site-meta.json", import.meta.url), JSON.stringify(meta, null, 2) + "\n");
console.log("Stamped " + JSON.stringify(meta));
