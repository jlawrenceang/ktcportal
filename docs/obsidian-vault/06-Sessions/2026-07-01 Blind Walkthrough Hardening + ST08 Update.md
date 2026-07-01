---
title: 2026-07-01 Blind Walkthrough Hardening + ST08 Update
tags: [session, go-live, smoke-test, auth, ux]
type: session
---

# 2026-07-01 Blind Walkthrough Hardening + ST08 Update

## What shipped

- **Checkpoint 1 (`9ee653d`)** - shipped owner-provided Lara avatar and compact chat UI; vessel schedule/admin dashboard hardening; bulletin archive (`0233`); published tariff images (`0234`); customer email-change confirmation flow (`0235`); filled CIS print; consignee request tracking.
- **Checkpoint 2 (`830bd2a`)** - shipped route/menu transition hardening and trusted MFA sessions (`0236`). Production deployment `ktc-joborderform-6bbtfhqfl` is READY and aliased to `portal.ktcterminal.com` / `ktcterminal.com`.
- **DB parity** - migrations `0233`-`0236` applied to production; `0236` mirrored to sandbox after the latest checkpoint so trusted-MFA contract does not drift.

## Verification

- `npm run lint` passed.
- `npm run build` passed against production ref `mdlnfhyylvapzdubhyic`.
- Local Playwright route timing check confirmed the transition overlay is visible immediately after navigation, still present around 0.75s, and gone around 1.55s.
- `0236` trusted-MFA tables/RPCs verified on production and sandbox.
- Vercel deployment READY; log scan returned no logs for the deployment window.

## Docs updated

- ST08 remains the single active/current smoke test.
- `docs/smoke-test-08-go-live.md` now records the current checkpoint and adds rows for the July 1 shipped fixes.
- `docs/go-live-smoke-test.md` remains a pointer only.
- `docs/agent/testing-and-release.md` names ST08 as current through migration `0236`.
- Independent review notes added at `docs/audits/2026-07-01-go-live-hardening-independent-review.md`.

## Current workspace batch 2

- Implemented after docs checkpoint `c309cbd`: New JO `C-` entry formatting, 2-step mobile filing, first-screen vessel + up to 10 verification images, review container count, and post-submit supporting image upload through existing `jo-documents` / `add_jo_support`.
- Auth/session hardening: Google OAuth sign-ins stamp fresh activity, customer web idle window is now 30 minutes, MFA assurance reads do not reload on token refresh, and MFA read failure shows retry/sign-out instead of indefinite loading.
- UI hardening: form routes skip global route transition overlay; Lara uses the supplied avatar, avoids mobile auto-focus jump, has Back/Start over, and can hand off a safe local JO draft; customer vessels calendar honors Show past/cancelled with a current + 7-day history window; JO detail removes release-ready language and simplifies charge/detail actions.
- Added `docs/lara-chatbot-map.md`.
- Local `npm run lint` passed; build/deploy/live ST08 evidence still pending for this batch.

## Still open

- The blind-walkthrough task list is **not fully closed**. Remaining items need implementation, explicit deferral, or ST08 evidence.
- Manual ST08 is still the go-live gate: run the new July 1 rows first, then Android Part 15, then all-role/all-lane execution.
- Runtime footer still reports `v2.0.11`; this session is documented as `v2.0.11+` provenance by commit/deployment/migration.
