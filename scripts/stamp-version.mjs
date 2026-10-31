// Writes assets/site-meta.json for the footer HUD: the site version (from
// package.json, the single source of truth), the build date and the git
// revision. Cloudflare's build command is empty, so run this before each deploy
// and commit the result (`npm run stamp`). If a build command is ever added,
// pages-build.mjs runs it too (CF_PAGES_COMMIT_SHA then supplies the revision).
//
// Bump the version with:  npm version <patch|minor|major> --no-git-tag-version
// then stamp, commit, deploy, and tag the deployed commit:  git tag -a vX.Y.Z
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = String(pkg.version || "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('package.json "version" must look like 1.2.3, got "' + version + '"');
}

const built = new Date().toISOString().slice(0, 10);

let rev = "";
try {
  rev = (process.env.CF_PAGES_COMMIT_SHA || execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()).slice(0, 7);
} catch {
  // no git available: leave the revision out rather than guess
}

const meta = { version, built, rev };
writeFileSync(new URL("../assets/site-meta.json", import.meta.url), JSON.stringify(meta, null, 2) + "\n");
console.log("Stamped " + JSON.stringify(meta));
