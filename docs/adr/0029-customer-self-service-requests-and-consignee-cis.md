# ADR-0029: Customer self-service consignee/vessel requests + consignee document model

* Status: Accepted
* Deciders: owner
* Date: 2026-06-25 (retroactively captured; shipped across migrations ~`0132`–`0139`, 2026-06-22)
* Category: Workflow | Database

> Retroactively captured 2026-06-25 from runtime + the self-audit; this flow shipped across migrations ~0132–0139 (2026-06-22) and was never ADR'd. The finer points of the consignee-accreditation reversal should be confirmed by the owner against `07-Memory/Current State.md`.

## Context and Problem Statement

Consignees were admin-entered, which made the admins a data-entry bottleneck, and the consignee record needed to carry its own customs/identity documents (TIN / 2303 / 2307). How should customer-submitted consignee/vessel additions and consignee documents be modeled without giving customers unchecked write access?

## Decision Drivers

* Reduce admin data-entry load — let customers self-serve consignee/vessel requests.
* Keep a staff review gate (no unchecked customer writes to master data).
* Attach the customs/identity documents to the consignee.

## Considered Options

* **A** — admin-only consignee entry (status quo).
* **B** — free customer writes to consignees.
* **C** — customer-submitted **requests** with a staff review gate (`needs_info` on-hold) + consignee-level document fields.

## Decision Outcome

Chosen option: **C**. Consignees gained request columns (`requested_by` / `requested_at`, `note`, `doc_2307_path`, a `needs_info` status; migrations ~`0132` / `0138` / `0139`); customers self-file consignee/vessel requests; staff review (approve / needs-info). The earlier per-broker accreditation experiment was reverted in favor of the master consignee pool + consignee-level documents (the "0133 → 0136 reversal" the audit flagged).

### Positive Consequences

* Less admin entry; customer self-service; customs docs live on the consignee.

### Negative Consequences / Trade-offs

* Adds a staff review queue.
* The accreditation model churned (built then reverted) before settling — the final shape is whatever `Current State.md` records, not the intermediate migrations.

## Pros and Cons of Options

### A — admin-only entry
* Good, because fully controlled.
* Bad, because admins are the bottleneck.

### C — requests + review gate
* Good, because self-service with a control gate + documents on the consignee.
* Bad, because adds a review queue; the path to it churned.

## Related ADRs

* Refines [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md) / [ADR-0007](0007-disable-per-broker-consignee-accreditation.md); extends [ADR-0013](0013-customer-account-self-service-and-reverify-on-name-change.md).

## References

* Migrations ~`0132`–`0139`; `07-Memory/System Scale.md` (consignee request cols); `07-Memory/Current State.md` (2026-06-22).
