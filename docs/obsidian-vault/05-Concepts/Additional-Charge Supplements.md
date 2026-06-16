---
title: Additional-Charge Supplements
tags: [concept, job-orders, payments]
type: concept
last_updated: 2026-06-16
---

# 🧾 Additional-Charge Supplements (JO-####-A/B/C)

After a Job Order is filed (or even completed), extra charges can come up — re-inspection, extra moves, a correction. Rather than reopen the base computation, operations **tags a supplement**: a lightweight additional-charge line attached to the main JO, with its **own** amount, payment slip, and confirmation. Introduced in **`0101`**; the customer-facing "needs action" flag in **`0104`**.

## Model — `jo_supplements`

- `suffix` (A, B, C…, auto from the count — numbered **JO-<no>-A / -B / -C**), `label`, `amount`.
- Its own payment lifecycle: `payment_status` `unpaid → submitted → confirmed | rejected`, `payment_proof_path`, `payment_note`.
- RLS: read = `view_job_orders` staff **or** the owning customer; **all writes via RPCs**.

## RPCs

- **`add_supplement(jo, label, amount)`** — operations/admin (`process_job_orders`). Blocks on `cancelled`/`rejected`/`held`. Notifies the customer.
- **`submit_supplement_proof(supp, path)`** — customer uploads a slip (per-user path check) → notifies the payments desk.
- **`review_supplement_payment(supp, confirm, note)`** — cashier (`review_payments`) confirms/rejects (reject needs a note).
- **`record_supplement_office_payment(supp)`** — cashier records a walk-in payment.

## Under review (the un-complete / re-complete loop)

Adding an **unpaid** supplement to an **already-completed** order bounces it back: `status → processing`, `completed_at` cleared. This shows as **"Under review"** on admin + customer rows and a banner on the pay page. The order **auto-re-completes** the moment the last outstanding charge is confirmed (the supplement-review RPCs call `jo_ready_to_complete`). See [[Two-Gate Completion]].

## Completion gate

Supplements are part of the release gate: `jo_ready_to_complete` + `enforce_two_gate_complete` require **no** supplement left `<> 'confirmed'`. So a JO with an open charge cannot complete or be released.

## Customer "needs action" (`0104`)

"Has an outstanding supplement" is a cross-table condition PostgREST can't express in a parent `.or()` filter, so it's **denormalized** onto `job_orders.has_open_supplement`, kept in sync by an INSERT/UPDATE trigger (`sync_open_supplement`) on `jo_supplements`. My Job Orders' Needs-action filter reads the boolean. The trigger touches only that column, so it does **not** trip the two-gate completion trigger.

## UI

- **Operations** — "Add charge" on the admin JO card.
- **Customer** — each supplement is its own pay section on `/job-order/:id/pay`.
- **Cashier** — a 4th section in the [[Cashier Station]] reviews/collects supplement payments.

## Related

- [[Two-Gate Completion]] · [[Job Order Lifecycle]] · [[Cashier Station]] · [[Job Orders]]
- Migrations `0101` (supplements + under-review), `0104` (open-supplement flag)
