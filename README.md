# KTC Online Portal

The online front door and operations layer for **KTC Container Terminal Corp.** — a container terminal, port-services, and container-depot operator. Accredited customers file and pay for terminal services online; KTC staff run the matching back office through a single role-based system.

> **North star:** grow the portal from today's special-services + billing layer into a modular, Navis/Octopi-class terminal + depot operating system on the same web stack. The container/EIR data spine and gate/yard/depot modules are the build-out ahead (`docs/obsidian-vault/09-Future/`).

---

## Two portals, one system

### 🧑‍💼 Customer portal (customs brokers)
- **Job Orders** — file requests for special / value-added services (**X-ray** inspection, **DEA** exam, **OOG** stripping) against consignees, with per-container entry, a live status timeline, edit/cancel, and a printable, **QR-verifiable** job slip.
- **Releases / pull-out** — file a release against a Bill of Lading, upload the DO/BL, receive the computed charges, pay online, and track it through to the Official Receipt.
- **Consignees** — request new consignees with a full Customer Information Sheet (CIS) and BIR documents (2303 / 2307), and track approval.
- **Online payments** — upload proof of payment (bank / QRPH) with a clear per-order balance and breakdown.
- **Help & notifications** — an in-app notification center, **Lara** (a guided help assistant), and a support-ticket desk.
- **Self-service tools** — a rate calculator, vessel schedule, bulletins, and per-role manuals + guided tours, in **English and Tagalog**.

### 🛠️ Staff portal (six gated roles)
Every role is scoped to its lane by backend permissions:

| Role | Owns |
|---|---|
| **Operations** | Accept / hold / process orders, assess RPS (reefer / plug) charges, request priority + re-X-ray, request additional charges |
| **Cashier** | The money lane — confirm payments, bill charges, record the ERP invoice / OR |
| **Checker** | Per-van X-ray confirmation (a focused, installable PWA + scan screen) |
| **CSR** | Consignee + release document review and the support inbox |
| **Admin / Owner** | Full back office — approvals, customers, pricing & tariff, roles & gates, vessel schedule, system health, security log |
| **Purchaser** | Fuel monitoring (backend live; the desk is on the roadmap) |

Workflow guardrails are enforced server-side: a **two-gate completion rule** (all services done **and** payment confirmed), weekly-reset serving lanes, priority + re-X-ray sub-flows, and automatic order completion.

---

## Access & security model

Authority lives in the **database, not the frontend**:

- All writes go through **Postgres Row-Level Security + SECURITY DEFINER RPCs** — the UI can't grant itself anything.
- **Invite-only staff** (no admin self-signup) and a **server-only owner failsafe** account that cannot be locked out.
- Server-enforced CAPTCHA, single-session-per-account, idle auto-logout, disposable-email blocking, and a full security-event audit trail.
- **Forward-only migrations.** `git push` deploys the **frontend** (Vercel) — never the database; schema changes are applied deliberately and separately.

---

## Tech stack

**Vite · React · TypeScript · Tailwind** on the front end · **Supabase** (Auth + Postgres + RLS + Storage + Edge Functions) on the back end · **Vercel** hosting · an installable **PWA** for floor roles · **Resend** transactional email · **Web Push** notifications.

---

## Repo layout

```
src/
  lib/         supabase client, auth, pricing, shared helpers
  pages/        customer portal (under Shell.tsx)
  admin/        staff portal (under AdminShell.tsx)
  components/   shared UI, route guards, Lara chat
  styles/       design tokens (visionOS-style, KTC accent)
supabase/
  migrations/   the authoritative, forward-only schema history
  functions/    edge functions (email, push, sync, crons)
docs/
  adr/                 architecture decision records
  agent/               modular engineering rules
  obsidian-vault/      living project memory (system, workflows, current state, roadmap)
  audits/              audit + break-test catalogs
scripts/        ops + migration scripts
```

---

## Getting started

```bash
npm install
# Create .env.local with your KTC Supabase project URL + anon/publishable key.
npm run dev          # local dev server
npm run build        # typecheck + production build
npm run test:e2e     # Playwright smoke tests
```

**Supabase setup (one time):**
1. Create a **KTC-exclusive Supabase project** (its own account — kept strictly isolated from any other system).
2. Apply everything in `supabase/migrations/` in order (forward-only; the schema *is* the migration history, not a single init file).
3. Put the project URL + anon/publishable key in `.env.local`.

---

## Documentation

The repo carries a layered documentation system that is the source of truth for current state:

- **`CLAUDE.md` / `AGENTS.md`** — the engineering constitution.
- **`docs/obsidian-vault/`** — living memory: system context, workflows, current state, and roadmap (kept fresh every working session).
- **`docs/adr/`** — architecture decision records.
- **`docs/agent/`** — modular engineering rules (release gate, runtime safety, testing, etc.).
- **`supabase/migrations/`** — the authoritative schema.

For the current version, scale, and what's shipping next, start at `docs/obsidian-vault/07-Memory/Current State.md`.

> **Terminology:** the database/code say `broker`; the UI and newer docs say `customer` — the same actor (an accredited customs broker), one account pool.

---

## Status

Live and deployed on Vercel. The portal is in active development against the north-star roadmap, with ongoing pre-go-live hardening (security, break-testing, and operational polish). Current version and migration count are tracked in the living docs above rather than duplicated here.
