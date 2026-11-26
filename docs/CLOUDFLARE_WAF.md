# Cloudflare WAF rules for KANASAKA auth

Apply these in **Cloudflare Dashboard → Security → WAF → Rate limiting rules**. The WAF is a flood damper in front of the Functions; precise abuse control (per-account limits, lockouts) lives in the app, see `docs/SECURITY.md`.

## Prerequisites

- Zone: `kanasaka.com`
- Pages project deployed with `/api/auth/*` Functions routes
- Run D1 migrations through `005_auth_hardening.sql`
- Set `SESSION_SECRET` (32+ random bytes) in Pages **Production secrets**

## What is actually deployed (2026-11-05)

Zone `kanasaka.com`, **Free plan** (one rate-limiting rule, counted per IP only, block duration 10 seconds -- the dashboard offered nothing longer).

| Setting | Value |
|---|---|
| Rule name | Auth POST flood limit |
| Expression | `(http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/auth/"))` |
| Characteristics | IP |
| Rate | 10 requests / 10 seconds (inferred from the test below; confirm in the dashboard) |
| Action / duration | Block / 10 seconds |
| Status | Active |

Verified with 30 rapid `POST /api/auth/logout` calls (harmless without a session): 10 x 200, then 429.

```
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " -X POST https://kanasaka.com/api/auth/logout -H "Origin: https://kanasaka.com" -H "Content-Type: application/json" -d '{}'; done
```

This is a **speed limit, not a ban**: after 10 seconds the IP is allowed again. It protects Functions/D1 from floods; slower guessing is stopped by the app-level limits in `docs/SECURITY.md` (per-account and per-IP login limits, one-time-code cap, mail throttles).

## Not deployed, on purpose

- **Origin-header block on auth routes** -- `functions/api/_middleware.js` already rejects cross-origin non-GET requests for all of `/api/*`, and desktop clients send different or no Origin headers.
- **"Known bad bots" rule on `cf.client.bot`** -- that field matches *verified* bots (e.g. search engines), not bad ones, so it does not do what it sounds like. Real bad-bot scoring needs a plan with Bot Management.
- **Bot Fight Mode** -- left off for now: KS_Link's updater and download endpoints are called by desktop apps, not browsers, and could be challenged. If enabled later, test an update check and a download immediately.

## If the plan is upgraded (paid plans allow more rules and longer periods)

Add these rate-limiting rules (all per IP, on `POST`):

1. `starts_with(http.request.uri.path, "/api/auth/")` -- 30 requests / 10 minutes, block 1 hour
2. `http.request.uri.path eq "/api/auth/login"` -- 10 / 10 minutes, managed challenge
3. `http.request.uri.path in {"/api/auth/forgot-password" "/api/auth/reset-password"}` -- 8 / hour
4. `http.request.uri.path eq "/api/auth/register"` -- 6 / hour

## Managed rules

Under **Security -> WAF -> Managed rules**, enable whatever the plan offers (the OWASP Core Ruleset is, as far as we know, paid-plan only). Check Security -> Events for false positives after enabling.

## Optional: cache bypass for auth

**Cache Rules:** bypass cache for `/api/*` (Pages Functions should already send `Cache-Control: no-store`).

## Secrets checklist

| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | HMAC for session and email token hashes (required) |
| `RESEND_API_KEY` | Transactional email |
| `ADMIN_SECRET` | Optional access to `/api/auth/email-status` |

## After deploy

1. Run migration 005 (invalidates all sessions and pending email links).
2. Users sign in again; passwords upgrade to Argon2id on next successful login.
3. Verify login, register, reset, and verify flows from the website.

## Argon2 tuning (optional)

Pages **Variables** (non-secret):

| Variable | Default | Notes |
|----------|---------|-------|
| `ARGON2_MEMORY_KIB` | `8192` | 8 MiB; increase on Workers Paid if login is slow |
| `ARGON2_ITERATIONS` | `2` | OWASP often uses 2–3 |
| `ARGON2_PARALLELISM` | `1` | Keep at 1 on Workers |
| `SESSION_ROTATE_HOURS` | `24` | Session ID rotation interval |

