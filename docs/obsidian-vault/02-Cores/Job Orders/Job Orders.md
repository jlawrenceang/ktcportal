---
title: Job Orders Core
tags: [core, job-orders, wave-1]
type: core
wave: 1
status: live
owner: Customer
last_updated: 2026-06-22
---

# 📝 Job Orders Core

> **Maturity:** LIVE — filing · gated processing · per-van X-ray · payments · supplements · verify-QR

## Purpose

The core transaction: a customer (or CSR / operations on behalf) files a Job Order requesting terminal services (X-ray, DEA exam, OOG stripping) against a consignee, then it flows through the stations to a completed, paid, verifiable slip. Full state machine: [[Job Order Lifecycle]].

## Runtime routes (key)

- `/job-order` — file a JO; bulk-paste containers (uncapped)
- `/job-orders` — customer's own orders (Needs-action filter incl. **under-review** supplements, `0104`)
- `/job-order/:id/pay` — payment page (computation + bank/GCash/QR + slip upload; base, RPS, and each supplement as its own section)
- `/job-order/:id/print` — A6 slip (PENDING/COMPLETED watermark + **verify QR**)
- `/verify/:id` — **public** anti-forgery verify ([[Verify-QR Anti-Forgery]])
- `/admin/job-orders` — staff queue + gated transitions · `/admin/checker` — per-van X-ray · `/admin/cashier` — [[Cashier Station]]

## Model

- `job_orders` (header) + `job_order_lines` (per-container lines, now with `xray_done_at/by/by_name`, + `size`/`fill`/`kind` `0141`) + `service_completions` (per service line) + `serving_numbers` (one **priority** number per JO, `0100`).
- `jo_supplements` (`0101`) — additional-charge lines JO-####-A/B/C. `job_orders.has_open_supplement` denormalized flag (`0104`).
- RPS: `rps_status` / `rps_path` / `rps_moves` / `rps_payment_status` (`0062`/`0063`).
- Consignee from the master-list typeahead (ADR-0007) — **unlisted ones can be requested** (`request_consignee`, file-now pending; see [[Consignees]]). Vessels similarly via `request_vessel` (`0137`). Service requests in `SERVICE_REQUESTS` (X-ray / DEA / OOG).
- **Container rate matrix** (`0141`) — `terminal_rates` (the **calculator/quote** tariff) is keyed by service × trade × origin × **size × fill (empty/full) × kind (dry/reefer)**; unset cells flag "rate not set" (never ₱0). NOTE: this is the **calculator only** — **live billing runs on `service_rates`**, and the X-ray JO itself stays **operational/unpriced** (the size/fill/kind *filing* UI was reverted).
- **Statuses:** `held` → `submitted` → `processing` → `completed`; or `on_hold` / `rejected` / `cancelled`. ("Under review" = a completed order bounced back by a new supplement.)

## Processing & completion

- **Gated transitions** via `staff_transition_order` with the **split gates** `accept_orders` / `hold_reject_orders` / `complete_orders` ([[Staff Roles & Gates]]). No more admin-only direct UPDATE.
- **Per-van X-ray** ([[Job Order Lifecycle]] §E) — `record_van_xray` (Checker-only `confirm_xray`); last van rolls up the X-ray service line.
- **[[Two-Gate Completion]]** — completes only when all services done **AND** base payment **AND** RPS (if needed) **AND** every supplement are confirmed. Auto-fires from whichever side finishes last.
- **Staff header edit** — `staff_edit_job_order` (operations/cashier/CSR; **checker + customers excluded**, `0103`).

## Payments

- Base payment (slip upload → cashier confirm/reject) + **walk-in/office payment** (`0091`) + **RPS** assessment & payment + **supplements** ([[Additional-Charge Supplements]]). ERP `service_invoice_no` = PAID. See [[Cashier Station]].

## Comments & timeline

- `jo_timeline` reader; customer comments + **staff-only internal notes** + **complaint flag** ([[Comment Visibility & Escalation]]). Documents attach to the same timeline.

## Backend surface (key)

- RPCs: `staff_transition_order`, `record_van_xray`, `record_service_done`, `record_rps_assessment`, `review_payment` / `record_office_payment`, `add_supplement` / `submit_supplement_proof` / `review_supplement_payment` / `record_supplement_office_payment`, `staff_edit_job_order`, `verify_job_order` (anon), `now_serving`, `assign_serving_numbers`, `add_jo_comment` / `add_jo_staff_note` / `flag_jo_comment`.
- RLS: customers see/insert/edit-own (held/submitted); staff via `has_permission('view_job_orders')` (held excluded).

## Related

- [[Brokers]] · [[Consignees]] · [[Administration]]
- [[Job Order Lifecycle]] — **full state/transition/numbering source of truth**
- [[Two-Gate Completion]] · [[Additional-Charge Supplements]] · [[Verify-QR Anti-Forgery]] · [[Comment Visibility & Escalation]] · [[Cashier Station]] · [[Staff Roles & Gates]]
- ADR-0001, ADR-0005, ADR-0007, ADR-0012, ADR-0014
