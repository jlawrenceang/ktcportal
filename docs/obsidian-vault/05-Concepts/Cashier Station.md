---
title: Cashier Station
tags: [concept, payments, cashier, administration]
type: concept
last_updated: 2026-07-01
---

# Cashier Station

> **Retired by ADR-0037 / v2.0.0.** The old `CashierStation` routes (`/admin/cashier`, `/app/cashier`) and the customer `/job-order/:id/pay` page were deleted in the charges cutover. Current cashier work happens in **Payment Order Desk** (`/admin/payment-orders`, `/app/payment-orders`) plus the charge admin surface (`/admin/charges`).

## Current cashier workflow

- **Record final charge invoices** - `record_charge_invoice` writes the final ERP + BIR invoice details on each `charges` row. Gate: `record_invoice`.
- **Confirm or reject charge proofs** - `confirm_charge_payment` acts on per-charge proof submissions. Gate: `review_payments`.
- **Bundle charges into Payment Orders** - `create_payment_order` bundles final-invoiced charges for one customer/consignee. Gate: `review_payments`.
- **Collect a Payment Order** - `confirm_payment_order` records the single collection OR for the bundle. Gate: `review_payments`.
- **Handle release payments** - release-desk payment and OR actions still use the release-specific RPCs and gates documented in the release smoke lanes.

## Gates

Cashier remains **money-only**. It has `review_payments` and `record_invoice`, but not `accept_orders`, `hold_reject_orders`, `complete_orders`, or `confirm_xray`. Completion is automatic when [[Two-Gate Completion]] sees every billed charge confirmed.

## Related

- [[Administration]] - [[Two-Gate Completion]] - [[Additional-Charge Supplements]] - [[Staff Roles & Gates]] - [[Job Order Lifecycle]]
- Runtime source: `src/admin/PaymentOrderDesk.tsx`, `src/admin/ChargeApproval.tsx`, `src/components/JobOrderCharges.tsx`
- Cutover source: `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)`; migrations `0203`-`0222`