# ADR-0021: Add a cashier money desk with walk-in payment recording and consolidate customer emails into one deduped nudge

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Workflow | Integration

## Context and Problem Statement

Two loose ends remained after the payment model matured. First, payment confirmation only had an *online* path — the cashier could confirm an uploaded proof, but customers who pay at the cashier window had no in-app way to be marked paid (the desk had no focused view either). Second, customer email had grown into a set of per-event triggers (on-hold, rejected, payment-rejected, account-approved); with launch approaching and emails being turned on, this risked noisy, detail-leaking mail. We needed a cashier station with walk-in payment recording, and a single, deduped, detail-free customer email.

## Decision Drivers

* A real money desk — the cashier needs a focused station (online proofs + walk-ins + RPS + supplements), and we still nudge customers to pay online to skip the line.
* Walk-in payments must flow through the same gates — recording an office payment must trip the same two-gate auto-complete (ADR-0016), not bypass it.
* Backend-enforced — payment recording is a `review_payments`-gated RPC, not a frontend write.
* One quiet customer email — replace per-event mail with a single "you have a notification, log in" nudge; never put details in the email (security); don't spam.
* Owner-controlled — the email switch (`emails_enabled`, migration `0074`) stays the master control; it's turned **on** for launch.

## Considered Options

**Walk-in payment**
* **A — No in-app walk-in path** (cashier edits via a workaround). Status quo gap.
* **B — A `review_payments`-gated `record_office_payment` RPC that sets `payment_status='confirmed'` directly and lets the two-gate trigger auto-complete (chosen).**

**Customer email**
* **A — Keep per-event emails.** Noisy; leaks details; multiple triggers to maintain.
* **B — One generic, deduped "action needed" nudge fired from a single notifications trigger, controlled by the existing owner switch (chosen).**

## Decision Outcome

**Cashier station + walk-in payment (`0091`).** A dedicated cashier desk (`/admin/cashier`) gives the money roles a focused view. `record_office_payment(p_id, p_kind, p_note)` (gated `review_payments`) marks a walk-in/office payment **confirmed** directly for `base` or `rps`, logs a `payment_office` event, and — because it sets `payment_status`/`rps_payment_status` to `confirmed` — trips the two-gate auto-complete trigger (`complete_on_payment_confirmed`) when every service is already done. The cashier still nudges customers toward online payment to skip the line. (Supplement walk-ins are handled by the parallel `record_supplement_office_payment`, ADR-0018.)

**Consolidated customer email (`0099`).** The per-event email triggers (status-change, account-approved) are unhooked (the functions stay, just detached). A single trigger `notify_pending_email` fires on a new **actionable** notification (`on_hold`, `rejected`, `payment_rejected`, `payment_reminder`, `comment`, `support_reply`, `rps`, `under_review` — informational kinds like serving #, completed, approved, announcement, payment-confirmed do **not** nudge). It is **deduped**: it emails only when this is the customer's *first* unread notification, so there's one nudge per unread batch, no further mail until they clear them. The email carries **no details** ("you have a notification needing action — log in to view it") for security; the bell shows it after login. It respects the owner switch `emails_enabled` (`0074`), which `0099` turns **on** for launch. The in-app bell is unchanged — it always fires, regardless of the email switch.

### Positive Consequences

* The cashier has a real desk and can clear walk-ins in-app; walk-in payments go through the same two-gate completion as online ones — no bypass.
* Customer email is one quiet, deduped, detail-free nudge instead of a per-event stream — launch-safe and low-noise.
* Email behaviour stays under the single owner switch; the in-app bell remains the always-on channel.

### Negative Consequences / Trade-offs

* The dedupe ("only on the first unread") means later actionable items in the same batch don't generate their own email — intentional, but a customer who ignores the first nudge gets no follow-up until they clear notifications.
* `record_office_payment` confirms payment with no uploaded proof on file — appropriate for a cashier-witnessed payment, but it relies on the `review_payments` gate being correctly scoped.
* The retired per-event email functions remain in the schema (unhooked) — dead-but-present code to keep track of.

## Pros and Cons of Options

### Walk-in B: `record_office_payment` RPC (chosen)
* Good, because gated, audited, and reuses the two-gate auto-complete — no special-case completion.
* Bad, because it confirms without a stored proof (mitigated by the gate + the logged `payment_office` event).

### Email B: one deduped nudge (chosen)
* Good, because low-noise, no detail leakage, single trigger, owner-switch-controlled.
* Bad, because batched dedupe can under-notify a customer who ignores the first nudge.

## Related ADRs

* Builds on [ADR-0016](0016-staff-roles-split-gates-two-gate-completion.md) — walk-in payment confirmation drives the same two-gate auto-complete.
* Complements [ADR-0018](0018-additional-charge-supplements-under-review.md) — supplement walk-ins use the parallel office-payment RPC.

## References

* `supabase/migrations/0091_office_payment.sql` (`record_office_payment`)
* `supabase/migrations/0099_consolidated_notification_email.sql` (`notify_pending_email`; per-event triggers unhooked; `emails_enabled` on)
* `supabase/migrations/0074_email_toggle.sql` (owner `emails_enabled` switch)
* `src/admin/CashierStation.tsx` (the money desk)
