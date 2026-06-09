# ADR-0012: Let pending brokers into the portal; gate job-order submission on approval

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-09
* Category: Workflow | Security

## Context and Problem Statement

Originally (ADR-0001/0005), an un-approved broker was locked out of the entire portal behind a "pending approval" panel — they could only upload their valid ID and wait. This means a registered broker can do nothing useful until an admin processes them, which adds drop-off and gives brokers no way to get familiar with the tool while they wait. The question: can we let a confirmed-but-not-yet-approved broker into the portal to browse consignees and *prepare* a job order, as long as they still can't actually submit one until an admin approves them?

## Decision Drivers

* Reduce onboarding friction — let brokers explore and prepare work while their account is reviewed.
* Keep access control backend-enforced (the repo non-negotiable): preparing ≠ submitting; the submit gate must be RLS, not a disabled button.
* Keep the admin's human checkpoint — no job orders from un-reviewed brokers should reach staff's queue.
* Email confirmation remains the minimum bar to enter (Supabase blocks sign-in until confirmed, so this is automatic).

## Considered Options

* **Option A** — Confirmed-but-`pending` brokers get the full portal (browse + prepare a job order); **submit is gated on admin approval**, enforced by the existing `job_orders` insert RLS (`broker_is_approved()`). Rejected/suspended stay on the locked panel.
* **Option B** — Keep locking pending brokers out entirely (status quo).
* **Option C** — Let pending brokers submit as soon as they upload a valid ID (self-serve gate), with admin review happening asynchronously after.

## Decision Outcome

Chosen option: **Option A**. A confirmed broker with `status='pending'` now lands in the normal portal (Home / New Job Order / My Job Orders / Agreement) with a persistent `BrokerStatusBanner` that carries the valid-ID upload and the consent sync that previously lived in the locked `PendingPanel`. They can fill the whole New Job Order form, but the Submit button is disabled with a "pending approval" message, and — the real enforcement — the **`job_orders` / `job_order_lines` insert policies already require `broker_is_approved()`** (migration `0003`), so a direct API call from a pending broker is denied server-side. `PendingPanel` is now only the locked screen for `rejected` / `suspended` brokers (with the decision reason). On approval the broker gets the welcome email (ADR-pending / migration `0015`) and Submit unlocks.

### Positive Consequences

* Brokers can prepare work and learn the tool immediately after confirming their email — less drop-off.
* No code change to the security boundary: the approval gate that already protected submission is unchanged; only the UI lock was relaxed.
* The admin checkpoint is preserved — un-reviewed brokers still cannot push an order into staff's queue.

### Negative Consequences / Trade-offs

* Pending brokers can now browse the full consignee master list before approval (minor data exposure; the list is already broad per ADR-0007).
* Prepared-but-unsubmitted job orders are ephemeral (client-side only) — they are not persisted as drafts, so a pending broker who navigates away loses their in-progress form. Persisting drafts as owned rows is a possible future enhancement.

## Pros and Cons of Options

### Option A: Pending brokers enter; submit gated on approval (chosen)
* Good, because it cuts friction while keeping the backend gate and the admin checkpoint intact.
* Bad, because in-progress orders aren't persisted, and pending brokers see the master list pre-approval.

### Option B: Keep locking pending brokers out
* Good, because simplest and most conservative.
* Bad, because brokers can do nothing until processed — more drop-off, no familiarity.

### Option C: Self-serve gate (submit unlocks on ID upload)
* Good, because fastest path for brokers.
* Bad, because it removes the human checkpoint — un-vetted brokers' orders reach staff before anyone reviews the ID.

## Related ADRs

* Relaxes the portal-lock posture of [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md) and the approval workflow of [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md) for the *pending* state only; the submission gate from ADR-0005 (`broker_is_approved()`) is unchanged and is now the sole enforcement point.

## References

* `src/components/Shell.tsx` (locked vs pending branch) · `src/components/BrokerStatusBanner.tsx` (new) · `src/components/PendingPanel.tsx` (locked-only) · `src/pages/JobOrder.tsx` (submit gate)
* `supabase/migrations/0003_broker_account_approval.sql` (`broker_is_approved()` insert RLS — the server-side gate)
