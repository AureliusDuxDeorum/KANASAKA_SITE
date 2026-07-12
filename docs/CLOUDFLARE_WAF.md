# Cloudflare WAF rules for KANASAKA auth

Apply these in **Cloudflare Dashboard → Security → WAF → Custom rules** (or Rate limiting rules). WAF is the primary abuse control; application code focuses on cryptography, session integrity, and origin checks.

## Prerequisites

- Zone: `kanasaka.com`
- Pages project deployed with `/api/auth/*` Functions routes
- Run D1 migrations through `005_auth_hardening.sql`
- Set `SESSION_SECRET` (32+ random bytes) in Pages **Production secrets**

## Recommended custom rules

### 1. Block auth POST floods by IP

- **Expression:** `(http.request.uri.path starts with "/api/auth/") and (http.request.method eq "POST")`
- **Action:** Rate limit — 30 requests per 10 minutes per IP
- **Mitigation:** Block for 1 hour

### 2. Tighter limit on login

- **Expression:** `(http.request.uri.path eq "/api/auth/login") and (http.request.method eq "POST")`
- **Action:** Rate limit — 10 requests per 10 minutes per IP
- **Mitigation:** Managed challenge, then block

### 3. Tighter limit on password reset

- **Expression:** `(http.request.uri.path in {"/api/auth/forgot-password" "/api/auth/reset-password"}) and (http.request.method eq "POST")`
- **Action:** Rate limit — 8 requests per hour per IP

### 4. Tighter limit on registration

- **Expression:** `(http.request.uri.path eq "/api/auth/register") and (http.request.method eq "POST")`
- **Action:** Rate limit — 6 requests per hour per IP

### 5. Block non-browser origins on mutating auth routes

Skip if you rely on KS Unify desktop (no `Origin` header). Otherwise:

- **Expression:** `(http.request.uri.path starts with "/api/auth/") and (http.request.method in {"POST" "PATCH" "DELETE"}) and (http.request.headers["origin"][0] ne "https://kanasaka.com") and (http.request.headers["origin"][0] ne "")`
- **Action:** Block

### 6. Block known bad bots on auth paths

- **Expression:** `(http.request.uri.path starts with "/api/auth/") and cf.client.bot`
- **Action:** Managed challenge

## Managed rules (enable)

Under **Security → WAF → Managed rules**:

- Cloudflare OWASP Core Ruleset (Paranoia level 1 on auth paths if available)
- Cloudflare Bot Fight Mode or Super Bot Fight Mode (if on paid plan)

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
4. Verify KS Unify login after desktop rebuild (Rust cookie jar).

## Argon2 tuning (optional)

Pages **Variables** (non-secret):

| Variable | Default | Notes |
|----------|---------|-------|
| `ARGON2_MEMORY_KIB` | `8192` | 8 MiB; increase on Workers Paid if login is slow |
| `ARGON2_ITERATIONS` | `2` | OWASP often uses 2–3 |
| `ARGON2_PARALLELISM` | `1` | Keep at 1 on Workers |
| `SESSION_ROTATE_HOURS` | `24` | Session ID rotation interval |

If login returns 500 / CPU exceeded, lower `ARGON2_MEMORY_KIB` to `4096` or upgrade Workers plan.
