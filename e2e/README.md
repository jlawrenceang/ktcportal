# E2E tests (Playwright)

Headless browser tests for the KTC portal.

## Run

```sh
npm run test:e2e            # against the deployed site (default)
npm run test:e2e:ui        # interactive UI mode
BASE_URL=http://localhost:4173 npm run test:e2e   # against a local preview
```

Default target is `https://portal.ktcterminal.com`. First-time setup (already done once): `npx playwright install chromium`.

## Layout

- `smoke.spec.ts` — **Phase 1, active (11 tests).** Unauthenticated smoke: routing, login render, protected-route redirects, SPA rewrite, public `/agreement` page (+ `/irr` `/terms` `/privacy` redirects), registration consent gate (inline Agreement + two ticks), Turnstile mounts. Runs without logging in, so the server-side CAPTCHA doesn't block it.
- `authenticated.spec.ts` — **Phase 2.** Authenticated flows (ST01 Lanes 1–5). **Skips by default**; runs when the env below is set. Mutation-heavy lanes are `test.fixme` until pointed at a seeded test project.
- `helpers/session.ts` — `mintSession(page, email)`: logs a role in **without a UI login** (service-role magic link), so CAPTCHA is never in the way and never disabled. See ADR-0010.

## Phase 2 setup (authenticated)

The harness mints sessions via the `service_role` key, pointed at whichever project you configure. Two ways:

### Option A — dedicated test Supabase project (recommended for mutation lanes)

1. Create a 2nd Supabase project on the KTC account (free slot available).
2. Apply `supabase/migrations/*` to it (`DATABASE_URL=<test pooler> node scripts/run-migrations.mjs`).
3. In that project's Auth settings: **disable CAPTCHA** (or use Turnstile test keys) and add your test `BASE_URL` to **Redirect URLs**.
4. Seed test accounts (owner, an approved broker, a staff user) and some consignees.
5. Deploy/point a build at it and run:

```sh
$env:E2E_SUPABASE_URL="https://<testref>.supabase.co"
$env:E2E_SERVICE_ROLE_KEY="<test project service_role key>"   # secret — never commit
$env:E2E_OWNER_EMAIL="<owner email>"
$env:E2E_BROKER_EMAIL="<approved broker email>"
$env:E2E_STAFF_EMAIL="<username>@ktc-staff.local"
$env:BASE_URL="https://<your test deployment>"
npm run test:e2e
```

### Option B — service-role minting against prod (read-only only)

Same env, but `E2E_SUPABASE_URL` / `E2E_SERVICE_ROLE_KEY` / `BASE_URL` point at **prod**. Use only the non-mutating tests (role landings, surface checks). **Do not** run the mutation `fixme` lanes against prod. Add `BASE_URL` to prod's Auth Redirect URLs.

> The `service_role` key is highly privileged — keep it in your shell/CI secret store only, never in the repo. `.env*` is gitignored.

> **MFA note (since migration `0049`):** minted sessions are `aal1`. An account with a verified TOTP factor will hit the MFA challenge screen (and the backend denies its staff permissions), so point `E2E_OWNER_EMAIL`/`E2E_STAFF_EMAIL` at accounts **without** an enrolled factor — e.g. a dedicated e2e admin on the test project, not the real 2FA-protected owner.

## Why auth flows aren't on by default

Production Supabase enforces Cloudflare Turnstile on every UI sign-in, and the flows mutate data. We never weaken prod CAPTCHA or mutate prod data to test (ADR-0010) — so Phase 2 stays off until you point it at a properly configured project.

These tests are the automated counterpart to the manual `docs/smoke-test-01-portal.md`.
