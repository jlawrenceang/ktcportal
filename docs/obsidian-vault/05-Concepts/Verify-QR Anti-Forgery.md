---
title: Verify-QR Anti-Forgery
tags: [concept, job-orders, security, verification]
type: concept
last_updated: 2026-06-16
---

# 🔎 Verify-QR Anti-Forgery

The printed Job-Order slip is a paper document that leaves the building (with the broker, BOC, a terminal guard). To stop a forged or doctored slip from passing as a genuine paid/completed order, **the scan is the proof — not the ink**. Built across `0089` / `0090` / `0097`.

## How it works

- Every slip (`/job-order/:id/print`) carries a **QR → `/verify/:id`**, where `id` is the order's **UUID** (unguessable; only printed on the slip).
- `/verify/:id` is a **public** route (no login) that calls the anon SECURITY DEFINER RPC **`verify_job_order(id)`**.
- The RPC returns only **minimal, non-sensitive, LIVE** facts: `jo_number`, `status`, `payment_status` (+ `rps_status`/`rps_payment_status` from `0097`), `completed_at`, `consignee`, and the **container numbers**.
- The slip's "PENDING / COMPLETED" watermark and PAID text are **cosmetic** — an edited image can't fake the live state the scan returns.

## The two attacks it defeats

1. **Doctored slip** (faked status/paid) → the QR resolves to the order's real, live status. Caught.
2. **Copied QR** (a genuine paid order's QR pasted onto a fake slip) → the verify page shows that order's real **consignee + container numbers**, which the verifier matches against the physical slip and the containers in hand. A copied QR resolves to *someone else's* details. Caught.

## PAID badge truth

The PAID badge on the verify page reflects base **and** RPS payment (`0097`), and completion requires every payment cleared ([[Two-Gate Completion]]) — so a "COMPLETED + PAID" verify result is always genuine, never an order that still owes RPS or a supplement.

## Future

The same QR/verify foundation is the entry point for a future **guard gate-scan**: a guard scanning at the gate could log gate-in / gate-out (`gate_events`) from a verify screen. See [[Gate Module (gate-in-out)]] (deferred, `09-Future`).

## Related

- [[Job Order Lifecycle]] · [[Two-Gate Completion]] · [[Job Orders]] · [[Gate Module (gate-in-out)]]
- Migrations `0089` (verify RPC + QR), `0090` (payment status + containers), `0097` (RPS state on verify)
