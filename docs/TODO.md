# KANASAKA — Deferred work

Items to pick up when ready. Security backend code for 2FA remains in the repo but is hidden from the UI until Twilio is configured.

## Soon (security)

- [ ] **SMS 2FA via Twilio** — see `docs/TWILIO_2FA.md`
  - Create Twilio account + SMS number (~trial free, paid when live)
  - Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to Cloudflare Pages secrets
  - Re-enable 2FA UI in settings + login (currently removed)
  - Test with `node scripts/test-twilio-sms.mjs +49...`

- [ ] **WAF rate limits** — apply rules from `docs/CLOUDFLARE_WAF.md` on kanasaka.com

- [ ] **R2 installer downloads** — enable R2 bucket, upload installers, confirm `INSTALLERS` binding (see `docs/R2_INSTALLERS.md`)

## Already in place (no action needed for basic security)

- Argon2id password hashing (19 MiB / 3 iterations)
- 12+ char password policy with blocklist
- HttpOnly session cookies + HMAC token storage
- Email verification required before login
- Same-origin checks on mutating routes
- Signed download tokens (once R2 is wired)
