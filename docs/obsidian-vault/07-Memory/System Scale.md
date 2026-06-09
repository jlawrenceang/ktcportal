---
title: System Scale
tags: [memory, scale, metrics]
type: memory
last_updated: 2026-06-07
---

# 📏 System Scale

## Code

| Metric | Count |
|--------|-------|
| Migrations | **12** (`0001_init` … `0012_broker_consents`; 0011 + 0012 pending apply to KTC DB) |
| Core tables | 5 (`brokers`, `consignees`, `accreditations`, `job_orders`, `job_order_lines`) |
| SECURITY DEFINER RPCs | `create_staff` (+ defaults/triggers per migration) |
| Storage buckets | `valid-ids` (broker IDs) + consignee 2303 docs |
| Routes | broker (`/`, `/job-order`, `/job-orders`, `/agreement`) + `/accreditation` (notice) + admin (`/admin`, `/admin/approvals`, `/admin/brokers`, `/admin/consignees`, `/admin/job-orders`, `/admin/settings`) + `/login`. Old `/irr` `/terms` `/privacy` redirect → `/agreement`. |
| ADRs | **11** (`docs/adr/` — 0001–0011, all Accepted) |
| Automated tests | **10 Playwright** Phase 1 (unauth smoke, passing) + Phase 2 auth harness (6 role/surface + 4 `fixme`, runs when `E2E_*` set — service-role minting, ADR-0010). No Vitest unit suite. |

## Data

| Metric | Count |
|--------|-------|
| Consignees imported | **2,488** (from `Customer.csv`) |
| Owner accounts | 1 (`jla.ktcport@gmail.com`) |
| Staff accounts | created on demand via Settings |

## Stack

- Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom 6 + `@supabase/supabase-js` 2 (SPA)
- Supabase (Auth + Postgres + RLS + Storage) — project `mdlnfhyylvapzdubhyic`
- Cloudflare Turnstile CAPTCHA (server-verified)

## Hosting

- Vercel project `ktc-joborderform` → `portal.ktcterminal.com` (DNS on Vercel)
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`

## Messaging channels

- ⚠️ Email (Resend SMTP) — deferred to go-live

## Related

- [[Home]] · [[Current State]]

---

#memory #scale #metrics
