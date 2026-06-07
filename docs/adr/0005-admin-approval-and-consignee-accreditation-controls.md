# ADR-0005: Require admin approval + consignee accreditation controls

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-05
* Category: Workflow

## Context and Problem Statement

Brokers submit Job Orders against consignees. KTC must control who can transact and which consignees are valid, with proper documentation (accreditation). The question is what gating to enforce between self-registration and the ability to submit job orders.

## Decision Drivers

* Brokers self-register but must be vetted before transacting.
* Consignees must be accredited with real documents (TIN, BIR 2303) before use.
* Job orders must only target approved consignees.
* Controls must be backend-enforced and auditable.

## Considered Options

* **Option A** — Two approval gates: broker approval + consignee accreditation, both admin-controlled, with required accreditation fields.
* **Option B** — Trust-on-registration; moderate after the fact.
* **Option C** — Approve brokers only; treat all imported consignees as usable.

## Decision Outcome

Chosen option: **Option A**. A broker self-registers (email + password + full name + valid-ID upload to the `valid-ids` bucket) and lands in `pending`; an admin approves them before they get broker-portal access. Consignees require admin approval, and an accreditation cannot be approved without **name + address + TIN + a 2303 document** attached. Job orders may only be submitted against approved consignees. Admin consignee management includes search, pagination, edit/delete, duplicate guards (friendly `23505` errors), and auto-generated codes.

### Positive Consequences

* No un-vetted broker can transact; no un-accredited consignee can be used.
* Accreditation documents are captured and viewable by admins (signed URLs).
* Clear, auditable status transitions.

### Negative Consequences / Trade-offs

* Manual approval is a human bottleneck (acceptable; "approve all pending" helps for bulk).
* 2,488 imported consignees start un-accredited and need processing over time.

## Pros and Cons of Options

### Option A: Two gates + required accreditation (chosen)

* Good, because vetting + documentation before transacting.
* Bad, because manual approval workload.

### Option B: Trust-on-registration

* Bad, because lets un-vetted brokers and undocumented consignees transact.

### Option C: Broker-only approval

* Bad, because skips consignee documentation entirely.

## Related ADRs

* Extends [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md)

## References

* `supabase/migrations/0003_broker_account_approval.sql`, `0008_consignee_approval.sql`, `0009_consignee_accreditation_docs.sql`
* `src/admin/Consignees.tsx` · `src/components/Shell.tsx` (pending gate)
