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
| Migrations | **10** (`0001_init` … `0010_create_staff`) |
| Core tables | 5 (`brokers`, `consignees`, `accreditations`, `job_orders`, `job_order_lines`) |
| SECURITY DEFINER RPCs | `create_staff` (+ defaults/triggers per migration) |
| Storage buckets | `valid-ids` (broker IDs) + consignee 2303 docs |
| Routes | broker (`/`, `/job-order`, `/accreditation`, `/job-orders`) + admin (`/admin`, `/admin/approvals`, `/admin/brokers`, `/admin/consignees`, `/admin/job-orders`, `/admin/settings`) + `/login` |
| ADRs | **6** (`docs/adr/` — 0001–0006, all Accepted) |
| Automated tests | **8 Playwright** (Phase 1 unauth smoke, passing) + 5 `test.fixme` (Phase 2, blocked on CAPTCHA-free env). No Vitest unit suite. |

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
