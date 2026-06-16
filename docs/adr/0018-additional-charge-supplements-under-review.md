# ADR-0018: Model post-filing extra charges as JO supplements that gate release and can revert a completed order to "under review"

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Workflow | Database

## Context and Problem Statement

An order can accrue extra charges *after* it is filed — operations discovers something on the floor that warrants a fee. The base-payment + RPS model (ADR-0016) had no slot for these ad-hoc charges, and there was no way to bill one against an order that was already completed without re-opening the whole filing. We needed lightweight additional-charge lines, each separately payable and confirmable, that also gate release — and a defined behaviour when a charge is added to an order that has already finished.

## Decision Drivers

* Keep the JO header clean — extra charges shouldn't mutate the original line items or the order's identity.
* Each charge is its own payable unit — own amount, own proof, own cashier confirm (mirrors the base/RPS payment pattern).
* Release integrity — an order with an unpaid charge must not be releasable/completable (extends the two-gate rule, ADR-0016).
* Handle the "already completed" case — adding a charge after completion must visibly re-open the order until it's paid, then settle itself.
* Customer-visible without leaking — the customer must see "you owe an extra charge" in their Needs-action view and the bell.

## Considered Options

* **A — Reuse the base `payment_status` for everything.** No separate charge identity; collapses multiple charges into one number.
* **B — A `jo_supplements` child table (suffix A/B/C…), each with its own payment lifecycle, folded into the completion gate; "under review" = revert a completed order to `processing` until paid (chosen).**
* **C — Re-open the order via a new status `under_review`.** New status vocabulary.

## Decision Outcome

Chosen option: **B** (migrations `0101`, `0104`).

**Supplements (`0101`).** `jo_supplements` rows attach to a JO with a `suffix` (A, B, C…), `label`, `amount`, and an independent `payment_status` (`unpaid → submitted → confirmed → rejected`) + proof path + notes. Numbered **JO-####-A/B/C**. Capped at 26 per order. RLS read = staff (`view_job_orders`) or the owning customer; all writes go through SECURITY DEFINER RPCs:

* `add_supplement(jo, label, amount)` — operations/admin tag a charge (gated `process_job_orders`); notifies the customer.
* `submit_supplement_proof(supp, path)` — customer uploads a slip per charge; notifies the cashier (`review_payments`).
* `review_supplement_payment(supp, confirm, note)` — cashier confirms/rejects (online proof or walk-in); a note is required to reject.
* `record_supplement_office_payment(supp)` — cashier records a walk-in payment.

**Completion gate (`0101`).** `jo_ready_to_complete` and the `enforce_two_gate_complete` backstop both gain `not exists (unpaid supplement)` — so release now requires **services done + base payment + RPS + every supplement paid**.

**"Under review" (`0101`).** Reusing existing statuses rather than inventing a new one: `add_supplement` on a **completed** order reverts it to `processing` and clears `completed_at` ("under review"). Confirming the last outstanding charge (`review_supplement_payment` / `record_supplement_office_payment`) calls `jo_ready_to_complete` and **auto-re-completes** it. The UI shows an "Under review" / ⏳ chip on the admin and customer rows and a banner on the Payment page.

**Needs-action visibility (`0104`).** "Has an outstanding supplement" is a cross-table condition PostgREST can't express in a parent `.or()` filter, so it's denormalized into a queryable `job_orders.has_open_supplement` boolean, kept in sync by an `after insert/update` trigger on `jo_supplements` (touching only that column, so the status/payment two-gate triggers don't fire). Backfilled from existing supplements.

### Positive Consequences

* Extra charges are first-class, independently payable, and never disturb the original order header or lines.
* Release integrity holds — no order with an unpaid charge can complete, on any path.
* The "add a charge to a finished order" case is handled end-to-end (revert → pay → auto-re-complete) without new status vocabulary.
* The customer's Needs-action filter and bell surface the charge correctly despite the cross-table condition.

### Negative Consequences / Trade-offs

* A denormalized `has_open_supplement` flag must be kept consistent with the child table (mitigated by the sync trigger).
* "Under review" overloads `processing` — an order in `processing` may be a fresh accept *or* a re-opened completed order; the chip distinguishes them in the UI but the raw status doesn't.
* The completion predicate now has four parts (services / base / RPS / supplements) duplicated in two functions that must stay in sync (carried over from ADR-0016).

## Pros and Cons of Options

### A: Reuse base `payment_status`
* Good, because no new table.
* Bad, because multiple distinct charges collapse into one figure with no per-charge proof/confirm.

### B: `jo_supplements` child table + gate + revert-to-processing (chosen)
* Good, because clean charge identity, per-charge lifecycle, release integrity, no new status.
* Bad, because a denormalized flag and an overloaded `processing` status.

### C: New `under_review` status
* Good, because explicit.
* Bad, because new status vocabulary ripples through every status check, filter, and badge.

## Related ADRs

* Extends [ADR-0016](0016-staff-roles-split-gates-two-gate-completion.md) — supplements join the two-gate completion predicate.

## References

* `supabase/migrations/0101_jo_supplements.sql` (`jo_supplements`, `add_supplement`, `submit_supplement_proof`, `review_supplement_payment`, `record_supplement_office_payment`; gate + revert)
* `supabase/migrations/0104_open_supplement_flag.sql` (`has_open_supplement`, `sync_open_supplement` trigger, backfill)
* `src/admin/AllJobOrders.tsx` (operations "Add charge"), `src/admin/CashierStation.tsx` (supplement review), `src/pages/Payment.tsx` (per-charge PaySection)
