---
title: Verify-QR Anti-Forgery
tags: [concept, job-orders, security, verification]
type: concept
last_updated: 2026-07-01
---

# Verify-QR Anti-Forgery

The printed Job Order slip is a paper document that leaves the building. The QR scan is the proof, not the ink.

## How it works

- Every slip (`/job-order/:id/print`) carries a QR to `/verify/:id`, where `id` is the order UUID.
- `/verify/:id` is public and returns only minimal, non-sensitive live facts.
- The verify surface shows the JO number, status, completion state, consignee, container numbers, and authoritative charge/payment state.
- The slip watermark and paid text are cosmetic; edited paper cannot fake the live state.

## Attacks it defeats

1. **Doctored slip** - the QR resolves to the order's real live status.
2. **Copied QR** - the verify page shows the real consignee and container numbers, which must match the physical slip and cargo.

## PAID badge truth

The PAID badge reflects the ADR-0037 `charges` spine. Completion requires every billed, non-reversed charge to be confirmed ([[Two-Gate Completion]]), so a `COMPLETED + PAID` verify result is not an order that still owes a billed charge.

## Future

The same QR foundation can support a future guard gate-scan module. See [[Gate Module (gate-in-out)]].

## Related

- [[Job Order Lifecycle]] - [[Two-Gate Completion]] - [[Job Orders]] - [[Gate Module (gate-in-out)]]
- Migrations `0089`/`0090` introduced verify QR; ADR-0037 charge verification is covered by `verify_job_order_charges` and the charge cutover migrations.