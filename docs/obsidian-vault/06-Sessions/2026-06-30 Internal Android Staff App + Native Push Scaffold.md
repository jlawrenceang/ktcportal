---
title: 2026-06-30 Internal Android Staff App + Native Push Scaffold
tags: [session, android, native, go-live]
type: session
date: 2026-06-30
---

# 2026-06-30 Internal Android Staff App + Native Push Scaffold

## Summary

Shipped the internal Android staff-app lane as `v2.0.11` on top of the already-live ADR-0037 charges cutover. The APK is staff-only, target-guarded, and built for sandbox real-device smoke. It bundles the portal assets, routes staff to focused `/app/*` work surfaces, blocks customer accounts inside the APK, and keeps offline behavior limited to X-ray confirmations.

## What changed

- Added explicit sandbox/live target scripts for web, preview, and Android builds.
- Added sandbox APK branding (`KTC Test`) and a visible `SANDBOX DB` badge.
- Switched Capacitor from live-site shell mode to bundled-assets mode with Capgo updater readiness.
- Added native device helpers: Network, Preferences, Haptics, Local Notifications, Share, Push Notifications.
- Added `/app/device` for device status, push toggle, local alert test, share-sheet status, yard notes, and the yard outbox.
- Added native checker haptics and an offline outbox that queues only `record_van_xray`; queued items bind to the original signed-in staff user before replay.
- Added `0232_native_push_tokens.sql` and `send-native-push` source for native FCM delivery.
- Expanded `docs/smoke-test-08-go-live.md` with Android Part 15.

## Verification

- `npm run target:status` passed.
- `npm run lint` passed.
- `npm run check:i18n` passed.
- `npm run build:test` passed.
- `node scripts/check-security-invariants.mjs` passed.
- `npm run build:android:test` passed.
- Sandbox APK SHA256: `FEE72FD96A2D505E2F7B340F65E51D14552BC4B154DAC7F3B716B2DD978B4158`.
- Migration `0232_native_push_tokens.sql` applied to prod via `node scripts/run-migrations.mjs`.

## Not shipped / pending

- Real-device Android smoke is deferred to `docs/smoke-test-08-go-live.md` Part 15.
- `send-native-push` Edge Function deployment failed through the local Management API token (`401`); regenerate a valid Supabase `sbp_` PAT, deploy the function, then arm Firebase/native-push secrets.
- Native cloud push is configuration-pending, not active. Local notifications are still part of the APK smoke.