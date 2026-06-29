# E2E tests (Playwright)

Headless browser tests for the KTC portal.

## Run

```sh
npm run test:e2e            # target = BASE_URL from .env.local (test build) or prod if unset
npm run test:e2e:ui        # interactive UI mode
BASE_URL=https://portal.ktcterminal.com npx playwright test smoke   # force prod smoke run
```

`playwright.config.ts` loads `.env.local`, so with the Phase 2 block filled the default target is the **local test build** (`BASE_URL=http://localhost:3000`). To run Phase 2: build pointed at the test project, serve it, then test —

```sh
VITE_SUPABASE_URL=$E2E_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$E2E_PUBLISHABLE_KEY VITE_TURNSTILE_SITE_KEY= npx vite build
npx vite preview --port 3000 --strictPort   # keep running
npx playwright test
```

First-time setup (already done once): `npx playwright install chromium`.

## Layout

- `smoke.spec.ts` — **Phase 1, active.** Unauthenticated smoke: routing, login render, protected-route redirects, SPA rewrite, release routes (`/releases` + `/admin/releases`), the billing-cutover routes (`/admin/payment-orders` + `/admin/charges`; the cashier PWA is now `/app/payment-orders`), confirmation that the DELETED billing routes (`/job-order/:id/pay`, `/admin/cashier`, `/app/cashier`) fall through to `/`, public `/agreement` page (+ `/irr` `/terms` `/privacy` redirects), registration consent gate, Turnstile mounts. Runs without logging in, so the server-side CAPTCHA doesn't block it.
- `authenticated.spec.ts` — **Phase 2.** Authenticated flows. **Skips by default**; runs when the env below is set. Mutation-heavy lanes are `test.fixme` until pointed at a seeded test project — the live `test.fixme` titles document the v2.0.0 charge flow (add/approve charge, per-charge pay, the FINAL-invoice confirm gate, payment orders, one-rule completion, monthly `YYMM-XXXX` serving, admin-only cancel).
- `customer-lifecycle.spec.ts` — **active, prod round-trip.** A throwaway, self-purged customer drives the real UI: release / support / consignee-request wires, then files a job order and asserts the **per-charge billing** spine (filing auto-seeds the base `service` charge per migration 0212; the customer's `JobOrderCharges` renders with an inline **Pay this charge** action), plus adversarial break paths (RLS isolation, blank/evil/double-submit).
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
