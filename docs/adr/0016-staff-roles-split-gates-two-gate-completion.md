# ADR-0016: Split processing into independently-assignable gates + a two-gate completion rule, enforced by a transition RPC

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Workflow | Security

## Context and Problem Statement

The original staff model (ADR-0014, migration `0035`) had three roles — `admin` / `cashier` / `checker` — plus an owner-tunable `role_permissions` matrix (`has_permission()`). A single coarse `process_job_orders` gate governed every status move, and admins acted by a direct `UPDATE` on `job_orders` under a broad admin policy. As real operations were modelled (operations floor, customer-service desk, a money desk), this proved too coarse: different people legitimately own different *stages* of an order, and "completed" must mean something stronger than "an admin clicked complete." We needed (1) finer roles, (2) per-stage permission gates, and (3) a backend-enforced definition of when an order may actually complete.

## Decision Drivers

* Backend-enforced access (repo non-negotiable) — stage authority must live in RLS/RPCs, not a disabled button or a broad admin UPDATE.
* Separation of duties — the desk that accepts an order, the desk that holds/rejects it, and the desk that completes it can be different people; each must be assignable in Settings → Roles & Gates.
* "Completed" must be trustworthy — an order is only done when the work *and* the money are both settled (this slip can be shown at the gate, ADR-0019).
* Owner-tunable without code — the permission matrix stays data (`role_permissions`), owner-only to write.

## Considered Options

* **A — Keep one `process_job_orders` gate + the direct admin UPDATE.** Simplest, status quo.
* **B — Split the gate per transition, route all explicit moves through a single SECURITY DEFINER RPC, and fold completion readiness into a reusable predicate (chosen).**
* **C — Hard-code the role→transition mapping in the frontend / RPC.** No owner tuning.

## Decision Outcome

Chosen option: **B.**

**New roles (`0086`).** The role whitelist widens to `admin / cashier / checker / operations / csr` (operations was added earlier in `0056`; `csr` — the customer-service desk — is added here). `create_staff` accepts the new roles. Authoritative seeded matrix: **admin** = all; **operations** = `accept_orders, assess_rps, complete_orders, hold_reject_orders, manage_vessel_schedule, process_job_orders, view_job_orders`; **cashier** = `review_payments, record_invoice, complete_orders, hold_reject_orders, view_job_orders`; **checker** = `confirm_xray, view_job_orders`; **csr** = `file_job_orders, manage_support, view_job_orders`. CSR relays messages and files orders but never changes a status; the support inbox is funnelled to CSR + Admin/Owner only (operations loses `manage_support`).

**Split gates (`0086`).** The single `process_job_orders` gate is split for the explicit staff transitions so each stage is independently assignable:

* `accept_orders` — `submitted | on_hold → processing`
* `hold_reject_orders` — `→ on_hold` / `rejected`
* `complete_orders` — `→ completed`

`process_job_orders` is *kept* for the internal service paths (DEA/OOG service-done, requeue, archive, restore).

**Gated transition RPC (`0086`, refined `0097`).** `staff_transition_order(p_id, p_status, p_note, p_recoverable)` replaces the admin-only direct UPDATE: it maps the target status to its gate, checks `has_permission()`, validates the from-state, requires a note on hold/reject, and (for completion) calls `jo_ready_to_complete()`.

**Two-gate completion (`0086`, `0087`, `0094`, `0096`, `0097`, `0101`).** An order may reach `completed` only when **all services are done AND base payment is confirmed AND (RPS not needed OR RPS paid) AND every additional-charge supplement is paid** (`jo_ready_to_complete()`). Whichever condition lands last auto-completes the order: the service side via `record_service_done`/`record_van_xray` calling the predicate; the payment side via a BEFORE-UPDATE trigger `complete_on_payment_confirmed` (extended in `0097` to also fire when the RPS payment lands last, and to stamp `completed_at` — `0096`, since the trigger updates `payment_status`, not `status`). A backstop trigger `enforce_two_gate_complete` (`0094`, extended `0097`/`0101`) raises a `check_violation` if any path — including a raw admin UPDATE — tries to set `completed` without satisfying every gate. `0094` also made `is_admin` owner-only at the guard level (a plain admin can't laterally mint another admin via a raw row update).

### Positive Consequences

* Each lifecycle stage is independently assignable and owner-tunable without a deploy.
* Completion is a single server-side predicate enforced on *every* path (RPC, service roll-up, payment trigger, raw UPDATE) — a slip can't read "completed/paid" unless it truly is, which underpins the verify-QR (ADR-0019).
* The direct admin UPDATE is gone for these transitions; authority is centralized in one auditable RPC.

### Negative Consequences / Trade-offs

* The completion predicate now spans several conditions (services, base payment, RPS, supplements) recreated across multiple migrations (`0086`→`0101`); it must be kept in lockstep in `jo_ready_to_complete` *and* `enforce_two_gate_complete`.
* More gates = more matrix rows to reason about; a mis-set gate silently removes an ability (mitigated by the UI hiding what you can't do, and the owner failsafe bypassing all gates).

## Pros and Cons of Options

### A: One gate + direct admin UPDATE
* Good, because simplest.
* Bad, because no separation of duties and "completed" carries no payment guarantee.

### B: Split gates + transition RPC + completion predicate (chosen)
* Good, because backend-enforced, owner-tunable, and completion is trustworthy on every path.
* Bad, because the predicate is duplicated across a guard and a readiness function that must stay in sync.

### C: Hard-coded mapping
* Good, because no matrix to misconfigure.
* Bad, because every role/stage change needs a deploy — violates the owner-tunable driver.

## Related ADRs

* Extends [ADR-0014](0014-admin-job-order-processing-and-printable-slip.md) (admin JO processing) — the direct admin UPDATE it introduced is superseded by `staff_transition_order` for accept/hold/reject/complete.
* Required by [ADR-0017](0017-per-van-xray-checker-esignature.md) (X-ray is one half of the service gate), [ADR-0018](0018-additional-charge-supplements-under-review.md) (supplements join the completion gate), and [ADR-0019](0019-public-verify-qr-anti-forgery.md) (the PAID/COMPLETED slip relies on this guarantee).

## References

* `supabase/migrations/0086_csr_role_and_split_processing_gates.sql` (roles, split gates, `staff_transition_order`, `jo_ready_to_complete`)
* `supabase/migrations/0087_per_van_xray_and_two_gate_complete.sql` (`complete_on_payment_confirmed`, service-done adopts the predicate)
* `supabase/migrations/0094_review_security_hardening.sql` (`enforce_two_gate_complete` backstop; `is_admin` owner-only)
* `supabase/migrations/0096…0097` (stamp `completed_at` on the payment path; fold RPS into the gate; ops regains `process_job_orders` to close DEA/OOG)
* `src/admin/AllJobOrders.tsx`, `src/admin/Settings.tsx` (Roles & Gates editor)
