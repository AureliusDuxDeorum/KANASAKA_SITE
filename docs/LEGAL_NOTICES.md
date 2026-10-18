# Legal/policy-update notices

Reusable system for telling existing account holders about a material
change to a legal document (cookie policy, ToS, privacy policy, refund
policy, ...). Publish once, two things happen automatically:

1. Every verified user gets an email right away.
2. Any signed-in user who hasn't acknowledged that notice yet sees a
   dismissible banner at the top of the site until they click "Got it" --
   this persists server-side, so it follows them across devices/sessions
   and reappears if a newer version is published later.

## One-time setup

```bash
npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/017_legal_notices.sql
```

## Publishing a notice

```bash
curl -X POST https://kanasaka.com/api/admin/legal-notices \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "noticeType": "cookies",
    "version": "2026-10-15",
    "title": "Cookie Policy",
    "summary": "We added a cookie consent banner and clarified what our session cookie does.",
    "url": "https://kanasaka.com/legal/cookies/"
  }'
```

Or from an authenticated admin session (dev_ks / role=admin, 2FA required)
instead of the bearer secret -- same endpoint, just send the session cookie
instead of the `Authorization` header.

- `noticeType` -- any short slug (`cookies`, `tos`, `privacy`, `refund`, ...).
  Each type tracks its own "latest version" independently.
- `version` -- any string that changes when the document changes (a date
  works well: `2026-10-15`). Publishing the same `noticeType` + `version`
  twice is rejected (already published).
- Publishing a **new** version of a `noticeType` a user already
  acknowledged makes the banner reappear for them -- that's what makes this
  reusable without touching code for the next policy update.

The response reports how many verified users exist and how many emails
actually sent vs. failed (`{sent, failed}`) -- a failed send doesn't block
the notice from being published or shown in-app; check `RESEND_API_KEY` if
`failed` is nonzero.

## How it works

| Piece | What it does |
|-------|--------------|
| `migrations/017_legal_notices.sql` | `legal_notices` (one row per published version) + `legal_notice_acks` (one row per user per notice_type, holding the version they last acknowledged) |
| `functions/lib/legal-notices.js` | `publishLegalNotice`, `getPendingLegalNotices`, `acknowledgeLegalNotice` |
| `functions/api/admin/legal-notices.js` | Admin-gated POST that publishes + emails everyone (reuses `requireAdminAccess`, rate-limited via `throttleAdminAction`) |
| `functions/api/legal-notices/pending.js` | Session-gated GET -- notices the current user hasn't acknowledged yet |
| `functions/api/legal-notices/acknowledge.js` | Session-gated POST -- records that they've seen a given `noticeType`/`version` |
| `assets/js/auth.js` → `initLegalNotices()` | Fetches pending notices after session resolves, renders one banner at a time, posts the acknowledgement on "Got it" |

Anonymous visitors never see this banner (there's no account to track an
acknowledgement against) -- they only get the plain, client-side-only
cookie-consent banner in `main.js`.
