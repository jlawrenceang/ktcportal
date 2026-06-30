---
title: Additional-Charge Supplements
tags: [concept, job-orders, payments]
type: concept
last_updated: 2026-07-01
---

# Additional-Charge Supplements

> **Retired by ADR-0037 / v2.0.0.** The JO `jo_supplements` payment path, suffix lines (`JO-####-A/B/C`), `/job-order/:id/pay`, and `CashierStation` collection loop were replaced by the uniform `charges` / `payment_orders` spine. This page remains as history and a redirect for old links.

## Current model

- Every billable item is a row in `charges`: base X-ray (`service`), RPS (`rps`), add-on (`addon`), or release charge (`release`).
- Customer payment is per charge through `JobOrderCharges` inside My Job Orders, not through a separate JO pay page.
- Cashier collection happens through `PaymentOrderDesk`; charges can be bundled into one `payment_orders` collection with one OR.
- Add-ons keep maker-checker semantics through charge approval, not through `request_supplement` / `bill_supplement`.
- Completion no longer reads `jo_supplements`. It is one rule over services + billed `charges`; see [[Two-Gate Completion]].

## Current RPC surface

- `add_charge`
- `approve_charge`
- `record_charge_invoice`
- `submit_charge_payment`
- `confirm_charge_payment`
- `create_payment_order`
- `confirm_payment_order`
- `reverse_charge`

## Related

- [[Two-Gate Completion]] - [[Job Order Lifecycle]] - [[Cashier Station]] - [[Job Orders]]
- Runtime source: `src/lib/charges.ts`, `src/components/JobOrderCharges.tsx`, `src/admin/ChargeApproval.tsx`, `src/admin/PaymentOrderDesk.tsx`
- Cutover source: `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)`; migrations `0203`-`0222`