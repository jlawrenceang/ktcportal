# M6 — Build the KTC Staff APK (TWA wrapper)

The APK is a **Trusted Web Activity (TWA)**: a thin Android wrapper that opens
`https://portal.ktcterminal.com` full-screen (no URL bar). Same site, same code,
auto-updates on every deploy — you only rebuild the APK if the wrapper config
(icon/name/colors/package) changes. See `docs/plans/staff-app-plan.md` for the why.

**This repo already ships everything the build needs:**
- `public/manifest.webmanifest` + `public/app-icon.svg` (installable PWA)
- `twa-manifest.json` (Bubblewrap config, pre-filled)
- `public/.well-known/assetlinks.json` (Digital Asset Links — fingerprint placeholder)

The actual `bubblewrap build` needs a **JDK + Android SDK**, which are NOT on the
build box here. Run the steps below on a machine that has them (your laptop or CI).

## Prerequisites (one-time)
1. **Node 18+** (already have it).
2. **JDK 17** and **Android SDK** (Android Studio installs both). Bubblewrap can
   also auto-download a JDK + Android SDK on first run if you let it.
3. A **512×512 PNG** app icon at `https://portal.ktcterminal.com/app-icon-512.png`.
   We ship an SVG; export it to PNG once and drop it in `public/` (Bubblewrap
   needs a raster icon for the launcher). Any tool works — e.g. open
   `public/app-icon.svg`, export 512×512 PNG, save as `public/app-icon-512.png`,
   commit (it deploys with the next push).
4. Install the CLI: `npm i -g @bubblewrap/cli`

## Build
From the repo root (the pre-filled `twa-manifest.json` is here):

```bash
# 1. Initialize from the live web manifest (generates the signing keystore the
#    first time — KEEP android-keystore.jks safe; it signs every future update).
bubblewrap init --manifest https://portal.ktcterminal.com/manifest.webmanifest

# 2. Build the signed APK (and an .aab for Play, if ever needed).
bubblewrap build
#  → outputs app-release-signed.apk
```

## Wire up Digital Asset Links (removes the URL bar)
1. Get the signing fingerprint:
   ```bash
   bubblewrap fingerprint   # prints the SHA-256 of your signing key
   ```
2. Put that SHA-256 into `public/.well-known/assetlinks.json` (replace
   `REPLACE_WITH_SHA256_FINGERPRINT_FROM_BUBBLEWRAP_FINGERPRINT`), commit + push.
   Vercel serves it at `https://portal.ktcterminal.com/.well-known/assetlinks.json`.
3. Verify: `https://developers.google.com/digital-asset-links/tools/generator`
   (or just install the APK — if the URL bar is gone, verification passed).

## Distribute (no Play Store needed)
- **Sideload:** copy `app-release-signed.apk` to the device and install (enable
  "install unknown apps" for the file manager once).
- **MDM / kiosk:** push the APK via your Android Enterprise / MDM and set the
  device to **single-app kiosk** locked to `com.ktcterminal.portal`. This is what
  delivers the "open and only check" lockdown.

## Notes
- `enableNotifications: true` in `twa-manifest.json` delegates Web Push to the
  TWA, so the phone push we already shipped works inside the APK too.
- Updating the **site** = just `git push` (Vercel). Updating the **wrapper**
  (icon/name/package) = bump `appVersionCode` in `twa-manifest.json`, rebuild,
  redistribute.
- Keep `android-keystore.jks` + its passwords backed up securely — losing them
  means you can't ship signed updates under the same package id.
