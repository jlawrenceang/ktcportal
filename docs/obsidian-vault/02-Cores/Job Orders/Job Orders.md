---
title: Job Orders Core
tags: [core, job-orders, wave-1]
type: core
wave: 1
status: live
owner: Customer
last_updated: 2026-07-01
---

# Job Orders Core

> **Maturity:** LIVE - filing, gated processing, per-van X-ray, automatic completion, priority + re-X-ray lanes, charge/payment-order billing, verify QR.

## Purpose

The core transaction: a customer, or CSR/admin filing on behalf, files a Job Order requesting terminal services such as X-ray, DEA, or OOG against a consignee. It flows through operations/checker/cashier stations to a completed, paid, verifiable slip. Full state machine: [[Job Order Lifecycle]].

## Runtime routes

- `/job-order` - file a JO.
- `/job-orders` - customer order list; expands inline charge/payment detail through `JobOrderCharges`.
- `/job-order/:id/print` - A6 slip with verify QR.
- `/verify/:id` - public anti-forgery verify page.
- `/app/operations` / `/admin/job-orders` - staff queue, accept/hold/reject, service work, RPS assessment, priority/re-X-ray handling.
- `/app/checker` / `/admin/checker` - per-van X-ray confirmation.
- `/app/payment-orders` / `/admin/payment-orders` - cashier Payment Order desk.
- `/admin/charges` - add, approve, cancel/reverse, and audit charges.

Retired routes: `/job-order/:id/pay`, `/admin/cashier`, and `/app/cashier`.

## Model

- `job_orders` - header, lifecycle state, priority/re-X-ray fields, customer/consignee/vessel links.
- `job_order_lines` - per-container lines with service request and X-ray e-signature fields.
- `service_completions` - service-line completion records.
- `serving_numbers` - monthly `YYMM-XXXX` queue numbers with priority and re-X-ray lanes.
- `charges` - the live money spine for JO and release billables: service, RPS, add-on, and release charges.
- `payment_orders` - N:1 bundled collections for final-invoiced charges.
- `charge_audit` - charge/payment/change trail.

Retired for JO billing: `jo_supplements`, base `payment_status`, RPS payment status as separate payment truth, and the standalone JO pay page.

## Processing & completion

- **Gated transitions** use `staff_transition_order` with split gates `accept_orders` / `hold_reject_orders` / `complete_orders`. No admin-only direct update path.
- **Per-van X-ray** uses `record_van_xray`, gated by `confirm_xray` for checker only.
- **Priority + re-X-ray lanes** use request -> admin approval flows.
- **Completion is automatic** when all service lines are done and every billed, non-reversed charge is confirmed. See [[Two-Gate Completion]].

## Payments

ADR-0037 moved JO billing to the `charges` / `payment_orders` spine:

- Filing seeds the base service charge.
- RPS assessment seeds RPS charges.
- Staff add-ons become `charges` rows and use maker-checker approval when required.
- Each billed charge needs final ERP + BIR invoice details before confirmation.
- Customers submit proof per charge from My Job Orders.
- Cashier confirms charge proofs or bundles final charges into Payment Orders.

## Backend surface

Key RPCs: `staff_transition_order`, `record_van_xray`, `record_service_done`, `record_rps_assessment`, `add_charge`, `approve_charge`, `record_charge_invoice`, `submit_charge_payment`, `confirm_charge_payment`, `create_payment_order`, `confirm_payment_order`, `reverse_charge`, `request_priority`, `review_priority`, `request_rexray`, `review_rexray`, `staff_edit_job_order`, `verify_job_order`, `now_serving`, `assign_serving_numbers`, `add_jo_comment`, `add_jo_staff_note`, `flag_jo_comment`.

## Related

- [[Brokers]] - [[Consignees]] - [[Administration]]
- [[Job Order Lifecycle]] - [[Two-Gate Completion]] - [[Additional-Charge Supplements]] - [[Verify-QR Anti-Forgery]] - [[Comment Visibility & Escalation]] - [[Cashier Station]] - [[Staff Roles & Gates]]
- ADR-0035, ADR-0037, and `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)` for cutover proof.