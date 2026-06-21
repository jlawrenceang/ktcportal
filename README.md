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
cp .env.example .env.local   # fill from your KTC Supabase project (Settings -> API)
npm run dev
```

### Supabase setup (one time)

1. Create a **KTC-exclusive Supabase project** (separate free account).
2. SQL Editor → paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → Run.
3. Copy the project URL + anon/publishable key into `.env.local`.

## Data model

| Table | Purpose |
|---|---|
| `consignees` | master list (code, name) — uploaded later |
| `brokers` | broker profile, 1:1 with an auth user |
| `accreditations` | broker ⇄ consignee links (pending/approved/rejected) |
| `job_orders` | a submission (auto `X-#####`, broker, entry #) |
| `job_order_lines` | the repeating container rows (number + service) |

RLS ensures each broker only sees their own data. The per-broker consignee dropdown is just
`accreditations` filtered to `status = 'approved'`.

## Layout

```
src/
  lib/        supabase client + AuthContext
  pages/      Login, Home (Job Order / Accreditation UIs next)
  components/ ProtectedRoute
  styles/     v2-tokens.css (visionOS design tokens)
supabase/migrations/  schema
assets/, scripts/, docs/   logo, ops scripts, project docs (ADRs + obsidian-vault)
```

## Status / next

- [x] App scaffold, auth (Supabase), branded login + home shell
- [x] Schema + RLS migration (`0001`)
- [x] Registration: full name + valid-ID upload (Supabase Storage, `0002`)
- [x] Job Order form with per-broker approved-consignee dropdown
- [x] Accreditation request + **admin approval** screen (`is_admin` framework)
- [ ] Consignees uploader (Excel → `consignees`)
- [ ] Deploy to Vercel

### Admin setup

After a user signs up, make them an admin: run `supabase/seed-admin.sql` (with their
email) in the SQL Editor. Admins get an **Admin** nav tab to approve/reject
accreditation requests and view brokers' uploaded IDs.
