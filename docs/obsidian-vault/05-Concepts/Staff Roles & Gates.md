---
title: Staff Roles & Gates
tags: [concept, security, roles, rbac, administration]
type: concept
last_updated: 2026-06-22
---

# 👥 Staff Roles & Gates

The KTC admin portal runs on a **single owner-tunable permission matrix**, not hard-coded role checks. Every staff capability is a named permission; each role's grant of each permission lives in `role_permissions` and is editable by the owner in **Settings → Roles & Gates**.

## Roles

`customers.staff_role` ∈ `admin · operations · cashier · checker · csr · purchaser` (customers = `null`). Base set was `admin/cashier/checker` (`0035`); **operations** added (`0056`), **csr** added (`0086`), **purchaser** added (`0150`).

- **admin** — the full back office. Holds every gate **except `confirm_xray`** (dropped `0095`).
- **operations** — the terminal floor: accept orders, assess RPS, mark DEA/OOG done, **request** additional charges + **priority** + **re-X-ray**, monitor X-ray (no confirm); manage the vessel schedule; edit JO headers. (Completion is automatic — no manual click.) `/app/operations`.
- **cashier** — the **money lane only** (`0171`): review payments (online proof + walk-in), record the ERP invoice (**required before confirming a base payment**, `0177`), **bill requested charges** (`bill_supplement`, `0176`); edit JO headers. **No** accept / hold-reject / complete. `/app/cashier` station.
- **checker** — **X-ray entry confirmation** (BOC performs the X-ray; the checker confirms entry per van) + **request re-X-ray** on a completed order (`0175`). View only otherwise. `/app/checker`.
- **csr** — customer-service desk: file JOs for customers + work the support inbox + **review consignee requests** (`review_consignee_requests`, `0138`) + **request priority** (`0174`). **Never** changes order status (`0171` pulled accept/hold-reject back off CSR). `/app/support`. All customer comms funnel through CSR (operations lost `manage_support` in `0086`).
- **purchaser** *(DB only — frontend deferred)* — the **fuel desk** (procurement + fuel monitoring): non-admin, scoped, seeded with `view_fuel_reports` / `manage_fuel` / `log_fuel` only (`0135`/`0150`, [ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md)). The React app has **no `purchaser` handling yet** (no route/label/nav), so don't assign it until [[Pending Items|Fuel Phase 1]] wires it.
- **owner / root owner** — superset; bypasses **every** gate in `has_permission` (see [[Owner Failsafe]], [[Multi-Owner & Root Grants]]).

## Permission matrix (seeded defaults — owner can re-tune)

| permission | admin | operations | cashier | checker | csr |
|---|---|---|---|---|---|
| `view_job_orders` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `file_job_orders` | ✅ | — | — | — | ✅ |
| `process_job_orders` | ✅ | ✅ | — | — | — |
| `accept_orders` | ✅ | ✅ | — | — | — |
| `hold_reject_orders` | ✅ | ✅ | — | — | — |
| `complete_orders` | ✅ | ✅ | — | — | — |
| `confirm_xray` | — | — | — | ✅ | — |
| `request_priority` (`0174`) | ✅ | ✅ | — | — | ✅ |
| `approve_priority` (`0174`) | ✅ | — | — | — | — |
| `request_rexray` (`0175`) | ✅ | ✅ | — | ✅ | — |
| `approve_rexray` (`0175`) | ✅ | — | — | — | — |
| `request_supplement` (`0176`) | ✅ | ✅ | — | — | — |
| `bill_supplement` (`0176`) | ✅ | — | ✅ | — | — |
| `assess_rps` | ✅ | ✅ | — | — | — |
| `review_payments` | ✅ | — | ✅ | — | — |
| `record_invoice` | ✅ | — | ✅ | — | — |
| `manage_support` | ✅ | — | — | — | ✅ |
| `manage_vessel_schedule` | ✅ | ✅ | — | — | — |
| `manage_approvals` | ✅ | — | — | — | — |
| `manage_customers` | ✅ | — | — | — | — |
| `manage_consignees` | ✅ | — | — | — | — |
| `review_consignee_requests` | ✅ | — | — | — | ✅ |
| `manage_pricing` | ✅ | — | — | — | — |

(Owner = all. `manage_*` admin-desk gates omitted for the restricted roles above default false.)

**Fuel gates** (`0135`/`0150`, [ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md)) — `view_fuel_reports` · `manage_fuel` · `log_fuel`, seeded **on for `admin` + `purchaser`** only. Omitted from the table above (own module, not wired into the UI matrix yet).

## Split processing gates (`0086`)

The single `process_job_orders` gate was **split** for the explicit staff transitions so each stage is independently assignable:

- `accept_orders` — `submitted`/`on_hold` → `processing`
- `hold_reject_orders` — → `on_hold` / `rejected`
- `complete_orders` — → `completed`

`process_job_orders` **stays** for the internal service-done / requeue / archive paths. All explicit transitions are enforced server-side in **`staff_transition_order`** (`0086`/`0097`) — the old admin-only direct UPDATE on `job_orders` is gone.

**ADR-0035 separation of duties (`0171`) + auto-complete:** `hold_reject_orders` + `complete_orders` were **pulled off the cashier** (money lane only), and `accept_orders` + `hold_reject_orders` off **CSR** (intake only) — order approval stays operations/admin. **`complete_orders` is now rarely clicked** — completion **auto-fires** when the two gates clear (`complete_on_service_done` / `complete_on_payment_confirmed`). The six new **request → approve/bill** gates (`request_priority`/`approve_priority`, `request_rexray`/`approve_rexray`, `request_supplement`/`bill_supplement`) split *propose* from *decide* so a requester can never self-approve. See [[Job Order Lifecycle]] §D + [Role & Operation Flows](../../diagrams/role-and-operation-flows.md).

## How it's enforced

`has_permission(p)` (SECURITY DEFINER, `0035`) resolves the caller's role against `role_permissions`, **owner → always true**. It backs **RLS policies** (e.g. staff JO read) and is the gate inside every privileged **RPC** (`staff_transition_order`, `record_van_xray`, `record_service_done`, `record_rps_assessment`, `review_payment`/`record_office_payment`, `add_supplement`, `staff_edit_job_order`, support RPCs, …). Restricted roles are **NOT** `is_admin` — only `admin`/owner are.

## Landings

`RoleLanding` (`App.tsx`) routes each operational role to its **focused staff-PWA screen**: checker → `/app/checker`, operations → `/app/operations`, cashier → `/app/cashier`, csr → `/app/support`, admin/owner → `/admin` (the full back office is one tap away via "Open full portal"). The admin bottom-nav + [[Staff Notifications]] are permission-gated the same way. **`purchaser` has no landing/route yet** — it falls through to the default (the [[Pending Items|Fuel Phase 1]] wiring adds it).

## Related

- [[Administration]] · [[Authentication]] · [[Owner Failsafe]] · [[Multi-Owner & Root Grants]] · [[RLS Posture]]
- [[Two-Gate Completion]] · [[Job Order Lifecycle]] · [[Staff Notifications]]
- Migrations `0035` (matrix), `0056` (operations), `0062` (assess_rps), `0086` (csr + split gates), `0087`/`0095` (checker-only X-ray), `0097` (ops regains `process_job_orders`), `0138` (`review_consignee_requests`), `0135`/`0150` (fuel gates + `purchaser` role), `0171` (separation of duties — cashier money-only, CSR no approval), `0174`/`0175`/`0176` (priority / re-X-ray / charge request→approve gates)
