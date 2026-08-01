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

Set `KS_UNIFY_WINDOWS_INSTALLER`, `KS_UNIFY_LINUX_INSTALLER`, or `KS_UNIFY_MACOS_INSTALLER` if files live elsewhere.

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