If login returns 500 / CPU exceeded, lower `ARGON2_MEMORY_KIB` to `4096` or upgrade Workers plan.


## KS_Link app sign-in endpoints (added 2026-11-13)

The KS_Link app signs in through `/api/ks-link/login` and `/api/ks-link/two-factor`, which do the same
password / second-factor checking as `/api/auth/login` but sit OUTSIDE the `/api/auth/` prefix, so the rules
above do not cover them. Without matching rules a credential-stuffing run can simply use the app path and skip
the speed limit and the managed challenge. Add, in the dashboard:

1. `starts_with(http.request.uri.path, "/api/ks-link/")` and method POST -- 30 requests / 10 minutes, block 1 hour
2. `http.request.uri.path in {"/api/ks-link/login" "/api/ks-link/two-factor"}` -- 10 / 10 minutes per IP

Do NOT add a managed challenge to these two paths: the native app cannot solve one and sign-in would fail.
The app-level limits (8 failures per email, 30 per address, 15 minutes; capped two-factor challenges and code
guesses) are what stop slow guessing there; the WAF speed limit stops floods.


## KS_C1 app sign-in endpoints (added 2026-11-19)

KS_C1 signs in through `/api/app/login` and `/api/app/two-factor`. Like the KS_Link paths above they sit OUTSIDE the `/api/auth/`
prefix, which is the point: `/api/auth/login` carries a managed challenge that a native app cannot solve, so the app must not use
it. And like them they need their own rules, or a credential-stuffing run could simply use the app path and skip the speed limit.
Add, in the dashboard:

1. `starts_with(http.request.uri.path, "/api/app/")` and method POST -- 30 requests / 10 minutes, block 1 hour
2. `http.request.uri.path in {"/api/app/login" "/api/app/two-factor"}` -- 10 / 10 minutes per IP

**On the Free plan (what is deployed)** there is only one rate-limiting rule, so the two above cannot both be added. Instead edit the
existing "Auth POST flood limit" rule so its expression also covers the app paths:

```
(http.request.method eq "POST" and (starts_with(http.request.uri.path, "/api/auth/") or starts_with(http.request.uri.path, "/api/app/")))
```

Keep Characteristics = IP and the same rate and 10-second block. Do not add `/api/ks-link/` to it: some of those calls come from KS_Link's
relay, not from people, and would all count against one shared limit. Verify with 30 rapid logouts (harmless, always answers 200):

```
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " -X POST https://kanasaka.com/api/app/logout; done
```

Expect about 10 x 200, then 429.

Do NOT add a managed challenge to anything under `/api/app/`: the native app cannot solve one and sign-in would fail. The app-level
limits in `functions/lib/login-flow.js` (8 failures per email, 30 per address, 15 minutes; capped second-step challenges and code
guesses) are shared with the website and are what stop slow guessing; the WAF speed limit stops floods.

`GET /api/app/session` is called by the app at start, every 15 minutes, and when its window regains focus: do not rate-limit it
tightly (a 100 requests / 10 minutes per IP ceiling is plenty and still covers a shared office address).


## Remote relay (added 2026-11-26)

`GET /api/app/remote` is the WebSocket the KS_C1 phone remote uses (docs/REMOTE_RELAY.md). It is a GET under `/api/app/`, so the POST
rules above do not touch it, and none is needed for it: each connection is one request, and traffic on an open socket is limited by
the relay itself (600 messages per 10 seconds per socket, 10 devices per account). Do NOT add a managed challenge to it: the apps
cannot solve one. If you want a speed limit on connection attempts, `http.request.uri.path eq "/api/app/remote"` at 60 requests per
10 minutes per IP is plenty (a device reconnects with a growing delay of at most 30 seconds).
