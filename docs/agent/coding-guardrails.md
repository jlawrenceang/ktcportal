# Coding Guardrails

## Working style

When changing portal code:
- Think like an operator first, developer second.
- Protect access controls before improving UX.
- Prefer small, grounded, verifiable fixes.
- Avoid unrelated redesign in the same change.
- Verify code *and* runtime behavior before concluding (see `testing-and-release.md`).

## Pattern rules

- Follow existing app patterns unless an explicit refactor is requested.
- Do not casually introduce major frontend architecture shifts (e.g. React Query, RHF, Zod, state libraries). The app is plain React + hooks + `@supabase/supabase-js`.
- Enforce high-risk logic (auth, approvals, staff creation) in RLS/RPC/DB layers — not frontend-only.

## Existing utilities (use these, don't re-roll)

- Supabase client — `src/lib/supabase.ts` (the single client; build from env, never hardcode keys).
- Auth — `src/lib/AuthContext.tsx` (`useAuth()` → `signIn`/`signUp`/`signOut`).
- Current broker — `src/lib/useBroker.ts` (`useBroker()`; already filters by `user_id`).
- Types + helpers — `src/lib/types.ts` (`Broker`, `Consignee`, `SERVICE_REQUESTS`, `hasAdminAccess`).
- CAPTCHA widget — `src/components/Turnstile.tsx` (+ `captchaEnabled`).
- Design tokens — `src/styles/*` (visionOS v2 tokens + KTC accent). Use `ktc-glass`, `ktc-btn`, `ktc-input`, `ktc-label`, `ktc-link` classes.

## React hook safety (mandatory)

All hooks must be declared **before** any early return. Never place hooks after `if (loading) return …` / `if (!data) return …`, and never call hooks conditionally, in loops, or inside nested render helpers. If logic becomes conditional, extract a child component.

## Supabase data-shape gotchas

- To-one embeds come back as arrays — normalize with the `one<T>()` helper rather than indexing `[0]` ad hoc.
- Friendly-error mapping: `23505` = duplicate (surface a human message, e.g. duplicate consignee code).

## Repo hygiene

- Migrations live in `supabase/migrations/`. Forward-only (see `runtime-data-safety.md`).
- `.env.local` and `.vercel/` are gitignored — never stage them.
- Checkpoint before risky work: `git status` → stage only intended files → commit with a clear message → push only when intended for remote sharing.
- `npm run lint` (= `tsc --noEmit`) must pass before declaring done.
