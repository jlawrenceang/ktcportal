# Testing and Release

## Pre-ship Checks

Before declaring a change ready:

- `npm run lint` must be clean.
- `npm run build` must succeed for frontend/runtime changes.
- Run a targeted smoke test on every touched flow.

A green build is not a release signal. A green smoke run on the touched lane is.

## Runtime Targets

Production is the runtime contract. Sandbox mirrors the same migrations, schema, and functions for isolated testing with separate environment variables, secrets, and seed data. Do not copy prod data or prod secrets wholesale into sandbox.

KTC production Supabase ref: `mdlnfhyylvapzdubhyic`.
E2E sandbox Supabase ref: `zwvzadkgeyhkhyshkwhc`.

## Operational Verification

After workflow changes, exercise the real flow on the deployed site or local preview:

- Auth: owner lands on `/admin`; customer lands on the customer shell; CAPTCHA is enforced when enabled.
- Customer onboarding: pending stays verify-only until admin approval.
- Consignees: search, pagination, request/review, BIR 2303 guard.
- Job orders: approved filing, processing, per-van X-ray, charges, Payment Orders, verify QR.
- Staff: invite-only staff creation; role landings and gates match [[Staff Roles & Gates]].

## Smoke Test Governance

- **Exactly one active manual smoke test is allowed.** The active file must say `ACTIVE / CURRENT` in its header.
- **Current active smoke:** `docs/smoke-test-08-go-live.md` for v2.0.11+ go-live hardening / migration 0236, including Android Part 15 plus the 2026-07-01 route/menu, trusted-MFA, email-change, Lara, tariff, bulletin, CIS, and request-tracking checks.
- **Compatibility pointer:** `docs/go-live-smoke-test.md` points to the active file only. It must not contain test rows.
- **Closed legacy:** ST05, ST06, and ST07 are closed legacy stubs. They must not be executed for current go-live.
- When a newer smoke replaces ST08, mark ST08 `CLOSED / LEGACY` or `INACTIVE`, create the new active smoke, and update this file plus `docs/go-live-smoke-test.md` in the same commit.

## Automated E2E

Headless smoke tests live in `e2e/`.

```sh
npm run test:e2e
BASE_URL=http://localhost:4173 npm run test:e2e
npm run test:e2e:ui
```

Authenticated/mutating lanes must point at the dedicated sandbox project. Never disable prod CAPTCHA or mutate prod data to test.

There is no Vitest unit suite. When adding coverage for a new workflow, write the Playwright smoke first.
