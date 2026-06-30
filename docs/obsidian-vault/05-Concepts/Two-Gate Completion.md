---
title: Two-Gate Completion
tags: [concept, job-orders, payments, invariant]
type: concept
last_updated: 2026-07-01
---

# Two-Gate Completion

A Job Order may only reach `completed` when the operations side and the money side are fully cleared. This is a hard server invariant; no staff button can shortcut it.

## The readiness rule - `jo_ready_to_complete(jo)`

An order is ready when both hold:

1. **Every service line is done** - `jo_all_services_done` covers X-ray, including every van, plus DEA/OOG/other rows in `service_completions`.
2. **Every billed charge is confirmed** - all billed, non-reversed `charges` rows for the JO are settled. The old base/RPS/supplement columns are retired from the completion rule; base X-ray, RPS, and add-ons are all charge rows after ADR-0037.

**Re-X-ray exemption:** a free re-X-ray child (`is_rexray AND NOT rexray_billable`) completes on services-done alone. A billable re-X-ray still runs the charge gate.

## How it fires

- **Services-last** - `record_service_done` / `record_van_xray` call `jo_ready_to_complete` after recording, and set `completed` if ready.
- **Payment-last** - charge confirmation/payment-order collection paths call the same readiness rule; when the final billed charge clears and services are done, the JO completes.
- **Raw-update backstop** - `enforce_two_gate_complete` raises if anything sets `status='completed'` without readiness.
- **Manual fallback** - `staff_transition_order(..., 'completed')` checks `complete_orders` and `jo_ready_to_complete`, else raises. In normal use, auto-complete wins first.

## Why it matters

The completed slip carries a PAID badge and a public verify QR ([[Verify-QR Anti-Forgery]]). If completion did not require every billed charge, a guard scanning the QR could see "PAID/COMPLETED" on an order that still owes money. The gate keeps the slip's claim true.

## Gotcha

The old `payment_status` / `rps_payment_status` / `jo_supplements` trigger path is retired. Post-cutover, use `charges` as the authoritative payment state.

## Related

- [[Job Order Lifecycle]] - [[Additional-Charge Supplements]] - [[Verify-QR Anti-Forgery]] - [[Staff Roles & Gates]]
- [[Operational Invariants]]
- Key cutover migration: `0216` (completion reads the `charges` spine). See `docs/smoke-test-06-portal.md (closed legacy ADR-0037 proof)` for the executable cutover proof.