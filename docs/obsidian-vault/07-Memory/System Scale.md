---
title: System Scale
tags: [memory, scale, metrics]
type: memory
last_updated: 2026-06-10
---

# 📏 System Scale

## Code

| Metric | Count |
|--------|-------|
| Migrations | **29** (`0001_init` … `0029_admin_job_order_processing`) — all applied + tracked in `public._migrations` (runner applies only new files) |
| Core tables | 5 (`customers` [renamed from `brokers`, 0021], `consignees`, `accreditations`, `job_orders`, `job_order_lines`) |
| Job-order statuses | `held` (unverified, queue-hidden) · `submitted` · `processing` (=approved) · `on_hold` · `completed` · `rejected` · `cancelled` |
| SECURITY DEFINER RPCs | `create_staff`, `is_admin`, `current_broker_id`, `broker_is_approved/pending`, `enforce_order_caps`, `ensure_jo_number`, `release_held_job_orders`, `guard_broker_protected_fields`, `expire_unverified_brokers`, `send_broker_approved_email` |
| Storage buckets | `valid-ids` (customer IDs) + consignee 2303 docs |
| Routes | customer (`/`, `/account`, `/job-order`, `/job-order/:id/print`, `/job-orders`, `/verify-id`, `/agreement`) + auth (`/login`, `/confirmed`, `/forgot-password`, `/reset-password`) + admin (`/admin`, `/admin/approvals`, `/admin/customers`, `/admin/customers/:id`, `/admin/consignees`, `/admin/job-orders`, `/admin/settings`). Old `/irr` `/terms` `/privacy` redirect → `/agreement`. |
| ADRs | **14** (`docs/adr/` — 0001–0014, all Accepted) |
| Automated tests | **11 Playwright** Phase 1 (unauth smoke, passing) + Phase 2 auth harness (6 role/surface + 4 `fixme`, runs when `E2E_*` set — service-role minting, ADR-0010). No Vitest unit suite. |

## Data

| Metric | Count |
|--------|-------|
| Consignees imported | **2,488** (from `Customer.csv`) |
| Owner accounts | 1 (`jlawrenceang@gmail.com`) |
| Staff accounts | created on demand via Settings |

## Stack

- Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom 6 + `@supabase/supabase-js` 2 (SPA)
- Supabase (Auth + Postgres + RLS + Storage) — project `mdlnfhyylvapzdubhyic`
- Cloudflare Turnstile CAPTCHA (server-verified)

## Hosting

- Vercel project `ktc-joborderform` → `portal.ktcterminal.com` (DNS on Vercel)
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`

## Messaging channels

- ✅ Email (Resend SMTP, domain `ktcterminal.com`) — confirm-signup, account-approved, password-reset all live

## Related

- [[Home]] · [[Current State]]

---

#memory #scale #metrics
