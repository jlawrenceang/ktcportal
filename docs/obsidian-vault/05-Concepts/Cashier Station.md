---
title: Cashier Station
tags: [concept, payments, cashier, administration]
type: concept
last_updated: 2026-06-16
---

# 💵 Cashier Station

A focused payments desk for the **cashier** role at `/admin/cashier` (`0091`), so collecting and confirming payments doesn't mean wading through the full JO queue. The cashier lands here by default (`RoleLanding`).

## What it does

- **Review online proofs** — confirm/reject uploaded deposit slips (`review_payment`; reject needs a customer-visible note). Base + RPS.
- **Walk-in / office payment** — mark an order paid at the window without a slip (`record_office_payment(jo, kind)` where kind ∈ base/rps, gated `review_payments`). We still nudge customers online to skip the line. Confirming trips the [[Two-Gate Completion]] auto-complete when services are already done.
- **Additional charges** — a 4th section reviews/collects supplement payments (`review_supplement_payment` / `record_supplement_office_payment`). See [[Additional-Charge Supplements]].
- **Record ERP invoice** — `record_service_invoice` writes `service_invoice_no` = **PAID** (the official invoice/receipt still come from the ERP).

## Gates

All cashier actions need **`review_payments`** (or `record_invoice` for the invoice). The cashier also holds `complete_orders` / `hold_reject_orders` but **not** `accept_orders` — see [[Staff Roles & Gates]].

## Related

- [[Administration]] · [[Two-Gate Completion]] · [[Additional-Charge Supplements]] · [[Staff Roles & Gates]] · [[Job Order Lifecycle]]
- Migrations `0036` (payment + review), `0091` (office payment + station)
