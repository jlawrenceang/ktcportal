# ADR-0028: Rename brokers to customers (single customer pool)

* Status: Accepted
* Deciders: owner
* Date: 2026-06-25 (retroactively captured; the rename shipped at migration `0021`)
* Category: Database | Workflow

> Retroactively captured 2026-06-25 from runtime + the self-audit (the rename shipped at migration 0021 but was never ADR'd). Code identifiers (`useBroker`, `BrokerStatus`, `Broker.company_name`) keep the `broker` token — **read broker = customer**.

## Context and Problem Statement

The portal launched modeling external accounts as "brokers" (ADR-0001/0005/0007). As the model matured, those accounts are simply the terminal's **customers** (customs brokers acting for consignees), and per-broker consignee accreditation was already disabled (ADR-0007). Keeping "broker" as the entity name diverged from how the business actually talks. Should the entity be renamed, and how much churn is justified?

## Decision Drivers

* Terminology should match the business — customers, not brokers.
* A single customer pool is simpler than per-broker scoping.
* Minimize churn in the substantial code that already says "broker".

## Considered Options

* **A** — keep `brokers` everywhere.
* **B** — rename fully (table + UI + all code identifiers).
* **C** — rename the DB table to `customers` + say "customer" in docs/UI; keep the `broker` token in code as a deliberate alias.

## Decision Outcome

Chosen option: **C**. Migration `0021` renamed the `brokers` table to `customers`; the model is a single customer pool; docs and UI say "customer". Code identifiers retain the `broker` token as a deliberate alias to avoid a churny, risk-prone repo-wide rename. Read **broker = customer** throughout.

### Positive Consequences

* Business-aligned terminology; simpler single-pool model.
* No risky mass code rename.

### Negative Consequences / Trade-offs

* A standing code-vs-docs terminology split (`broker` in code, `customer` in docs/UI) — a reader-confusion cost, mitigated by a documented "broker = customer" note in Architecture + the Brokers core.

## Pros and Cons of Options

### A — keep brokers
* Good, because zero work.
* Bad, because docs/UI keep misnaming the entity vs the business.

### C — rename table + alias in code
* Good, because business-aligned with minimal churn.
* Bad, because leaves a code/docs terminology split to document.

## Related ADRs

* Refines [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md); supersedes the broker-framing of [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md) / [ADR-0007](0007-disable-per-broker-consignee-accreditation.md).

## References

* Migration `0021`; `07-Memory/System Scale.md` ("customers (renamed from brokers, 0021)"); `01-System/Business Context.md`.
