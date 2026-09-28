# Private installer downloads (R2)

Production downloads no longer redirect to public GitHub URLs. Authenticated users receive a short-lived signed link that streams the installer from private R2 storage.

## One-time setup

1. Create bucket (if needed):

```bash
cd ~/KANASAKA_SITE
npx wrangler r2 bucket create kanasaka-installers
```

2. Upload installers:

```bash
node scripts/upload-installers-r2.mjs
```

Set `KS_UNIFY_WINDOWS_INSTALLER`, `KS_UNIFY_LINUX_INSTALLER`, `KS_UNIFY_MACOS_INSTALLER`, or `KS_K_MOBILE_ANDROID_APK` if files live elsewhere.

3. Bind R2 in **Cloudflare Pages → kanasaka-site → Settings → Bindings**:

| Type | Variable name | Bucket |
|------|---------------|--------|
| R2 bucket | `INSTALLERS` | `kanasaka-installers` |

4. Redeploy production.

## Flow

1. Logged-in user clicks download on `/downloads/`
2. `/api/download/{platform}` checks session
3. Worker issues HMAC-signed URL valid for 5 minutes
4. `/api/download/file?token=...` streams object from R2 once

## Object keys

| Platform | R2 key |
|----------|--------|
| windows | `installers/windows/KS.Unify_0.1.0_x64-setup.exe` |
| linux | `installers/linux/KS.Unify_0.1.0_amd64.deb` |
| macos | `installers/macos/KS.Unify_0.1.0_aarch64.dmg` |
| android (KS-K Mobile, `@dev_ks` only) | `installers/ks-k-mobile/android/app-release.apk` |
| android updater manifest | `installers/ks-k-mobile/android/latest.json` |

## K's own updater (not the browser download flow above)

K's own HTTP client checks for updates itself -- no browser, no session
cookie. It authenticates with the same shared secret used to skip SMS 2FA
(see `K_REMOTE_LOGIN_KEY` / `X-K-Remote-Login-Key` in `docs/CLOUDFLARE_WAF.md`),
sent as a header on both requests below:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/k-updater/latest.json` | Returns `{version, versionCode, pubDate, size, sha256, url}` -- everything but `url` comes straight from the R2 object; `url` is filled in per-request from the live origin |
| `GET /api/k-updater/apk` | Streams the APK itself |

`scripts/upload-installers-r2.mjs` writes the manifest automatically whenever
it uploads the android APK (reads `versionName`/`versionCode` from the
build's `output-metadata.json`, hashes the APK for `sha256`). Both endpoints
403 without a valid `X-K-Remote-Login-Key` header -- there is no public,
unauthenticated path to either the manifest or the APK.
