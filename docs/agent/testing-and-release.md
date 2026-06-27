# Testing and Release

## Pre-ship checks

Before declaring a change ready (post-change — distinct from the pre-change *baseline-green* check in `coding-guardrails.md`):
- `npm run lint` (= `tsc --noEmit`) — must be clean.
- `npm run build` (= `tsc && vite build`) — must succeed.
- A targeted smoke test on every touched flow (below).

A green build is not a release signal. A green smoke run on the touched lane is.

## Operational verification (not build-only)

After workflow changes, exercise the real flow on the deployed site (`portal.ktcterminal.com`) or local dev:
- **Auth:** sign in as owner → lands on **Admin Portal** (`/admin`), not broker home. Broker sign-in → broker home. CAPTCHA widget renders and a token is required.
- **Broker onboarding:** register (with valid-ID upload) → appears as `pending` → admin approves → broker gains access.
- **Consignees:** search, paginate, add (duplicate guard), edit, approve, accreditation doc upload + view.
- **Job orders:** submit against an approved consignee; verify lines + service requests persist.
- **Staff:** owner creates a staff account in Settings → that username can sign in → lands on admin.

## Server-side CAPTCHA check (no browser needed)

Confirm enforcement by hitting the auth endpoint without a token — Supabase should reject with `captcha_failed`:

```sh
curl -s -X POST "https://mdlnfhyylvapzdubhyic.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","password":"wrong"}'
```

## Deploy verification

- `curl -s https://portal.ktcterminal.com` → SPA shell loads.
- Confirm the deployed bundle points at the KTC Supabase project and (if enabled) inlines the Turnstile site key.
- SPA deep-links (e.g. `/admin/consignees`) return `200`, not `404` (the `vercel.json` rewrite).

## Smoke test governance

- Manual smoke tests use the canonical Route/Click/Backend-Contract format: `docs/smoke-test-template-canonical.md`.
- Every test action names its owning backend (RPC / table write / storage), expected state change, side effects, and the guardrail it proves.
- The current portal smoke tests are **ST05** (`docs/smoke-test-05-portal.md`) — the broad go-live blind walkthrough (onboarding · Job Orders · Releases · roles · security) — and **ST06** (`docs/smoke-test-06-portal.md`) — the focused **ADR-0035** ops-overhaul deltas (auto-complete · serving lanes · priority · re-X-ray · request→bill charges · invoice-gated payment · role re-split). **ST04** is the release/pull-out deep dive; **ST01** is the original auth/onboarding/consignees walk. Each test's preflight lane (P1–P9) is automatable; the lane tables are manual browser walks.

## Automated E2E (Playwright)

Headless smoke tests live in `e2e/` (config `playwright.config.ts`). Default target is the deployed site; override with `BASE_URL`.

```sh
npm run test:e2e                                   # against portal.ktcterminal.com
BASE_URL=http://localhost:4173 npm run test:e2e    # against a local `npm run preview`
npm run test:e2e:ui                                # interactive
```

- **`e2e/smoke.spec.ts` — Phase 1, active (15 tests).** Unauthenticated smoke: routing, the public **AuthRail** access menu at `/`, login render, protected-route redirects (broker · admin · release · **`/app/*` staff PWA**), SPA rewrite, the inline agreement + consent ticks, Turnstile mounts + submit gated. Runs without completing a login, so the server-side CAPTCHA does not block it — the automated counterpart to ST01/ST05's no-auth checks. (Verified green against the live deploy 2026-06-27.)
- **`e2e/authenticated.spec.ts` — Phase 2 (skips by default).** Authenticated flows (ST01 Lanes 1–5). Uses `mintSession()` (`e2e/helpers/session.ts`) — service-role magic-link login, so CAPTCHA is never in the way and never disabled (ADR-0010). Runs only when `E2E_SUPABASE_URL` + `E2E_SERVICE_ROLE_KEY` are set (point at a dedicated test project for mutation lanes); skips cleanly otherwise. Mutation-heavy lanes are `test.fixme` until pointed at a seeded test project. Setup in `e2e/README.md`. Never disable prod CAPTCHA or mutate prod data to test.

There is no Vitest unit suite. When adding coverage for a new workflow, write the Playwright smoke first.
