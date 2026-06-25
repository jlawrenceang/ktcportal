# KTC Online Portal (ktcportal)

Customer-facing portal for **KTC Container Terminal Corp.** — accredited customers (customs
brokers) log in, file **Job Orders** (X-ray / DEA / OOG) against consignees and file
**release / pull-out** requests; KTC staff run a separate admin portal. North star: a
modular Navis-style terminal + depot operating system (see `docs/obsidian-vault/09-Future/`).

**Stack:** Vite + React + TypeScript + Tailwind + Supabase (Auth + Postgres + RLS).
**Hosting:** Vercel. **Design:** JTA v2 "visionOS" tokens, KTC accent.

## Getting started

```bash
npm install
# create .env.local with your KTC Supabase URL + anon/publishable key (see "Supabase setup" below)
npm run dev
```

### Supabase setup (one time)

1. Create a **KTC-exclusive Supabase project** (separate free account).
2. Apply the migrations in `supabase/migrations/` (forward-only; the schema is the full migration history, not a single init file).
3. Copy the project URL + anon/publishable key into `.env.local`.

## Data model / domain

The MVP table sketch that used to live here is retired. For the current domain and what's
being built, see `docs/obsidian-vault/01-System/Business Context.md`; for the layer map see
`docs/obsidian-vault/01-System/Architecture.md`. The authoritative schema is the
forward-only migration history under `supabase/migrations/`. Access is backend-enforced via
RLS + SECURITY DEFINER RPCs. (Terminology: code/DB say `broker`; newer docs/UI say
`customer` — same actor, one pool.)

## Layout

```
src/
  lib/        supabase client + AuthContext
  pages/      customer portal (under Shell.tsx)
  admin/      staff portal (under AdminShell.tsx)
  components/ shared UI + route guards
  styles/     v2-tokens.css (visionOS design tokens)
supabase/migrations/  schema
assets/, scripts/, docs/   logo, ops scripts, project docs (ADRs + obsidian-vault)
```

## Status

Live and deployed (the MVP checklist that used to live here is retired). For the current
version, migration count, prod-data state, and what's next, see
`docs/obsidian-vault/07-Memory/Current State.md` and `Roadmap.md` — those are kept fresh
every session, so this README doesn't duplicate them.

### Staff & owner

Staff are **invite-only** (no admin self-signup); the server-only **owner failsafe**
(`jlawrenceang@gmail.com`) cannot be locked out. Roles (admin / operations / cashier /
checker / csr) are gated by `has_permission` in the backend. See
`docs/obsidian-vault/01-System/Business Context.md` and the Administration core. (The old
`seed-admin.sql` / `is_admin` MVP flow is retired.)
