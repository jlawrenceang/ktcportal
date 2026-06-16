---
title: Two-Gate Completion
tags: [concept, job-orders, payments, invariant]
type: concept
last_updated: 2026-06-16
---

# ✅ Two-Gate Completion

A Job Order may only reach `completed` (and be released) when **both** the operations side **and** the money side are fully cleared. This is a hard server invariant — there is no staff button that can shortcut it.

## The readiness rule — `jo_ready_to_complete(jo)`

An order is "ready" when **ALL** hold (`0086` → `0097` → `0101`):

1. **Every service line is done** — `jo_all_services_done` (X-ray, incl. **every van**, plus DEA/OOG/other in `service_completions`).
2. **Base payment confirmed** — `payment_status = 'confirmed'`.
3. **RPS cleared** — `rps_status <> 'needed'` **OR** `rps_payment_status = 'confirmed'` (`0097` folded RPS into the gate — an unpaid RPS could previously slip through and show PAID on the verify QR).
4. **Every supplement paid** — no `jo_supplements` row with `payment_status <> 'confirmed'` (`0101`). See [[Additional-Charge Supplements]].

## How it fires (whoever does the last step trips it)

- **Services-last** → `record_service_done` / `record_van_xray` call `jo_ready_to_complete` after recording, and set `completed` if ready.
- **Payment-last** → the BEFORE-UPDATE trigger **`complete_on_payment_confirmed`** (on `payment_status, rps_payment_status`) flips `status` to `completed` + stamps `completed_at` in the same update when the last payment lands and services are done.
- **Supplement-last** → `review_supplement_payment` / `record_supplement_office_payment` re-complete an under-review order when the final charge clears.
- **Raw-update backstop** — `enforce_two_gate_complete` (BEFORE update) raises `check_violation` if anything sets `status='completed'` without readiness — closes the direct-write hole.
- **Manual** — `staff_transition_order(..., 'completed')` checks `complete_orders` **and** `jo_ready_to_complete`, else raises.

## Why it matters

The completed slip carries a PAID badge + a public **verify QR** ([[Verify-QR Anti-Forgery]]). If completion didn't require all payments, a guard scanning the QR could see "PAID/COMPLETED" on an order that still owes RPS or a supplement. The gate keeps the slip's claim true.

## Gotcha

The completion trigger is a **BEFORE UPDATE OF `payment_status`, `rps_payment_status`** trigger — touching only `has_open_supplement` (the `0104` denormalized flag) deliberately does **not** fire it (`sync_open_supplement` updates that column alone).

## Related

- [[Job Order Lifecycle]] · [[Additional-Charge Supplements]] · [[Verify-QR Anti-Forgery]] · [[Staff Roles & Gates]]
- [[Operational Invariants]]
- Migrations `0086` (initial two-gate), `0087` (per-van + auto-complete trigger), `0091` (office payment trips it), `0094` (backstop), `0096` (`completed_at` on payment path), `0097` (RPS folded in), `0101` (supplements folded in)
