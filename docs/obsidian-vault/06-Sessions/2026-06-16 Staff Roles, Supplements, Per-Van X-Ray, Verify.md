---
title: 2026-06-16 Staff Roles, Supplements, Per-Van X-Ray, Verify
tags: [session, roles, payments, job-orders, security, verification]
type: session
---

# 2026-06-16 — Staff Roles, Supplements, Per-Van X-Ray, Verify

Large multi-build day (migrations **0076–0104**, all applied to prod; main at `1b2e824`). Folded the staff model into a proper role matrix, hardened the completion gate, and shipped the anti-forgery verify path. E2E-verified in rolled-back txns.

## Staff roles & split gates (`0086`, `0095`, `0097`)

- **New `csr` role** — customer-service desk: file JOs for customers + support inbox; **never** changes order status. Support inbox is now **CSR + admin/owner only** (operations lost `manage_support`).
- **Split processing gates** — `process_job_orders` split into `accept_orders` / `hold_reject_orders` / `complete_orders`, enforced in the new **`staff_transition_order`** RPC (replaced the admin-only direct UPDATE).
- **X-ray confirmation = Checker only** — operations lost `confirm_xray` (`0087`), then admin lost it too (`0095`); operations regained `process_job_orders` to close DEA/OOG (`0097`).
- Roles now: admin · operations · cashier · checker · csr (+ owner/root). All tunable in **Roles & Gates**. See [[Staff Roles & Gates]].

## Multi-owner + root grants (`0092`, `0093`)

- **`is_root_owner`** (never app-changeable) + secondary owners; **root-only `set_owner_access`** mints/revokes owner. Privilege-grant alerting (`0092`) emails the owner on any admin/owner/role grant by any path. See [[Multi-Owner & Root Grants]].

## Two-gate completion + RPS + supplements (`0086`/`0087`/`0094`/`0096`/`0097`/`0101`)

- Completion now requires **all services done AND base payment AND (RPS not needed OR paid) AND every supplement paid** — `jo_ready_to_complete` + the `complete_on_payment_confirmed` trigger (auto-fires on the last payment) + `enforce_two_gate_complete` backstop. See [[Two-Gate Completion]].

## Per-van X-ray + e-signature (`0087`, `0088`, `0095`)

- X-ray confirmed **per container van** by the **Checker** (`record_van_xray`; BOC performs the X-ray, the checker confirms entry to the X-ray division). Confirmer's name snapshotted immutably for a slip **e-signature block**. Last van rolls up the X-ray service line.

## Public verify-QR (`0089`, `0090`, `0097`)

- Every slip carries a **QR → public `/verify/:id`** (anon `verify_job_order`). Verify page leads with **PAID** + status + completion date and a **consignee + container cross-check** so a copied QR resolves to someone else's details. PENDING/COMPLETED watermark. Foundation for the future guard gate-scan. See [[Verify-QR Anti-Forgery]].

## Cashier station + walk-in (`0091`)

- Focused payments desk at `/admin/cashier`: review online proofs, **record walk-in/office payments**, review supplements, record the ERP invoice. See [[Cashier Station]].

## Supplements + under-review (`0101`, `0104`)

- **JO-####-A/B/C** additional charges, each with its own amount + slip + confirm; release needs all paid. Adding a charge to a completed order bounces it to **under review** → auto-re-completes when paid. `has_open_supplement` flag surfaces it in the customer's Needs-action view. See [[Additional-Charge Supplements]].

## Comment escalation + staff edit + generalized queue (`0100`, `0102`, `0103`)

- **Generalized priority queue** (`0100`) — ONE priority number per JO, weekly reset (replaced per-line serving numbers).
- **Comment escalation** (`0102`) — staff-only internal notes + complaint flag; `jo_timeline` hides `staff_only` from customers. See [[Comment Visibility & Escalation]].
- **Staff edit** (`0103`) — cashier/operations/csr edit the JO header (consignee/entry/vessel/voyage); **checker excluded**.

## Earlier same-day build (`0078`–`0085`)

- Reworked **rate calculator** + per-shipping-line **charge rules** (`0080`), **support tickets** (`0083`, see [[Support Tickets]]), admin **bottom-tab nav** unified to the customer's, expanded customer notifications (`0082`/`0084`), **staff notification bell** (`0085`, permission-routed — see [[Staff Notifications]]), consolidated customer email (`0099`), atomic JO filing (`0098`).

## Decisions

- One generalized queue for now (re-compartmentalize per service later).
- BOC does the X-ray; the **checker confirms entry**, not the X-ray itself.
- The verify scan — not the printed ink — is the proof; container cross-check defeats the copied-QR attack.
- Live chat stays **NOT built**; tickets + deep-link hand-off is the support path.

## Pending

- Refresh AdminTour for the bottom-nav (partly done — role tours added). Counsel-final Customer Agreement + ST02 on live + launch hardening remain the go-live gate. See [[Pending Items]].

Links: [[Job Order Lifecycle]] · [[Staff Roles & Gates]] · [[Two-Gate Completion]] · [[Additional-Charge Supplements]] · [[Verify-QR Anti-Forgery]] · [[Comment Visibility & Escalation]] · [[Multi-Owner & Root Grants]] · [[Cashier Station]] · [[Support Tickets]] · [[Staff Notifications]] · [[Administration]] · [[Job Orders]] · [[Authentication]]
