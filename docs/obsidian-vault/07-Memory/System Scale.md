---
title: System Scale
tags: [memory, scale, metrics]
type: memory
last_updated: 2026-06-26
---

# 📏 System Scale

## Code

| Metric | Count |
|--------|-------|
| App version | `src/version.ts` = **`v1.6.31`** (live on `portal.ktcterminal.com`). Footers show version + git commit + build date |
| Migrations | **155 files**, `0001_init` … **`0164_block_disposable_email_domains`** — all applied + tracked in `public._migrations`. Numbering is split across a **portal lane** and a **fuel lane** (fuel = `0135`/`0140`/`0150`), so there are gaps; the portal lane now runs contiguously through `0164`. Latest run (`0160`–`0164`): public `support_contact` SELECT (`0160`), Google-OAuth finish-registration (`0161`), consent enforcement (`0162`), pending verify-only lockdown (`0163`), disposable-email block (`0164`) |
| Core tables | `customers` (renamed from `brokers`, 0021), `consignees` (+ request cols `requested_by/at`, `note`, `doc_2307_path`, `needs_info` status — 0132/0138/0139), `accreditations`, `release_orders`/`release_supplements` (0124/0125), `job_orders` (+ `needs_fields` field-targeted on-hold, 0154), `job_order_lines` (+ per-van `xray_done_*`, + `size`/`fill`/`kind` 0141), `service_completions`, `serving_numbers`, `jo_supplements` (0101), `additional_charge_types` (admin-seeded charge dropdown, 0155), `rps_moves`/`move_rates` (0062), `job_order_events`/`job_order_documents` (timeline), `support_tickets`/`support_messages` (0083), `staff_notifications`/`_reads` (0085), `role_permissions`, `terminal_rates` (× fill/kind, 0141) + `terminal_rate_config` (per-service granularity, 0157) + `storage_tiers` (tiered foreign storage, 0157) / `shipping_line_charge_rules` (0073/0080) + ops tables (`service_rates`, `pricing_settings`, `security_events`, `app_errors`, `outbound_requests`, `disposable_email_domains` (7,578-row signup blocklist, 0164); `customers` consent columns are server-stamped only, 0162) · **Fuel module (0135, backend only):** `equipment`, `fuel_dispense`, `fuel_delivery`, `fuel_rates`, `fuel_settings`, `fuel_tank_reading`, `move_tally` + 7 derived views |
| Job-order statuses | `held` · `submitted` · `processing` · `on_hold` (now **field-targeted** via `needs_fields`, 0154) · `completed` · `rejected` (**terminal** — no resubmit, 0154) · `cancelled` ("under review" = completed bounced back by a supplement). Base + supplement payment unified into one **Balance/Paid** pill (`unpaid`/`submitted`/`confirmed`/`rejected`); RPS: `not_assessed`/`not_needed`/`needed` + own payment status; invoice chip PAID (`OR-INV-`) / BILLED (`BI-INV-`). Rejecting a consignee (0152) / suspending or rejecting a customer (0153) cancels open JOs **except** paid/invoiced |
| Staff roles | **owner / root owner · admin · operations · cashier · checker · csr · purchaser**, gated by the owner-tunable `role_permissions` matrix (`has_permission`; owner bypasses all). `purchaser` (0150) = the non-admin **fuel desk** (`view_fuel_reports`/`manage_fuel`/`log_fuel`) — **DB only, no frontend yet**. Split JO gates `accept_orders`/`hold_reject_orders`/`complete_orders`; X-ray confirm = checker only. TOTP 2FA for admin/owner (aal2). See [[Staff Roles & Gates]]. |
| Routes | **public** `/` (signed-out **Landing**; signed-in → role landing via `RootGate`) + customer (`/account`, `/job-order`, `/job-order/:id/print`, `/job-order/:id/pay`, `/job-orders`, `/calculator`, `/vessels`, `/releases`, `/requests` (My Requests), `/support`, `/manual`, `/verify-id`, `/agreement`; **Lara** chat widget = component, no route) + **public** `/verify/:id` + auth (`/login` incl. **Continue with Google** + `FinishRegistration` gate, `/register`, `/confirmed`, `/forgot-password`, `/reset-password`) + mobile staff shell (`/app`, `/app/checker`, `/app/cashier`, `/app/support`, `/app/operations`) + admin (`/admin`, `/admin/approvals`, `/admin/customers[/:id]`, `/admin/consignees`, `/admin/job-orders`, `/admin/new-job-order`, `/admin/checker`, `/admin/cashier`, `/admin/releases`, `/admin/vessel-schedule`, `/admin/bulletin`, `/admin/support`, `/admin/logs`, `/admin/security`, `/admin/settings`, `/admin/manual`). Old `/irr` `/terms` `/privacy` → `/agreement`. **Fuel routes (`/admin/fuel`, `/app/fuel`) not built — deferred.** |
| ADRs | `docs/adr/` — 0001–**0029** (latest: 0027 per-service rates + tiered foreign storage, 0028 rename brokers→customers single-pool, 0029 customer self-service requests + consignee CIS) |
| Automated tests | **Playwright 16/16** — 11 Phase 1 unauth smoke + 5 Phase 2 authenticated lanes vs the dedicated test project (`zwvzadkgeyhkhyshkwhc`, ADR-0010); 4 mutation lanes remain `fixme`. No Vitest unit suite. |
| pg_cron jobs | **6** — `expire-unverified-brokers` (hourly), `boc-mirror-hourly`, `ops-watchdog` (15 min), `purge-expired-ids` (hourly), `archive-done-orders-weekly`, `requeue-carryovers-weekly` (Mon 00:15 PH) |
| Storage buckets | `valid-ids` (24h-guaranteed / 3-day purge), `payment-slips`, consignee 2303 docs |

## Data

| Metric | Count |
|--------|-------|
| Consignees imported | **2,488** (from `Customer.csv`) |
| Job orders / customers / releases | **0 / 0 / 0** — prod test data purged to a clean slate 2026-06-23; `jo_number_seq` reset so the first real order = `JO-000001` |
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
