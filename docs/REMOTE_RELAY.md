# Remote relay (KS_C1 phone remote)

Carries encrypted frames between the devices of one KANASAKA account: a desktop running KS_C1 and the phones signed in to the
same account. It cannot read them (the devices encrypt end to end). Design and threat model: the KS_C1 repository,
`docs/superpowers/specs/2026-11-26-mobile-remote-design.md` and `docs/SECURITY.md` ("Remote control from a phone").

## Pieces

| Where | What |
|---|---|
| `functions/api/app/remote.js` | `GET /api/app/remote` (WebSocket). Checks the bearer app session, then hands the socket to the account's relay object. The only way in. |
| `scripts/relay/room.js` | The relay's logic for one account (who is connected, what is forwarded). Plain JavaScript, tested in `tests/relay-room.test.mjs`. |
| `scripts/relay/index.js` | A Worker exporting the `AccountRelay` Durable Object, one per account (`user:<id>`), wrapping `room.js`. No public route. |
| `scripts/relay/wrangler.toml` | The Worker's config (`kanasaka-relay`, `workers_dev = false`, SQLite-backed Durable Object). |
| `functions/lib/app-sessions.js` `revokeAtRelay` | Tells the relay to drop a device's socket when its session ends (sign-out, device removal, password change or reset, 2FA off, account deletion, eviction over the cap). Best effort. |

It lives under `scripts/` so the repo-exposure guard already keeps it from being served; it is a separate Worker because a Pages
project cannot define a Durable Object class.

## Wire contract

The desktop and the phone app speak the same thing (the KS_C1 side is `src-tauri/src/remote/link.rs`).

- Connect: `wss://kanasaka.com/api/app/remote` with `Authorization: Bearer <app session token>`.
- Device to relay, text: `{"hello":{"role":"desktop"|"phone","deviceId":"<32 hex>","name":"<=60 chars>","public":"<base64 of a 32-byte X25519 key>"}}`.
- Relay to that device, text: `{"peers":[{"id","name","public","role"}]}` (the account's other connected devices). Relay to the others:
  `{"peer-joined":{...}}` and `{"peer-left":"<id>"}`. A device that reconnects is announced again, so both sides start a fresh session.
- Device to device, binary: 16 bytes naming the target device, then anything. The relay swaps those 16 bytes for the sender's id and
  forwards; it never looks at the rest.
- One session is one device id, and an id belongs to the session that first used it. At most 10 devices per account. A frame over
  16 MB, or more than 600 messages in 10 seconds, closes the sender. A connection older than 12 hours is closed so it signs in again.
- Close codes: 4400 bad hello, 4401 signed out, 4403 device id taken, 4409 replaced, 4413 too big, 4429 too many devices or too much
  traffic, 4000 too old.

## Deploying (you do this; nothing here is deployed by an agent)

1. Deploy the Worker first: `npx wrangler deploy -c scripts/relay/wrangler.toml`. (Durable Objects with SQLite storage are available
   on the free plan. If your plan does not allow them, the deploy says so.)
2. The Pages project binds it through `wrangler.toml` (`[[durable_objects.bindings]]`: name `REMOTE_RELAY`, class `AccountRelay`, script
   `kanasaka-relay`). That file is the source of truth for the project's bindings: a binding added only in the dashboard is dropped by the
   next deploy. Merging a change to it deploys it. The Worker must exist first (step 1), because a binding to a Worker that is not deployed
   fails the Pages deploy. Until the binding is live, `/api/app/remote` answers 503 "Remote is not available yet", which is safe.
3. WAF: see `docs/CLOUDFLARE_WAF.md` ("Remote relay"). The endpoint is a GET under `/api/app/`; do not add a managed challenge.
4. Optional, before deploying: `node scripts/relay/smoke.mjs` runs the Worker in the real Workers runtime (workerd, through Miniflare)
   and checks join, forwarding, a stolen device id, revocation and leave. It needs the runtime `npx wrangler` installs.
5. Check: from a signed-in desktop, turn Remote on for a task; KS_C1 shows "REMOTE ON" and a phone signed in to the same account
   sees the task.

## Limits to verify after deploy

- Workers limit the size of one WebSocket message. KS_C1 caps what it sends at 16 MB (images are limited to 8 MB in total) and the
  relay closes a sender at 16 MB; if the platform's own limit is lower, large image prompts will drop the connection and the
  limits here and in KS_C1 (`LIMITS` in `src/lib/remote/protocol.ts`) should be lowered to match.
- A Durable Object holds its sockets in memory while any are open, so an idle account costs nothing and a connected one costs
  duration. The object closes itself when its last socket goes.
