---
title: Architecture Overview
tags: [architecture, reference, system-map]
type: reference
last_updated: 2026-06-25
---

# KTC Online Portal — Architecture Overview

One-screen system map: **what runs where, how access is enforced, and where each module lives.**
This page stays **structural** so it doesn't go stale — for live figures (migration no., `APP_VERSION`,
row counts) see [Current State](obsidian-vault/07-Memory/Current%20State.md) and
[System Scale](obsidian-vault/07-Memory/System%20Scale.md). For the detailed role/permission
matrix + state machines see [Role & Operation Flows](diagrams/role-and-operation-flows.md).

**Source of truth:** runtime code (`src/**`) + `supabase/migrations/**`. When this doc and the
runtime disagree, **runtime wins** and this doc is fixed in the same change (precedence ladder:
`docs/agent/doc-governance.md`).

## Stack

One SPA — **Vite 5 · React 18 · TypeScript 5 · Tailwind 3 · react-router-dom 6** — talking to
**Supabase** (Postgres + Auth + Storage + Edge Functions) via `@supabase/supabase-js 2`. Hosted on
**Vercel** at `portal.ktcterminal.com`; `git push` deploys the **frontend only** — DB changes are
**forward-only migrations** applied out-of-band (`scripts/run-migrations.mjs`). Backend project is
`mdlnfhyylvapzdubhyic` — **KTC's own Supabase account, not jta-sys** (the connected `mcp__supabase__*`
tools point at jta-sys; never use them here — see `docs/agent/runtime-data-safety.md`).

## Topology — one app, three surfaces, one backend

| Surface | Who | Entry | Code |
|---|---|---|---|
| **Customer portal** | accredited customs brokers ("customers") | `/` | `src/pages/**` |
| **Admin back office** | owner · admin · operations · cashier · checker · csr | `/admin/**` | `src/admin/**` |
| **Installable staff PWA** | operational roles (focused single-purpose screens) | `/app/**` | `src/app/**` |

All three are the **same React bundle** (route-code-split); `RoleLanding` (`src/App.tsx`) routes each
role to where it works. One Supabase backend serves all three.

## Access model — backend-enforced (the load-bearing invariant)

- **Every write goes through a `SECURITY DEFINER` RPC** gated by `has_permission()` (staff) or the
  `broker_*` helpers (customer). **RLS** protects every table; the UI only mirrors the server gate
  (release-gate check 1).
- **Owner failsafe** — `jlawrenceang@gmail.com`, server-only `is_owner`, bypasses every gate, cannot be
  locked out; owner *grants* are **root-owner-only** (`set_owner_access`).
- **Staff are invite-only** (`create_staff`) — no admin self-signup. Roles are **data-driven** on the
  `role_permissions` matrix, editable in **Settings → Roles & Gates**.
- **One session per account** (`claim_session` + `session_alive()` woven into the RLS helpers),
  **idle auto-logout** (customer 15 min / staff 60 min), **server-side CAPTCHA** (Managed Turnstile).

## Two operational spines

One customer account and one back office drive two independent spines (state machines + per-role
flows: [Role & Operation Flows](diagrams/role-and-operation-flows.md)):

- **Job Order spine** — special / value-added services (X-Ray · DEA · OOG …).
  `held → submitted → processing → completed` (+ `on_hold` · `rejected` · `cancelled`). Completion is
  **two-gated**: all services done **and** base + RPS + every supplement paid (`jo_ready_to_complete`).
  Most containers have **no** JO — it's a service overlay.
- **Release / Pull-out spine** — billing for **every** container (ADR-0024).
  `submitted → docs_verified → payable → paid → released`. **Approved customers only**; the OR is
  blocked until every supplement is confirmed.

The canonical status/role/permission **enums live in `src/lib/types.ts`** — do not restate them
elsewhere as contracts.

## Module / route map

| Group | Routes (representative) | Owning code |
|---|---|---|
| **Public** | `/login` · `/register` (QR walk-in) · `/agreement` · `/verify/:id` (slip QR) · `/confirmed` · `/forgot-password` · `/reset-password` | `src/pages/*` |
| **Customer — orders** | `/job-order` · `/job-orders` · `/job-order/:id/pay` · `/job-order/:id/print` (A6 slip) | `src/pages/*` |
| **Customer — release & requests** | `/releases` · `/requests` (consignee/vessel requests) | `src/pages/Releases`, `MyRequests` |
| **Customer — tools/account** | `/calculator` · `/vessels` · `/support` · `/account` · `/verify-id` · `/manual` | `src/pages/*` |
| **Admin — back office** | `/admin` (Dashboard) · `/admin/approvals` · `/admin/customers[/:id]` · `/admin/consignees` · `/admin/job-orders` · `/admin/new-job-order` · `/admin/releases` · `/admin/cashier` · `/admin/checker` · `/admin/vessel-schedule` · `/admin/settings` · `/admin/bulletin` · `/admin/support` · `/admin/logs` · `/admin/security` · `/admin/manual` | `src/admin/*` |
| **Staff PWA** | `/app` (home) · `/app/checker` · `/app/cashier` · `/app/operations` · `/app/support` | `src/app/*` + reused admin screens |

## Core data spine

`customers` · `consignees` · `accreditations` · `job_orders` + `job_order_lines` (+ supplements,
`rps_moves`, per-van X-ray) · `release_orders` + `release_supplements` · `vessel_schedule` →
derived `vessel_visit` · `role_permissions` · audit (`security_events` + change logs) · **fuel
module** (Phase 0 schema only). All applied + tracked in `public._migrations`.

## Cross-cutting systems

- **i18n** — English-keyed strings with a Tagalog fallback (`src/lib/i18n.ts`); first-run language chooser.
- **Notifications** — customer notification center + **web push** (`send-push` edge function, VAPID).
- **Vessel-schedule sync** — hourly Google Sheet ↔ app (pg_cron + edge functions), LFD mirror.
- **Onboarding** — per-role demo tours (`Tour`) + Markdown manuals (`MarkdownDoc`).
- **Audit & security** — `security_events`, login/status audit, retention crons, and the standing
  `scripts/check-security-invariants.mjs` gate (definer-ACL + owner-guard invariants).
- **Fuel monitoring** — derived variance on the moves spine (ADR-0025); DB Phase 0 live, frontend deferred.

## Where to go next

- **Live figures** (migration no. · `APP_VERSION` · scale) → [Current State](obsidian-vault/07-Memory/Current%20State.md) · [System Scale](obsidian-vault/07-Memory/System%20Scale.md)
- **Business background + product scope** → [Business Context](obsidian-vault/01-System/Business%20Context.md)
- **Domain / core detail** (per-core living memory) → [Architecture](obsidian-vault/01-System/Architecture.md) + `docs/obsidian-vault/02-Cores/` (Authentication, Customers, Consignees, Job Orders, Administration)
- **Operating rules** → `docs/agent/` (start at `docs/agent/README.md`: release-gate, runtime-data-safety, workflow-invariants …)
- **Decisions** → `docs/adr/` (`docs/adr/README.md`)
- **Detailed role flows + state machines** → [Role & Operation Flows](diagrams/role-and-operation-flows.md)
