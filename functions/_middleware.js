// Repo-exposure guard.
//
// The site is deployed straight from the repository root
// (pages_build_output_dir = "."), so Cloudflare Pages *can* publish files that
// are source, not site: the schema, wrangler config, migrations, tests, docs,
// function source. `_routes.json` limits this middleware to exactly those
// paths (everything else is served as a plain static asset with no function
// invocation), and this answers them with a bare 404.
//
// `/api/*` is in `_routes.json` too, so the API middleware keeps working: for
// anything that is not a blocked path this just calls next().

const BLOCKED_PREFIXES = [
  "/functions/",
  "/migrations/",
  "/docs/",
  "/tests/",
  "/scripts/",
  "/.github/",
];

const BLOCKED_FILES = new Set([
  "/schema.sql",
  "/wrangler.toml",
  "/package.json",
  "/package-lock.json",
  "/ard.txt",
  "/.gitignore",
  "/.node-version",
  "/_routes.json",
]);

export function isBlockedPath(pathname) {
  let path = String(pathname || "/");
  try {
    path = decodeURIComponent(path);
  } catch (_) {
    return true;
  }
  path = path.toLowerCase().replace(/\/{2,}/g, "/");
  if (BLOCKED_FILES.has(path)) return true;
  return BLOCKED_PREFIXES.some(function (prefix) {
    return path.startsWith(prefix) || path === prefix.slice(0, -1);
  });
}

export function notFound() {
  return new Response("Not found\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  if (isBlockedPath(new URL(context.request.url).pathname)) return notFound();
  return context.next();
}
