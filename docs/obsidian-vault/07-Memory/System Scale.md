---
title: System Scale
tags: [memory, scale, metrics]
type: memory
last_updated: 2026-07-01
---

# System Scale

Production is the runtime contract. Sandbox mirrors the same migrations/schema/functions for test execution, but keeps separate environment variables, secrets, and seed data.

## Code

| Metric | Current |
|---|---|
| App version | `src/version.ts` = `v2.0.11`; latest runtime checkpoint documented as `v2.0.11+` by commit `830bd2a` |
| Migrations | `0001_init` through `0236_trusted_mfa_sessions`, applied on KTC prod. Recent active spine: ADR-0037 charge/payment-order cutover (`0203`-`0222`), hardening `0228`-`0236`, native push scaffold `0232`, bulletin/tariff/email/trusted-MFA hardening `0233`-`0236`. |
| Core tables | `customers`, `consignees`, `job_orders`, `job_order_lines`, `service_completions`, `serving_numbers`, `charges`, `payment_orders`, `charge_audit`, `release_orders`, `release_supplements`, `support_tickets`, `staff_notifications`, `role_permissions`, pricing/tariff tables, security/audit tables, dormant fuel tables. |
| Job-order statuses | `submitted`, `processing`, `on_hold`, `completed`, `rejected`, `cancelled`. `held` is legacy; pending customers are verify-only. |
| Billing model | ADR-0037 `charges` / `payment_orders` spine. Retired for JO billing: `/job-order/:id/pay`, `/admin/cashier`, `/app/cashier`, `jo_supplements`, and old base/RPS/supplement payment columns as payment truth. |
| Staff roles | owner/root owner, admin, operations, cashier, checker, csr, purchaser. Cashier lands on `/app/payment-orders`; checker on `/app/checker`; operations on `/app/operations`; csr on `/app/support`; admin/owner on `/admin`. |
| Routes | public `/`, `/verify/:id`; customer `/account`, `/job-order`, `/job-orders`, `/job-order/:id/print`, `/calculator`, `/vessels`, `/releases`, `/requests`, `/support`, `/manual`, `/verify-id`, `/agreement`; staff app `/app`, `/app/device`, `/app/checker`, `/app/payment-orders`, `/app/support`, `/app/operations`; admin `/admin`, `/admin/approvals`, `/admin/customers[/:id]`, `/admin/consignees`, `/admin/job-orders`, `/admin/new-job-order`, `/admin/checker`, `/admin/payment-orders`, `/admin/charges`, `/admin/reconciliation`, `/admin/charge-audit`, `/admin/releases`, `/admin/vessel-schedule`, `/admin/support`, `/admin/logs`, `/admin/security`, `/admin/settings`, `/admin/manual`. |
| ADRs | `docs/adr/` through ADR-0037. |
| Current manual smoke | `docs/smoke-test-08-go-live.md` for v2.0.11+ / migration 0236. ST05/ST06/ST07 are closed legacy stubs. |

## Data

| Metric | Current |
|---|---|
| Consignees imported | 2,488 from `Customer.csv` |
| Owner account | `jlawrenceang@gmail.com`, root owner, 2FA/failsafe |
| Staff accounts | Created on demand via Settings |

## Stack

- Vite + React 18 + TypeScript + Tailwind 3 + react-router-dom 6 + `@supabase/supabase-js` 2.
- Supabase project `mdlnfhyylvapzdubhyic` for KTC prod.
- E2E sandbox ref `zwvzadkgeyhkhyshkwhc` for isolated test execution.
- Vercel project `ktc-joborderform` -> `portal.ktcterminal.com`.
