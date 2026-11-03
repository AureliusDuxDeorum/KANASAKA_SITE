// Node cannot `import x from "./file.wasm"` (Cloudflare's bundler can). This
// loader hook compiles .wasm imports into a WebAssembly.Module default export,
// which is exactly what functions/lib/argon2.js hands to the Argon2 library,
// so the tests run the real hashing code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".wasm")) {
    const bytes = readFileSync(fileURLToPath(url));
    return {
      format: "module",
      shortCircuit: true,
      source:
        "const bytes = Uint8Array.from(atob(" +
        JSON.stringify(bytes.toString("base64")) +
        "), (c) => c.charCodeAt(0));\nexport default new WebAssembly.Module(bytes);",
    };
  }
  return nextLoad(url, context);
}
