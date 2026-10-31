// Cloudflare Pages runs `npm run build` when a build command is configured.
// Auth WASM is vendored under functions/vendor/, so deploy works without npm install.
try {
  await import("./stamp-version.mjs");
} catch (err) {
  console.warn("Version stamp skipped:", err && err.message);
}
console.log("Pages build OK.");
