---
title: Staff Roles & Gates
tags: [concept, security, roles, rbac, administration]
type: concept
last_updated: 2026-06-16
---

# 👥 Staff Roles & Gates

The KTC admin portal runs on a **single owner-tunable permission matrix**, not hard-coded role checks. Every staff capability is a named permission; each role's grant of each permission lives in `role_permissions` and is editable by the owner in **Settings → Roles & Gates**.

## Roles

`customers.staff_role` ∈ `admin · operations · cashier · checker · csr` (customers = `null`). Base set was `admin/cashier/checker` (`0035`); **operations** added (`0056`), **csr** added (`0086`).

- **admin** — the full back office. Holds every gate **except `confirm_xray`** (dropped `0095`).
- **operations** — the terminal floor: accept orders, assess RPS, mark DEA/OOG done, tag additional charges, monitor X-ray (no confirm), complete; manage the vessel schedule; edit JO headers.
- **cashier** — the money desk: review payments (online proof + walk-in), record the ERP invoice, complete once paid, hold/reject; edit JO headers. `/admin/cashier` station.
- **checker** — **X-ray entry confirmation only** (BOC performs the X-ray; the checker confirms entry per van). View only otherwise. `/admin/checker`.
- **csr** — customer-service desk: file JOs for customers + work the support inbox. **Never** changes order status. `/admin/support`. All customer comms funnel through CSR (operations lost `manage_support` in `0086`).
- **owner / root owner** — superset; bypasses **every** gate in `has_permission` (see [[Owner Failsafe]], [[Multi-Owner & Root Grants]]).

## Permission matrix (seeded defaults — owner can re-tune)

| permission | admin | operations | cashier | checker | csr |
|---|---|---|---|---|---|
| `view_job_orders` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `file_job_orders` | ✅ | ✅ | — | — | ✅ |
| `process_job_orders` | ✅ | ✅ | — | — | — |
| `accept_orders` | ✅ | ✅ | — | — | — |
| `hold_reject_orders` | ✅ | ✅ | ✅ | — | — |
| `complete_orders` | ✅ | ✅ | ✅ | — | — |
| `confirm_xray` | — | — | — | ✅ | — |
| `assess_rps` | ✅ | ✅ | — | — | — |
| `review_payments` | ✅ | — | ✅ | — | — |
| `record_invoice` | ✅ | — | ✅ | — | — |
| `manage_support` | ✅ | — | — | — | ✅ |
| `manage_vessel_schedule` | ✅ | ✅ | — | — | — |
| `manage_approvals` | ✅ | — | — | — | — |
| `manage_customers` | ✅ | — | — | — | — |
| `manage_consignees` | ✅ | — | — | — | — |
| `manage_pricing` | ✅ | — | — | — | — |

(Owner = all. `manage_*` admin-desk gates omitted for the restricted roles above default false.)

## Split processing gates (`0086`)

The single `process_job_orders` gate was **split** for the explicit staff transitions so each stage is independently assignable:

- `accept_orders` — `submitted`/`on_hold` → `processing`
- `hold_reject_orders` — → `on_hold` / `rejected`
- `complete_orders` — → `completed`

`process_job_orders` **stays** for the internal service-done / requeue / archive paths. All explicit transitions are enforced server-side in **`staff_transition_order`** (`0086`/`0097`) — the old admin-only direct UPDATE on `job_orders` is gone.

## How it's enforced

`has_permission(p)` (SECURITY DEFINER, `0035`) resolves the caller's role against `role_permissions`, **owner → always true**. It backs **RLS policies** (e.g. staff JO read) and is the gate inside every privileged **RPC** (`staff_transition_order`, `record_van_xray`, `record_service_done`, `record_rps_assessment`, `review_payment`/`record_office_payment`, `add_supplement`, `staff_edit_job_order`, support RPCs, …). Restricted roles are **NOT** `is_admin` — only `admin`/owner are.

## Landings

`RoleLanding` (`App.tsx`) routes by role: checker → `/admin/checker`, operations → `/admin/job-orders`, cashier → `/admin/cashier`, csr → `/admin/support`, admin/owner → `/admin`. The admin bottom-nav + [[Staff Notifications]] are permission-gated the same way.

## Related

- [[Administration]] · [[Authentication]] · [[Owner Failsafe]] · [[Multi-Owner & Root Grants]] · [[RLS Posture]]
- [[Two-Gate Completion]] · [[Job Order Lifecycle]] · [[Staff Notifications]]
- Migrations `0035` (matrix), `0056` (operations), `0062` (assess_rps), `0086` (csr + split gates), `0087`/`0095` (checker-only X-ray), `0097` (ops regains `process_job_orders`)
