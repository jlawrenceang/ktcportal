---
title: Job Orders Core
tags: [core, job-orders, wave-1]
type: core
wave: 1
status: live
owner: Customer
last_updated: 2026-06-27
---

# 📝 Job Orders Core

> **Maturity:** LIVE — filing · gated processing · per-van X-ray · **auto-complete** · **priority + re-X-ray lanes** · **invoice-gated payments** · request→bill charges · verify-QR

## Purpose

The core transaction: a customer (or CSR / operations on behalf) files a Job Order requesting terminal services (X-ray, DEA exam, OOG stripping) against a consignee, then it flows through the stations to a completed, paid, verifiable slip. Full state machine: [[Job Order Lifecycle]].

## Runtime routes (key)

- `/job-order` — file a JO; bulk-paste containers (uncapped)
- `/job-orders` — customer's own orders (Needs-action filter incl. **under-review** supplements, `0104`)
- `/job-order/:id/pay` — payment page (computation + bank/GCash/QR + slip upload; base, RPS, and each supplement as its own section)
- `/job-order/:id/print` — A6 slip (PENDING/COMPLETED watermark + **verify QR**)
- `/verify/:id` — **public** anti-forgery verify ([[Verify-QR Anti-Forgery]])
- `/admin/job-orders` (operations land on the staff-PWA `/app/operations`) — staff queue + gated transitions + priority/re-X-ray **request & approve** · `/admin/checker` (`/app/checker`) — per-van X-ray, **lane-sorted** (priority → regular → re-X-ray) · `/admin/cashier` (`/app/cashier`) — [[Cashier Station]] (payments + ERP invoice + **bill charges**)

## Model

- `job_orders` (header; + `priority_status`, and `is_rexray` / `parent_job_order_id` / `rexray_status` / `rexray_billable` for the ADR-0035 lanes) + `job_order_lines` (per-container, with `xray_done_at/by/by_name`, + `size`/`fill`/`kind` `0141`) + `service_completions` (per service line) + `serving_numbers` — **three lanes** (`queue` · `priority` · `rexray`), assigned/vacated **automatically** on status (`0100`/`0173`/`0174`/`0175`).
- `jo_supplements` (`0101`) — additional-charge lines JO-####-A/B/C, each with a `bill_status` (`requested` → `billed`, ADR-0035 `0176`). `job_orders.has_open_supplement` denormalized flag, set only by **billed-unpaid** supplements (`0104`/`0182`).
- RPS: `rps_status` / `rps_path` / `rps_moves` / `rps_payment_status` (`0062`/`0063`).
- Consignee from the master-list typeahead (ADR-0007) — **unlisted ones can be requested** (`request_consignee`) but must be **approved before they can be used to file** (`0167`/`0169`); a pending account can't request one (`0183`). See [[Consignees]]. Vessels similarly via `request_vessel` (`0137`, dropdown-only since `0158`). Service requests in `SERVICE_REQUESTS` (X-ray / DEA / OOG).
- **Container rate matrix** (`0141`) — `terminal_rates` (the **calculator/quote** tariff) is keyed by service × trade × origin × **size × fill (empty/full) × kind (dry/reefer)**; unset cells flag "rate not set" (never ₱0). NOTE: this is the **calculator only** — **live billing runs on `service_rates`**, and the X-ray JO itself stays **operational/unpriced** (the size/fill/kind *filing* UI was reverted).
- **Statuses:** `submitted` → `processing` → `completed`; or `on_hold` / `rejected` / `cancelled`. `held` is **legacy** — pending customers are now **verify-only** and can't file (`0163`). Reject is **terminal** (recover via the field-targeted `on_hold` path, `0154`); a charge billed after completion no longer reverts the order (`0183`).

## Processing & completion

- **Gated transitions** via `staff_transition_order` with the **split gates** `accept_orders` / `hold_reject_orders` ([[Staff Roles & Gates]]); approval is **operations/admin** only and the **cashier is money-only** (dropped hold-reject/complete in `0171`). No admin-only direct UPDATE.
- **Per-van X-ray** ([[Job Order Lifecycle]] §E) — `record_van_xray` (Checker-only `confirm_xray`); last van rolls up the X-ray service line. A **re-X-ray** child can't be X-rayed before admin approval (`0181`).
- **[[Two-Gate Completion]] — now fully automatic** — completes the moment all services done **AND** base payment **AND** RPS (if needed) **AND** every **billed** supplement are confirmed; auto-fires from whichever side finishes last (`complete_on_service_done` / `complete_on_payment_confirmed`). **The manual "complete" button is retired** (ADR-0035).
- **Priority + re-X-ray lanes** (ADR-0035) — `request_priority` → `review_priority` (admin); `request_rexray` → `review_rexray` (admin) spawns a suffixed child JO (`JO-000001A`; free by default, `rexray_billable` for later). Both are **request → admin-approve** — the requester can't self-approve. See [[Job Order Lifecycle]] §D.
- **Staff header edit** — `staff_edit_job_order` (operations/cashier/CSR; **checker + customers excluded**, `0103`).

## Payments

- Base payment (slip upload → cashier confirm/reject) + **walk-in/office payment** (`0091`) + **RPS** assessment & payment + **supplements** ([[Additional-Charge Supplements]]). **Confirming the base payment requires the ERP service invoice + BIR pad serial on file** (`record_service_invoice`, ADR-0035 `0177`; the walk-in path too, `0178`) — recording them *is* the confirm. **Charges are ops-request → cashier-bill** (`request_supplement` → `bill_supplement`); ops never bills directly. ERP `service_invoice_no` = PAID. See [[Cashier Station]].

## Comments & timeline

- `jo_timeline` reader; customer comments + **staff-only internal notes** + **complaint flag** ([[Comment Visibility & Escalation]]). Documents attach to the same timeline.

## Backend surface (key)

- RPCs: `staff_transition_order`, `record_van_xray`, `record_service_done`, `record_rps_assessment`, `review_payment` / `record_office_payment`, `record_service_invoice` (ERP invoice + BIR pad; **required before base-pay confirm**, `0177`), `request_supplement` / `bill_supplement` (ops-request → cashier-bill, `0176`; legacy direct `add_supplement` re-gated to `bill_supplement`) / `submit_supplement_proof` / `review_supplement_payment` / `record_supplement_office_payment`, `request_priority` / `review_priority` (`0174`), `request_rexray` / `review_rexray` (`0175`), `staff_edit_job_order`, `verify_job_order` (anon), `now_serving`, `assign_serving_numbers` / `serving_numbers_on_status` (auto lifecycle; manual `restore_serving_number` **dropped** `0182`), `add_jo_comment` / `add_jo_staff_note` / `flag_jo_comment`.
- RLS: customers see/insert/edit-own (held/submitted); staff via `has_permission('view_job_orders')` (held excluded).

## Related

- [[Brokers]] · [[Consignees]] · [[Administration]]
- [[Job Order Lifecycle]] — **full state/transition/numbering source of truth**
- [[Two-Gate Completion]] · [[Additional-Charge Supplements]] · [[Verify-QR Anti-Forgery]] · [[Comment Visibility & Escalation]] · [[Cashier Station]] · [[Staff Roles & Gates]]
- ADR-0001, ADR-0005, ADR-0007, ADR-0012, ADR-0014, ADR-0016 (staff roles + two-gate), **ADR-0035** (ops overhaul: queue/priority/re-X-ray/auto-complete/invoice gate)
