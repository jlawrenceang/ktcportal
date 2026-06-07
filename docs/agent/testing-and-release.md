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

## Current state of automated testing

There is **no Vitest/Playwright suite yet** — verification is `lint` + `build` + manual/`curl` smoke. An automated smoke lane (Playwright against the deployed URL) is a future hardening lane; see `docs/obsidian-vault/07-Memory/Pending Items.md`. When that lands, write new workflow coverage there first.
