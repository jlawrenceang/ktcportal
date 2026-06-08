# Testing and Release

## Baseline checks

Before declaring a change ready:
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
- The current portal smoke test is `docs/smoke-test-01-portal.md` (ST01) — auth/CAPTCHA, broker onboarding, consignees/accreditation, job orders, owner-only staff. Its preflight lane (P1–P7) is automatable; lanes 1–5 are manual browser walks.

## Current state of automated testing

There is **no Vitest/Playwright suite yet** — verification is `lint` + `build` + the ST01 preflight (`curl`) + the manual ST01 browser lanes. An automated smoke lane (Playwright against the deployed URL, encoding ST01's lanes) is a future hardening lane; see `docs/obsidian-vault/07-Memory/Pending Items.md`. When that lands, write new workflow coverage there first.
