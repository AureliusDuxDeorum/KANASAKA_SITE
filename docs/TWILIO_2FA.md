# SMS two-factor authentication (Twilio)

Production 2FA sends a 6-digit code by text message via Twilio. Email codes and authenticator-app (TOTP, RFC 6238) codes are separate methods that need no Twilio. An account can have both at once; at sign-in an account with both is asked for the app code and can tap "Email me a code instead" (`POST /api/auth/two-factor-send`). Settings → Two-Factor Authentication shows one card per method. Adding the authenticator first needs an emailed confirmation code (skipped when email codes are already on). Secrets are AES-GCM-encrypted with a key derived from `SESSION_SECRET`; a code is accepted once per 30-second step. Both methods also work for the KS_Link app sign-in endpoints (the app can use the authenticator code or a backup code; it has no "email me a code" button yet).

**Database:** run `migrations/020_twofa_email_method.sql` (adds `users.twofa_email_enabled`). Before it is applied the site keeps working with the old one-method rule, but a second method can't be added to an account.

## Cloudflare secrets (Production)

| Secret | Example |
|--------|---------|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | your Twilio auth token |
| `TWILIO_FROM_NUMBER` | `+15551234567` (your Twilio SMS-capable number) |

Add under **Workers & Pages → kanasaka-site → Settings → Variables and secrets → Production**.

## Twilio setup

1. Create a Twilio account: https://www.twilio.com/
2. Buy or verify an SMS-capable phone number
3. Copy Account SID and Auth Token from the Twilio console
4. Add the three secrets above in Cloudflare
5. Redeploy production

## D1 migration

```bash
cd ~/KANASAKA_SITE
npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/009_sms_two_factor.sql
```

## User flow

**Enable 2FA (Account Settings → Account Management)**

1. Enter phone number with country code (e.g. `+49 1522 3693645`)
2. Click **Send Verification Code**
3. Enter the 6-digit SMS code → **Enable 2FA**

**Sign in**

1. Email + password
2. SMS code is sent automatically
3. Enter code → signed in

**Disable 2FA**

1. Click **Send Verification Code**
2. Enter password + SMS code → **Disable 2FA**

## Notes

- German numbers starting with `0` are auto-converted to `+49`
- Codes expire after 5 minutes
- Twilio bills per SMS; monitor usage in the Twilio console
- Users who enabled TOTP before this change must set up SMS again (old authenticator codes no longer work)
