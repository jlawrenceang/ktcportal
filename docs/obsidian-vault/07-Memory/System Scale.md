---
title: System Scale
tags: [memory, scale, metrics]
type: memory
last_updated: 2026-06-16
---

# 📏 System Scale

## Code

| Metric | Count |
|--------|-------|
| App version | `src/version.ts`; footers show version + git commit + build date (main @ `1b2e824`) |
| Migrations | **104** (`0001_init` … `0104_open_supplement_flag`) — all applied + tracked in `public._migrations` (runner applies only new files) |
| Core tables | `customers` (renamed from `brokers`, 0021), `consignees`, `accreditations`, `job_orders`, `job_order_lines` (+ per-van `xray_done_*`), `service_completions`, `serving_numbers`, `jo_supplements` (0101), `rps_moves`/`move_rates` (0062), `job_order_events`/`job_order_documents` (timeline), `support_tickets`/`support_messages` (0083), `staff_notifications`/`_reads` (0085), `role_permissions`, `terminal_rates`/`shipping_line_charge_rules` (0073/0080) + ops tables (`service_rates`, `pricing_settings`, `security_events`, `app_errors`, `outbound_requests`) |
| Job-order statuses | `held` · `submitted` · `processing` · `on_hold` · `completed` · `rejected` · `cancelled` ("under review" = completed bounced back by a supplement). Base + supplement payment: `unpaid`/`submitted`/`confirmed`/`rejected`; RPS: `not_assessed`/`not_needed`/`needed` + own payment status; invoice chip PAID (`OR-INV-`) / BILLED (`BI-INV-`) |
| Staff roles | **owner / root owner · admin · operations · cashier · checker · csr**, gated by the owner-tunable `role_permissions` matrix (`has_permission`; owner bypasses all). Split JO gates `accept_orders`/`hold_reject_orders`/`complete_orders`; X-ray confirm = checker only. TOTP 2FA for admin/owner (aal2). See [[Staff Roles & Gates]]. |
| Routes | customer (`/`, `/account`, `/job-order`, `/job-order/:id/print`, `/job-order/:id/pay`, `/job-orders`, `/calculator`, `/vessels`, `/support`, `/manual`, `/verify-id`, `/agreement`) + **public** `/verify/:id` + auth (`/login`, `/confirmed`, `/forgot-password`, `/reset-password`) + admin (`/admin`, `/admin/approvals`, `/admin/customers[/:id]`, `/admin/consignees`, `/admin/job-orders`, `/admin/new-job-order`, `/admin/checker`, `/admin/cashier`, `/admin/vessel-schedule`, `/admin/support`, `/admin/logs`, `/admin/security`, `/admin/settings`, `/admin/manual`). Old `/irr` `/terms` `/privacy` → `/agreement`. |
| ADRs | `docs/adr/` — 0001–0015 |
| Automated tests | **Playwright 16/16** — 11 Phase 1 unauth smoke + 5 Phase 2 authenticated lanes vs the dedicated test project (`zwvzadkgeyhkhyshkwhc`, ADR-0010); 4 mutation lanes remain `fixme`. No Vitest unit suite. |
| pg_cron jobs | **6** — `expire-unverified-brokers` (hourly), `boc-mirror-hourly`, `ops-watchdog` (15 min), `purge-expired-ids` (hourly), `archive-done-orders-weekly`, `requeue-carryovers-weekly` (Mon 00:15 PH) |
| Storage buckets | `valid-ids` (24h-guaranteed / 3-day purge), `payment-slips`, consignee 2303 docs |

## Data

| Metric | Count |
|--------|-------|
| Consignees imported | **2,488** (from `Customer.csv`) |
| Job orders / customers | **0 / 0** — prod wiped clean 2026-06-12 (session 10p) for go-live; first real order = `JO-000001` |
| Owner accounts | 1 (`jlawrenceang@gmail.com`, 2FA) + `jla.ktcport@gmail.com` as plain admin fallback |
| Staff accounts | created on demand via Settings |

## Stack

- Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom 6 + `@supabase/supabase-js` 2 (SPA, visionOS theme layer)
- Supabase (Auth + Postgres + RLS + Storage + pg_cron/pg_net + Vault) — project `mdlnfhyylvapzdubhyic`
- Cloudflare Turnstile CAPTCHA (server-verified)

## Hosting

- Vercel project `ktc-joborderform` → `portal.ktcterminal.com` (DNS on Vercel)
- `vercel.json` ships full security headers (CSP, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy)
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`

## Messaging channels

- ✅ Email (Resend, domain `ktcterminal.com`) — confirm-signup, account-approved, on-hold/rejected, payment-rejected, password-reset, watchdog alerts

## Related

- [[Home]] · [[Current State]]

---

#memory #scale #metrics
