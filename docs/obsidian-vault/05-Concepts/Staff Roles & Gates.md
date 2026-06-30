---
title: Staff Roles & Gates
tags: [concept, security, roles, rbac, administration]
type: concept
last_updated: 2026-07-01
---

# Staff Roles & Gates

The KTC admin portal runs on a single owner-tunable permission matrix. Runtime code and database RPCs are the source of truth; docs describe the production contract, and sandbox mirrors it through the same migrations.

## Roles

- **admin** - full back office, except `confirm_xray`.
- **operations** - `/app/operations`; accepts/holds/rejects orders, assesses RPS, marks services done, monitors X-ray, requests priority/re-X-ray, manages vessel schedule, and adds operational charges where permitted.
- **cashier** - `/app/payment-orders`; money-only lane: record charge invoices, confirm/reject charge proofs, bundle/collect Payment Orders, and handle release payment/OR work. No accept/hold/reject/complete/X-ray power.
- **checker** - `/app/checker`; confirms X-ray per van and may request re-X-ray.
- **csr** - `/app/support`; support, file-on-behalf, consignee requests, priority requests, and release document checks where gated.
- **purchaser** - DB-only fuel role; no live frontend route yet.
- **owner/root owner** - failsafe superset through `has_permission`.

## Current key gates

| Capability | Main gate |
|---|---|
| View job orders | `view_job_orders` |
| File on behalf | `file_job_orders` |
| Accept order | `accept_orders` |
| Hold/reject order | `hold_reject_orders` |
| Service done / internal service work | `process_job_orders` |
| X-ray confirmation | `confirm_xray` |
| RPS assessment | `assess_rps` |
| Charge proof / Payment Order collection | `review_payments` |
| Final ERP + BIR invoice on a charge | `record_invoice` |
| Priority request / approval | `request_priority` / `approve_priority` |
| Re-X-ray request / approval | `request_rexray` / `approve_rexray` |
| Release document desk | `verify_release_docs` |
| Support inbox | `manage_support` |
| Owner/admin settings | `manage_*` gates |

Legacy `request_supplement` / `bill_supplement` names may still appear in older history, but JO billing now uses the `charges` RPCs documented by the ADR-0037 charge RPCs.

## Charge gates after ADR-0037

| Charge action | RPC | Gate |
|---|---|---|
| Add service/RPS/add-on charge | `add_charge` | admin or allowed operational gates |
| Approve proposed add-on | `approve_charge` | admin or maker-checker approval gates |
| Record final ERP + BIR invoice | `record_charge_invoice` | `record_invoice` |
| Customer submits proof | `submit_charge_payment` | owning customer |
| Confirm/reject proof | `confirm_charge_payment` | `review_payments` |
| Bundle Payment Order | `create_payment_order` | `review_payments` |
| Collect Payment Order | `confirm_payment_order` | `review_payments` |
| Reverse confirmed charge | `reverse_charge` | owner/admin only |

## Landings

`RoleLanding` routes operational roles to the focused staff app:

- checker -> `/app/checker`
- operations -> `/app/operations`
- cashier -> `/app/payment-orders`
- csr -> `/app/support`
- admin/owner -> `/admin`

## Enforcement

`has_permission(p)` backs RLS policies and privileged RPCs. UI route gating only mirrors the server. Restricted roles are not `is_admin`; only admin/owner get admin-level behavior.

## Related

- [[Administration]] - [[Authentication]] - [[Owner Failsafe]] - [[Multi-Owner & Root Grants]] - [[RLS Posture]]
- `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)` for charge-cutover gates.