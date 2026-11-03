# KANASAKA security overview

Last reviewed: 2026-11-03 (v1.3.0). Reporting: see `/.well-known/security.txt`.

## Controls in place

- **Sessions** -- `__Host-` cookie, HttpOnly, Secure, SameSite=Strict; only HMAC hashes stored; rotated every 24 h; every session revoked on login, password change and 2FA disable.
- **Passwords** -- Argon2id (19 MiB / 3 passes), 15+ characters, blocklist; unknown-email logins pay for a dummy hash so timing does not reveal accounts.
- **CSRF** -- `functions/api/_middleware.js` rejects any non-GET `/api/*` request from another origin (Stripe webhook exempt, it is signature-authenticated); every route also checks itself.
- **CSP** -- `script-src 'self'`, `style-src 'self'` (no inline anything), `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`, no third-party hosts. `tests/static-policy.test.mjs` fails if a page or script would need an inline exception.
- **Rate limits (in code)** -- login per account and per IP; registration per IP; reset/verification/terms mails per address and per IP; 2FA codes per account; wrong one-time codes per account (5 / 5 min, then the challenge and codes are destroyed); admin actions per actor.
- **Admin** -- admin tools need an admin role *and* 2FA, step-up password for role changes, lockout after 3 wrong confirmations, audit log, constant-time comparison for the bearer secret.
- **Errors** -- `publicError()` keeps database/provider details out of responses.
- **Data retention** -- `auth_events` (IPs, emails) is purged after 90 days.

## Fixed in 1.3.0

| Severity | Finding | Fix |
|---|---|---|
| High | Expiry checks compared ISO timestamps (`...T...Z`) with `datetime('now')` (`... ...`) as strings, so anything that expired earlier *today* (UTC) stayed valid until midnight: 5-minute login codes and challenges, 15-minute reset/verify codes, sessions on their last day | `datetime(expires_at) > datetime('now')` everywhere; regression tests |
| High | 2FA login code (6 digits) could be guessed without limit | 5 wrong codes per account per window destroys the challenge and codes; 429 |
| High | Mail/SMS endpoints (reset, resend, terms, 2FA) had no throttle: mail cannon + provider quota | per-address and per-IP limits via `allowSend`; identical answers when throttled |
| High | `/admin/cancel-role-change/` page used an inline script that the CSP blocks, so the emailed "this wasn't me" link never completed | script moved to `assets/js/cancel-role-change.js` |
| Medium | Login throttled per email only (credential stuffing unseen) | per-IP failure limit |
| Medium | Unknown-email login returned instantly (account enumeration by timing) | dummy Argon2 verification |
| Medium | API responses had no security headers; CSRF check was opt-in per route | `_middleware.js` |
| Medium | Raw `err.message` returned to clients | `publicError()` |
| Medium | CSP allowed inline styles and any https image | removed; `img-src 'self' data: blob:`; added `object-src`, `font-src`, `manifest-src`, `upgrade-insecure-requests` |
| Low | Admin bearer compare was `===` | `timingSafeEqualString` |
| Low | Time-locked role changes applied only after UTC midnight (same ISO/`datetime` issue) | fixed with the above |
| Low | No security.txt / robots.txt; empty `Unify_Setup.exe` tracked | added / removed |

## Developer panel

Account > Developer (admin + 2FA):

- **System Status** -- configuration present/missing (never values), database + schema + required tables, 24 h activity, build info, and a list of things that can only be checked outside the app.
- **Self-Test Suite** -- non-destructive live checks (hashing, Argon2, cookie flags, same-origin rules, error sanitising, Stripe signature handling, DB round trip, throttle counters, and the headers/CSRF/admin gate of this very deployment).

Locally: `npm test`.

## Manual checklist (cannot be verified from the app)

- [ ] Cloudflare WAF rate limits from `docs/CLOUDFLARE_WAF.md` (the last audit could not read the ruleset)
- [ ] `SESSION_SECRET`, `ADMIN_SECRET`, `STRIPE_*`, `RESEND_API_KEY` set in Pages production secrets (System Status shows which are missing)
- [ ] 2FA on the Cloudflare, GitHub, Stripe and Resend accounts
- [ ] DNSSEC + CAA records; HSTS preload submission
- [ ] Decide whether to make a missing `SESSION_SECRET` a hard failure (currently reported as FAIL, token hashing falls back to unkeyed SHA-256)
