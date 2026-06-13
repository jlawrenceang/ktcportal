# ADR-0015: Adopt an Octopi-class modular terminal + depot operating system as the north star, container/EIR spine first

* Status: Accepted
* Deciders: KTC owner (Jan Lawrence Ang)
* Date: 2026-06-13
* Category: Architecture

## Context and Problem Statement

KTC Container Terminal Corp. is a **container terminal, port-services, and container-depot operator** — not just the operator of a job-order portal. The current KTC Online Portal solved one real problem: the **queuing + billing of ancillary / special services** (X-Ray, DEA, OOG) for customs-broker customers. The owner's stated endgame is to **create / upgrade KTC's existing TOS into a system "similar to Navis."**

Navis spans a wide product range. The question this ADR answers: *what does "similar to Navis" concretely mean for a single mid-size operator on a modern web stack, and what do we build first?*

## Decision Drivers

* KTC is a **single mid-size operator** (~100k-TEU/yr scale), not a mega/automated multi-terminal.
* The current stack (Supabase Postgres + RLS + SECURITY DEFINER RPCs; React/Vite SPA on Vercel) is already cloud-SaaS-shaped.
* KTC's three business pillars include **depot M&R**, which has workflow needs (survey → EOR → line approval → repair → release) absent from a pure terminal TOS.
* The official BIR invoice/OR already lives in a separate **Frappe ERP** and must stay there.
* Domain reality (grounded by the 2026-06-13 research run): a TOS lives or dies on a **container data spine** and on **EDI integration** — and **EDI is the single biggest hidden cost** in the space.

## Considered Options

* **A — Clone Navis N4.** Build the full enterprise TOS (vessel autostow, crane split, automated equipment control, full EDI suite).
* **B — Octopi-class modular TOS, container/EIR spine first (chosen).** Match the cloud-SaaS scope of Navis Octopi, build the authoritative container record + move/EIR ledger first, then add modules (gate, depot M&R, yard, billing, KPIs, integration) incrementally — consciously skipping N4's optimization/automation.
* **C — Keep extending the portal feature-by-feature** without a container data spine.
* **D — Buy an off-the-shelf TOS/DMS** (Octopi, a depot-specific vendor, etc.).

## Decision Outcome

Chosen option: **B — Octopi-class modular TOS, container/EIR spine first.**

The **foundational build is the container data spine** — a `containers` record keyed on **ISO 6346 number + size/type + owner line + grade** (with check-digit validation), an **append-only `container_events`/`moves` ledger**, and the **EIR** document at each gate event — with reefer/hazmat/KPI fields designed in from day one. Every subsequent module is a projection over this spine.

Modules are then sequenced (full detail in the vision note + research brief), tied to KTC's three pillars, leading with **Gate + e-EIR** and the **Depot M&R** vertical because they map cleanly onto patterns KTC already has (upload+review, serving-number queues, manual approve/partial/reject, per-principal RLS scoping). An explicit **"do not attempt early"** list (seaside stowage optimization, a full EDI suite up front, automated equipment control, optimizer-based decking, rebuilding the BIR invoice, full PCS membership) keeps the build Octopi-scale, not N4-scale.

This ADR sets **direction and the first keystone**, not a committed delivery schedule. The current portal continues; the spine is the next architecture investment.

### Positive Consequences

* A single authoritative container record/ledger turns "a queuing app" into a real TOS and unlocks every other module without rework.
* Leading with Gate/EIR + Depot M&R delivers value to a pillar KTC **already operates**, reusing existing UI/RLS patterns.
* The "do not attempt early" list protects against the two classic TOS money-pits (premature optimization engines and a full EDI suite).
* Keeping the BIR invoice in Frappe avoids rebuilding a regulated system of record.

### Negative Consequences / Trade-offs

* The container spine is a substantial new data model and a real engineering investment before visible feature payoff.
* "Octopi-class, not N4" is a standing discipline — there will be pressure to add optimization/automation prematurely.
* Real carrier/customs EDI onboarding remains partner- and jurisdiction-dependent and is deferred, so early integration is manual/import-based.

## Pros and Cons of Options

### A — Clone N4
* Good, because it's the complete reference taxonomy.
* Bad, because it's a decade-scale enterprise program; wrong scale and cost for one mid-size operator.

### B — Octopi-class modular, spine first (chosen)
* Good, because it matches KTC's scale, stack, and pillars, and orders the work so the foundation comes first.
* Bad, because the spine is upfront work with deferred visible payoff.

### C — Keep extending the portal
* Good, because it's incremental and low-risk short-term.
* Bad, because without a container spine it never becomes a TOS — it accretes disconnected features.

### D — Buy off-the-shelf
* Good, because mature TOS/DMS products exist (Octopi, depot vendors).
* Bad, because it abandons KTC's existing portal/investment, recurring SaaS cost, and the bespoke fit for KTC's ancillary-services + Philippine (e2m/BIR) context. (Not foreclosed — can be revisited per open question #1 once the existing TOS is characterized.)

## Open questions (carried in the vision note)

* **What is KTC's existing TOS today** (vendor / in-house / manual)? Decides create-vs-upgrade and migration path.
* Which pillar leads — terminal ops, depot M&R, or billing?
* Container-only or mixed/general cargo (affects the spine's data model)?

## Related ADRs

* Extends the whole portal foundation — [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md) (two gated portals), [ADR-0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md) (backend-enforced access on a dedicated Supabase account).
* The existing services/billing layer it builds on — [ADR-0014](0014-admin-job-order-processing-and-printable-slip.md).

## References

* `docs/research/navis-tos-landscape-2026-06-13.md` — grounded research brief (Navis product map, TOS modules, depot M&R, EDI/data standards, gap analysis, roadmap, glossary).
* `docs/obsidian-vault/09-Future/Terminal & Depot Operating System (North Star).md` — the live vision note.
* Provenance: ultracode multi-agent research run, 2026-06-13 (5 facets, 14 claims fact-checked, 1 refuted).
