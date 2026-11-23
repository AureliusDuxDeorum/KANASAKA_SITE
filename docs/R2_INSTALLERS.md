# KS_Link installer downloads (R2)

KS_Link is free — every download and the self-updater manifest are served
publicly, with no session and no signed/expiring link.

## One-time setup

1. Create bucket (if needed — shared with other KANASAKA products):

```bash
cd ~/KANASAKA_SITE
npx wrangler r2 bucket create kanasaka-installers
```

2. Build KS_Link (in the `KS_Link` repo, not this one) and publish each
   platform artifact:

```bash
node scripts/publish-ks-link-update.mjs windows-x86_64 <path-to-exe> [notes]
node scripts/publish-ks-link-update.mjs linux-deb <path-to-deb>
node scripts/publish-ks-link-update.mjs linux-rpm <path-to-rpm>
node scripts/publish-ks-link-update.mjs linux-appimage <path-to-AppImage>
node scripts/publish-ks-link-update.mjs android <path-to-apk>
```

Only `windows-x86_64` needs a `.sig` next to it (produced automatically by
`tauri build` with `TAURI_SIGNING_PRIVATE_KEY` set) and publishes a
self-updater manifest alongside the installer. The rest are plain
downloads with no manifest entry.

3. Bind R2 in **Cloudflare Pages → kanasaka-site → Settings → Bindings**:

| Type | Variable name | Bucket |
|------|---------------|--------|
| R2 bucket | `INSTALLERS` | `kanasaka-installers` |

4. Redeploy production.

## Flow

1. Visitor clicks a platform button on `/downloads/#ks-link` (no login) —
   or the installed Windows app's self-updater checks on its own.
2. `GET /api/ks-link-updater/latest.json` returns Tauri's own
   update-manifest shape (`version`, `notes`, `pub_date`, `platforms`),
   read straight from the R2 object with `platforms.*.url` filled in per
   request from the live origin.
3. `GET /api/ks-link-updater/download/<platform>` streams the matching
   installer from R2.

## Object keys

| Platform | R2 key |
|----------|--------|
| windows-x86_64 | `installers/ks-link/windows-x86_64/KS_Link.exe` |
| windows-x86_64 updater manifest | `installers/ks-link/windows-x86_64/latest.json` |
| linux-deb | `installers/ks-link/linux-deb/KS_Link.deb` |
| linux-rpm | `installers/ks-link/linux-rpm/KS_Link.rpm` |
| linux-appimage | `installers/ks-link/linux-appimage/KS_Link.AppImage` |
| android | `installers/ks-link/android/KS_Link.apk` |

Only Windows self-updates (tauri-plugin-updater) — Linux's package
managers / AppImage's own mechanism and Android's Play Store/APK
side-load path handle that differently, and Tauri's desktop updater
plugin doesn't build for mobile at all.

# KS_C installer downloads (R2)

KS_C (app repo: `KS_C1`) uses the same bucket and `INSTALLERS` binding. Downloads are public, with no session; the app asks
for a KANASAKA account when it opens. There is no updater manifest on the site: KS_C's own signed updates come from its
release host (KS_C1 `docs/RELEASE.md`).

```bash
node scripts/publish-ks-c.mjs windows-exe <path-to-setup.exe>
node scripts/publish-ks-c.mjs windows-msi <path-to-.msi>
node scripts/publish-ks-c.mjs linux-deb <path-to-.deb>
node scripts/publish-ks-c.mjs linux-rpm <path-to-.rpm>
node scripts/publish-ks-c.mjs linux-appimage <path-to-.AppImage> 1.0.0 "Release notes"
```

The optional last two arguments (version, notes) write `installers/ks-c/version.json`, served at
`GET /api/ks-c/version.json`. Give them on the last platform of a release.

| Platform | R2 key |
|----------|--------|
| windows-exe | `installers/ks-c/windows-x86_64/KS_C.exe` |
| windows-msi | `installers/ks-c/windows-x86_64/KS_C.msi` |
| linux-deb | `installers/ks-c/linux-deb/KS_C.deb` |
| linux-rpm | `installers/ks-c/linux-rpm/KS_C.rpm` |
| linux-appimage | `installers/ks-c/linux-appimage/KS_C.AppImage` |

`GET /api/ks-c/download/<platform>` streams the object. A platform with nothing uploaded answers 404, so upload before
deploying, or leave that button out of `/downloads/`.
