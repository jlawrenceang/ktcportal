---
title: Payment & Cashier Handoff (proposal)
tags: [workflow, payment, cashier, erp, proposal]
type: workflow
status: proposal-for-audit
last_updated: 2026-06-11
---

# 💳 Payment & Cashier Handoff — proposal (P2, parked for audit)

> Status: **proposal only** — parked 2026-06-11 for a dedicated discussion with
> KTC ops/cashier staff. Nothing here is built. The goal of this doc is to give
> that discussion a concrete starting point and a checklist of what to audit.

## The gap

The portal tracks a JO from filing → completion, and (future build) accepts an
**online payment proof**. The **official Service Invoice + BIR receipt come
from the ERP at the cashier**. Nothing connects the two today: the cashier has
no way to verify a JO's state before issuing the invoice, and the portal never
learns the JO was paid.

## Proposed flow (for discussion)

1. **Service clearance = portal status.** The service line (X-ray counter)
   marks the JO **`completed`** in the portal — that *is* the clearance.
   No separate clearance slip needed; the printable slip already exists as the
   physical token if ops want paper.
2. **Customer pays** — either:
   - **online**: payment page (computation + bank/QR + slip upload) → admin
     confirms the proof in the payment-review queue; or
   - **at the cashier window** directly.
3. **Cashier verifies in the portal, not a Sheet.** Give the cashier a staff
   login; the payment-review queue doubles as their lookup screen: search
   `JO-######` → see status (`completed`?) + payment state (`confirmed` /
   `unpaid`). Always current, RLS-protected, no stale copies.
4. **Cashier issues the ERP Service Invoice**, then records the
   **`service_invoice_no` on the JO** (decided 2026-06-11: invoice number on
   file = **PAID**). This single field is the entire ERP "integration" for now.
5. **EOD audit = one report**: completed JOs **without** a `service_invoice_no`.
   That answers "how do we monitor pending JOs vs the cashier/ERP".

## Why not the Google Sheet in the critical path

A manual Sheet the cashier consults before clearance can be **stale, edited,
or out of order** — and it bypasses RLS/status guards. Keep the planned
one-way **app→Sheet mirror for reporting only**, never as the clearance
authority. (Supabase stays source of truth — same constraint as decision #11.)

Slack→Viber chaining for notifications is likewise not recommended: Slack
doesn't bridge to customers' Viber/Messenger accounts. See the messaging note
in [[2026-06-11 App Review + visionOS Theme]].

## To audit with ops before building

1. Does the cashier **have a PC/portal access** at the window? (If not, the
   Sheet-mirror-as-read-only-display might be the pragmatic fallback.)
2. Sequence: must payment strictly **follow** `completed` (X-ray clearance
   first), or can customers prepay? (Affects when the payment page unlocks.)
3. Who records `service_invoice_no` — the cashier themselves, or back-office
   at EOD from the ERP day book?
4. Does an admin-confirmed **online** payment exempt the customer from the
   window queue, or do they still collect the physical invoice/OR there?
5. Volume: how many JOs/day reach the cashier? (Sizes the queue UI.)
6. Possible **employee role** (cashier ≠ full admin): cashier needs read +
   `service_invoice_no` write only — not approvals/settings. Ties to the
   future employee-role decision (#9, lifecycle doc).

## Build list once audited (rough order)

1. `payments` columns/table + `payment-slips` bucket (mirrors valid-ID pattern).
2. Customer payment page (computation from `service_rates`/`pricing_settings`
   + bank/QR + proof upload).
3. Admin payment-review queue (= cashier lookup screen).
4. `service_invoice_no` field + "mark paid" + EOD unpaid-completed report.
5. (Optional) cashier-scoped employee role.

## Related
- [[Job Order Lifecycle]] (§E pricing & payment) · [[Pending Items]]
- Decisions 2026-06-11: invoice from ERP, invoice-no = paid, fees config in `0030`
