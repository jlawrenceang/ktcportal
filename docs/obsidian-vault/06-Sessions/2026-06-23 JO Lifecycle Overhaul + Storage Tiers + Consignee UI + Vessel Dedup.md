---
title: 2026-06-23 JO Lifecycle Overhaul + Storage Tiers + Consignee UI + Vessel Dedup
tags: [session, job-orders, pricing, consignees, vessels, smoke-test]
type: session
date: 2026-06-23
---

# 2026-06-23 — JO Lifecycle Overhaul + Storage Tiers + Consignee UI + Vessel Dedup

A portal-focused build day on a single contiguous lane (migrations **0151–0158**, all applied to prod; `APP_VERSION` bumped through to **v1.6.12**). The big themes: a **job-order lifecycle overhaul** (terminal reject, field-targeted on-hold, reject/suspend cascades, unified payment pill, dual-view lists), a **rate-calculator rework** (per-service granularity + tiered foreign storage), **vessel de-duplication + dropdown-only filing**, a **clickable consignee admin**, **tabbed Settings**, and an **ST05 preflight re-run**. Test data was purged to a clean slate.

## What shipped

### Job-order lifecycle overhaul (`0151`–`0156`)
- **Reject is terminal; on-hold is field-targeted "needs info" (`0154`):** a rejected JO is closed — no customer resubmit — with the reason shown. An on-hold JO now carries **`needs_fields`**: staff tick exactly which fields (**consignee / entry / vessel / containers**) the customer must re-enter, and only those unlock on resubmit (`hold_job_order` + `resubmit_needs_info`).
- **Reject/suspend cascades:** rejecting a **consignee** (`0152`) or suspending/rejecting a **customer** (`0153`) now cancels their open job orders with a reason — **except** orders already **paid or invoiced** (left for manual handling).
- **Customer serving-number notification retired (`0151`):** dropped the `serving_numbers_notify` trigger so customers / CSR no longer get a "Serving number #N" notification (copy scrubbed to batch + working-hours aging). The **ops X-ray queue keeps its number**.
- **Unified payment pill:** one **"Balance to pay" / "Paid"** indicator (base + RPS + every supplement) replaces the scattered payment chips; the pay button reads **"Balances"**. Additional charges became a **dropdown of admin-seeded types** (`additional_charge_types`, `0155`) with an editable amount, managed in Settings.
- **Admin & print fee merged (`0156`):** the two flat fees collapse into one **"Admin & print fee"** value.
- **Dual-view JO lists:** both the customer (`MyJobOrders`) and admin (`AllJobOrders`) lists gain a **Cards / List toggle**. The admin side shows compact, scannable tiles → **clicking a tile opens a detail modal** with the full order (containers, supplements, release tracks, notes, timeline) and all actions behind their gates.
- **"Cleared for release" badge:** a derived green **"✓ Cleared for release"** badge lights up only when **both gates converge** — all services done **and** payment confirmed — from `releaseState()` (the [[Two-Gate Completion|two-gate]] model), never stored.

### Rate calculator rework (`0157`)
- **Per-service rate granularity (`terminal_rate_config`):** each terminal service (arrastre / wharfage / LoLo / weighing) configures which conditions its rate varies by — any subset of **origin / size / fill / kind**, or **uniform**. The Settings editor shows only the inputs for the ticked conditions and **fans the value out** to the underlying `terminal_rates` cells, so the calculator's full-key lookup is unchanged. Seeded from live data: arrastre = origin×size×fill, weighing/wharfage = size, LoLo = uniform.
- **Tiered foreign storage (`storage_tiers`):** foreign storage is a **progressive per-day band tariff** per trade direction (**Import / Export / Transhipment**) × size, charged **cumulatively** after the line's free days (each band escalating). **Domestic** storage stays a flat per-day rate by size; **empty** containers use the laden rates. The calculator computes the cumulative tiered total.
- **Transhipment** added as a foreign trade option (with its own storage bands); domestic stays **Inbound / Outbound** only. A colour-coded **Foreign / Domestic** origin pill replaces the plain text in the calculator + tariff editor.

