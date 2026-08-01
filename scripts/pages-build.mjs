import { execSync } from "node:child_process";

// Cloudflare Pages runs `npm run build` when package.json exists.
// Validate that Functions bundle (Argon2 WASM, auth routes) before deploy.
console.log("Validating Cloudflare Pages Functions bundle...");
execSync("npx wrangler pages functions build", { stdio: "inherit" });
console.log("Pages build OK.");
