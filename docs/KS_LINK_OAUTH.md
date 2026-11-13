# Signing in to the KS_Link app with a KANASAKA account

A KS_Link account **is** a KANASAKA account. The app has its own sign-in and registration screens; there is
no browser hand-off, no deep link and no polling any more.

```
 KS_Link app ──(HTTPS, directly)──► kanasaka.com      the password goes here and ONLY here
      │   POST /api/ks-link/login        { email, password, code_challenge }
      │                                  -> { code }  or  { twoFactorRequired, challenge, ... }
      │   POST /api/ks-link/two-factor   { challenge, code, code_challenge }  -> { code }
      │
      └──(HTTPS)──► KS_Link relay  POST /v1/auth/signin { code, code_verifier }
                         │   (server-to-server, with the client secret)
                         └──► kanasaka.com  POST /api/oauth/token { code, client_id, client_secret, code_verifier }
                                            -> { site_user_id, email, display_name, account_id }
                    relay finds / adopts / creates the KS_Link account and returns its own session token
```

- **The relay never sees the password.** Only the one-time code and the PKCE verifier.
- **PKCE (S256) is mandatory.** The app makes a random verifier, sends its SHA-256 challenge with the login, and
  keeps the verifier in memory. A stolen code is useless without it.
- The code is single use, expires after 120 seconds, and is stored hashed.
- Signing in from the app creates **no website session** and does not sign you out of the website (the website's
  own login still keeps one session per account).
- The credential checks are the website's, in one shared implementation (`functions/lib/login-flow.js`): the same
  per-account and per-address failure throttles, the verified-email rule, and the same two-factor step.
- Browsers on other sites are refused (`requireSameOrigin`); the native app sends no `Origin` header.

## Registration, email verification, password reset

The app calls the website's existing endpoints directly: `POST /api/auth/register`, `/api/auth/verify`,
`/api/auth/resend-verification`, `/api/auth/forgot-password`, `/api/auth/reset-password`. `GET /api/ks-link/config`
returns the Terms version registration requires.

## Configuration

`KS_LINK_OAUTH_CLIENT_ID` and `KS_LINK_OAUTH_CLIENT_SECRET` (the same pair the relay holds). Without them the app
sign-in endpoints answer 503.