### Vessel (`0158`)
- **Removed the "vessel not listed — enter manually" escape hatch app-wide:** the customer **edit-order** form (`EditJobOrderForm`) and the admin **file-on-behalf** form (`NewJobOrder`) are now **dropdown-only** (vessel is schedule-driven). If a vessel isn't listed, customers call KTC customer service and ops add it to the schedule. (The customer filing form + on-hold resubmit were already dropdown-only.) Ops manual updated.
- **De-duplicated `vessel_schedule` (`0158`):** the sync derives `vessel_visit` as `<name> <voyage> <week-or-arrival-date>`, so when ops filled the sheet's week column for a row first synced without it, the key flipped (`…2026-06-21` → `…W26`) and a **second row** was inserted for the same visit. The migration collapses existing dupes (keep newest) and adds a **trigger enforcing one row per (vessel_name, voyage_number)** on every insert/update — duplicates can't recur regardless of key format.

### Consignees admin
- **Clickable rows → detail modal:** the admin consignee list is now clean, scannable cards (code · name + "customer-requested" chip + "needs docs" hint + TIN preview + status pill). Clicking a row opens a **detail modal** showing the same fields the customer fills when requesting a consignee — **business address, TIN / VAT Reg #, BIR 2303 (view), BIR 2307 (view)** — plus status, note, dates, the **requester's name + email**, and **Print CIS**. The **Approve / Needs info / Reject / Edit / Delete** actions moved into the modal (review documents + details together before deciding); the "Approve all pending" bulk bar is retained.

### Settings
- **Tabbed:** the long scroll is grouped into **Pricing & tariff · Operations · Access & staff · System** (Language stays pinned on top). The **storage tariff editor** was restyled to a clean table (day-band columns × 20ft/40ft rows) mirroring the source rate sheet.

### Data
- Test job orders **purged to a clean slate**; **`jo_number_seq` reset** so the first real JO is `JO-000001`; **0 releases**.

## ST05 smoke test (preflight + read-only backbone)
- **Preflight P1–P8 re-run green** (through `0158`); added **Lane L** (container rate matrix) to the script.
- **Lane J-3 verified server-side:** the live `role_permissions` matrix matches the documented matrix — **0 mismatch** — including the `purchaser` / fuel and **`review_consignee_requests`** gates.
- **Read-only RPC backbone verification** of the release / JO guards.
- **Defect D-01 (Low, OPEN):** the release-desk hold/reject **reason note is NOT server-enforced** — `verify_release_order`, `confirm_release_payment`, and `confirm_release_supplement_payment` accept a **blank** note, unlike the JO side which raises. Tracked in [[Pending Items]].
- **Manual Lanes A–K** still to run with the owner.

## Decisions
- **Reject = terminal, on-hold = field-targeted.** No order-level resubmit after a reject; on-hold unlocks only the flagged `needs_fields`.
- **Cascades skip paid/invoiced.** A consignee/customer reject or suspend cancels open JOs but **never** touches orders already paid or invoiced.
- **Serving number is ops-only.** Customers see batch + working-hours aging; only the ops X-ray queue keeps a number.
- **`terminal_rates` ≠ billing (still).** The granularity + storage-tier rework is calculator/quote only; live payment still runs on `service_rates`.
- **Vessel is dropdown-only.** No manual vessel entry anywhere — ops add to the schedule first.

## Pending / next
- **ST05 manual Lanes A–K** with the owner; close **Defect D-01** by raising on a blank release-desk reason (mirror the JO side).
- **Tagalog copy** for the newest admin strings (lifecycle / storage editor / consignee modal) currently falls back to English — owner review before go-live.
- Carry-overs from the prior session: confirm the new container-rate cells with the owner; fuel Phase 1+ still deferred. See [[Pending Items]].

## Related
- [[Job Orders]] · [[Job Order Lifecycle]] · [[Consignees]] · [[Two-Gate Completion]] · [[Staff Roles & Gates]]
- [[2026-06-22 Consignee+Vessel Requests, CIS, Rate Matrix, Fuel Phase 0]]
- [[Current State]] · [[Completed Milestones]] · [[Pending Items]] · [[System Scale]]
