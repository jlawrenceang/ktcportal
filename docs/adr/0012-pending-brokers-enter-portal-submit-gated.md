# ADR-0012: Let pending brokers into the portal; file job orders as held until verified

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-09
* Category: Workflow | Security

> **Revised 2026-06-09 (same day, pre-rollout):** the first cut blocked Submit for pending brokers (prepare-only, nothing persisted). To avoid a broker filling a long form only to find Submit disabled, the decision was changed to **file-then-hold-then-release**: pending brokers can submit, the order is saved as `held` (hidden from admin), and approving the broker releases all their held orders. The body below reflects the final decision.

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

Chosen option: **a refinement of Option A — file-then-hold-then-release.** A confirmed broker with `status='pending'` lands in the normal portal (Home / New Job Order / My Job Orders / Agreement) with a persistent `BrokerStatusBanner` that carries the valid-ID upload and the consent sync that previously lived in the locked `PendingPanel`. They can fill **and submit** a job order — it saves successfully as `status='held'` and shows in My Job Orders as "Pending approval"; it is **not** visible to the admin processing queue. When an admin approves the broker, an `AFTER UPDATE OF status` trigger on `brokers` (`release_held_job_orders`) flips all that broker's `held` orders to `submitted`, releasing them into the queue, and the welcome email fires (migration `0015`). `PendingPanel` is now only the locked screen for `rejected` / `suspended` brokers (with the decision reason).

The security boundary is enforced in RLS (migration `0016`): the `job_orders` insert policy allows `broker_id = current_broker_id() AND (broker_is_approved() OR (status='held' AND broker_is_pending()))` — so a pending broker can insert **only** `held` rows, approved brokers file normally, and rejected/suspended brokers can file nothing. Brokers have no `UPDATE` policy on `job_orders`, so a pending broker cannot self-promote a `held` order to `submitted`; only the security-definer release trigger can.

**Anti-spam guards (migrations `0017`/`0018`).** Because a confirmed-but-unverified broker could otherwise spam held orders and burn the JO-number sequence: (1) a **cap** of 10 held orders per pending broker (`enforce_held_cap` trigger); (2) **deferred numbering** — held orders carry no official `X-######`; `jo_number` is nullable and assigned by `ensure_jo_number` only when an order reaches a live status, so spam/cancelled holds never gap the official sequence; (3) a **48h TTL** — `expire_unverified_brokers()` runs hourly via pg_cron and rejects pending brokers who confirmed their email >48h ago but never uploaded a valid ID (keyed on broker inaction, not admin latency), which requires them to re-register. Rejecting or suspending a broker cancels their held orders.

### Positive Consequences

* Brokers can do real work immediately after confirming their email — no dead Submit button after filling a long form.
* The admin checkpoint is preserved — held orders never reach staff's queue until the broker's ID is verified.
* Release is automatic and atomic on approval; the broker doesn't have to re-submit anything.

### Negative Consequences / Trade-offs

* The insert RLS is relaxed from "approved only" to "approved, or pending-as-held" — a wider surface than before, mitigated by the `held`-only constraint, the no-self-promote guarantee (no broker UPDATE policy), and the fact held rows are inert until release.
* Pending brokers can browse the full consignee master list before approval (minor; already broad per ADR-0007).
* When the admin job-order processing page is built, it must exclude `status='held'` from the queue (the rows are visible to admin RLS, but should not be processed pre-release).

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
