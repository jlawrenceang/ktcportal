---
title: Job Order Lifecycle
tags: [workflow, job-orders, lifecycle]
type: workflow
status: live
last_updated: 2026-07-01
---

# Job Order Lifecycle

Production is the contract source for this workflow. Sandbox/test builds must mirror this schema and behavior through the same migration set, with separate env vars, secrets, and seed data.

## Actors

- **Customer** - files and tracks approved-account Job Orders, pays billed charges, comments, prints slips.
- **Operations** - accepts orders, holds/rejects, assesses RPS, marks DEA/OOG done, monitors X-ray, requests priority/re-X-ray, and adds operational charges where permitted.
- **Checker** - confirms X-ray per van through `record_van_xray`.
- **Cashier** - records final charge invoices, reviews charge proofs, bundles/collects Payment Orders, and handles release payment/OR work.
- **CSR** - files on behalf, handles support, consignee requests, priority requests, and release document checks where gated.
- **Admin/owner** - full back office; owner has the failsafe bypass.

## Customer approval prerequisite

Pending customers are verify-only. They can upload ID, see status, use the allowed support/account surfaces, and sign out; they cannot file or hold Job Orders. Rejected verification can be resubmitted. Suspended accounts are locked pending KTC staff/customer-service intervention.

## States

| State | Meaning |
|---|---|
| `submitted` | Live in the operations queue; JO number exists. |
| `processing` | Accepted/being worked. |
| `on_hold` | Staff needs correction; customer responds through the field-targeted hold path. |
| `completed` | Services done and every billed charge settled. |
| `rejected` | Terminal staff rejection. |
| `cancelled` | Customer/staff/system cancellation. |

`held` is legacy. Pending customers no longer file held orders.

## Transitions

Explicit staff status changes go through `staff_transition_order` with split gates:

- `accept_orders` - `submitted`/`on_hold` -> `processing`.
- `hold_reject_orders` - open orders -> `on_hold` or `rejected`.
- `complete_orders` - ready-state fallback only; normal completion is automatic.

Customer hold response uses the field-targeted resubmit path. Customer cancel is blocked once the order is past the allowed early states or charge/payment state makes cancellation unsafe.

## Numbering and lanes

- JO number is permanent identity.
- Serving numbers reset monthly as `YYMM-XXXX`, with priority and re-X-ray lanes.
- Priority and re-X-ray are request -> admin approval flows.

## Services and X-ray

- X-ray is confirmed per van through `record_van_xray`, gated by `confirm_xray` for checker only.
- DEA/OOG/other service completion is gated by `process_job_orders`.
- The last service action re-checks completion readiness.

## Billing and payment

ADR-0037 replaced the old base/RPS/supplement pay page with the `charges` / `payment_orders` spine.

- Filing seeds the base service charge.
- RPS assessment seeds RPS charges.
- Add-ons are charge rows, with maker-checker approval where required.
- Each billed charge needs final ERP + BIR invoice details before confirmation.
- Customers pay per charge from My Job Orders (`JobOrderCharges`).
- Cashier works `/admin/payment-orders` or `/app/payment-orders`, not `/admin/cashier`.
- Payment Orders bundle final-invoiced charges for collection under one OR.

Retired for JO billing: `/job-order/:id/pay`, `/admin/cashier`, `/app/cashier`, `jo_supplements`, `review_supplement_payment`, `record_supplement_office_payment`, and the old base/RPS payment columns as payment truth.

## Completion gate

See [[Two-Gate Completion]]. A JO completes only when:

1. every service line is done, including every X-ray van; and
2. every billed, non-reversed charge for the JO is confirmed.

Free re-X-ray children complete on services-done alone. Billable re-X-ray children must clear the charge gate.

## Verify QR

Every slip carries a QR to `/verify/:id`. The live verify result reads the current order and charge state; paper text is not trusted. See [[Verify-QR Anti-Forgery]].

## Related

- [[Job Orders]] - [[Administration]] - [[Brokers]] - [[Current State]]
- [[Staff Roles & Gates]] - [[Two-Gate Completion]] - [[Additional-Charge Supplements]] - [[Verify-QR Anti-Forgery]] - [[Comment Visibility & Escalation]]
- ADR-0035, ADR-0037, `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)`, `docs/smoke-test-08-go-live.md`