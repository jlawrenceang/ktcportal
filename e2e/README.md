# E2E tests (Playwright)

Headless browser smoke tests for the KTC portal.

## Run

```sh
npm run test:e2e            # against the deployed site (default)
npm run test:e2e:ui        # interactive UI mode
BASE_URL=http://localhost:4173 npm run test:e2e   # against a local preview
```

Default target is `https://portal.ktcterminal.com`. To test a local build:

```sh
npm run build && npm run preview   # serves on http://localhost:4173
BASE_URL=http://localhost:4173 npm run test:e2e
```

First-time setup (already done once): `npx playwright install chromium`.

## Layout

- `smoke.spec.ts` — **Phase 1, active.** Unauthenticated smoke: routing, login render, protected-route redirects, SPA rewrite, Turnstile widget present. Runs without completing a login, so the server-side CAPTCHA does not block it.
- `authenticated.spec.ts` — **Phase 2, `test.fixme`.** Authenticated flows (ST01 Lanes 2–5). Blocked until a CAPTCHA-free auth path exists — see the file header for the two unblock options (dedicated test Supabase project, or service-role session minting).

## Why auth flows aren't automated yet

Production Supabase enforces Cloudflare Turnstile on every password sign-in, so a headless browser cannot complete a UI login against prod. Phase 1 deliberately covers everything reachable *without* logging in. Phase 2 needs an isolated, CAPTCHA-free environment so we never weaken prod's protection to run tests.

These tests are the automated counterpart to the manual `docs/smoke-test-01-portal.md`.
