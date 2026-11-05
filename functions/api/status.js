// GET /api/status -- public, unauthenticated, read-only.
//
// Feeds /support/system-status/. It reports only whether each part of the
// service answers right now: booleans and a timestamp. No counts, no versions,
// no error text, nothing about configuration. There is no history behind it
// (nothing is stored), so the page says plainly that there is no uptime record.

const CHECK_TIMEOUT_MS = 3000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
  ]);
}

async function probe(fn) {
  try {
    await withTimeout(Promise.resolve().then(fn));
    return true;
  } catch (_) {
    return false;
  }
}

export async function buildStatus(env) {
  const [database, downloads] = await Promise.all([
    env.DB ? probe(() => env.DB.prepare("SELECT 1 AS ok").first()) : Promise.resolve(false),
    // head() of a key that does not exist resolves to null: it proves the bucket answers
    env.INSTALLERS ? probe(() => env.INSTALLERS.head("status-probe")) : Promise.resolve(false),
  ]);

  const components = [
    { id: "site", label: "Website", ok: true },
    { id: "api", label: "Sign-in and account API", ok: true },
    { id: "database", label: "Account database", ok: database },
    { id: "downloads", label: "Installer downloads", ok: downloads },
  ];

  return {
    status: components.every((c) => c.ok) ? "operational" : "degraded",
    checkedAt: new Date().toISOString(),
    components,
  };
}

export async function onRequestGet(context) {
  const body = await buildStatus(context.env || {});
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
    },
  });
}
