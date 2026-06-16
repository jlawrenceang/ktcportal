# ADR-0022: The gate pass is a container/EIR-level artifact, not derived from the Job Order; the gate module is deferred

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Architecture | Workflow

## Context and Problem Statement

The self-verifying slip (ADR-0019) gives every Job Order a public QR that confirms PAID/COMPLETED live from the DB, with a consignee + container cross-check. That made the JO slip look like it could *be* the terminal's **gate pass** — the document a guard checks to release a truck. The question: should the gate pass be derived from the Job Order, and should we build the gate (release) action now for launch?

The realization that settled it: **a Job Order only exists for the subset of containers that need a special service** (X-ray / DEA / OOG). **Most containers gating in and out of the terminal have no JO at all.** A pass derived from the JO could never cover the ordinary container. We needed to fix the architectural home of the gate pass before any gate logic is built.

## Decision Drivers

* Coverage — the gate pass must apply to **every** container move, not just the JO'd service subset.
* Granularity — a JO **spans several container vans**, but a gate crossing is **per van / per truck**; tracking must be container-grained.
* The JO is a *service + billing* overlay, not the terminal's container record of truth.
* Launch scope — the pre-launch walkthrough needs the slip to be *verifiable*, not an *enforced* gate; the gate action layer (logging, holds, single-use) is real scope.
* Forward-compatibility — whatever ships now must not have to be re-issued when the gate module lands.
* North star — the container/EIR data spine is already the planned foundation (ADR-0015).

## Considered Options

* **A — Make the JO the gate pass.** Rejected: leaves every non-JO container with no pass; wrong grain (per-JO vs per-van).
* **B — Gate pass is a container/EIR-level artifact in its own module; the JO links to it as a service overlay (chosen).**
* **C — Build the full guard/gate action layer now for launch.** Rejected for launch: deferred behind verify-only.

## Decision Outcome

Chosen option: **B**, with the gate **action** layer **deferred** (launch ships verify-only).

**Gate pass is keyed on the container (EIR), not the JO.** It belongs to the gate/yard module of the container/EIR data spine (ADR-0015), exists for every container move, and is tracked per van/truck. The **JO is a service overlay**: when one exists, the gate module *cross-references* it (e.g. "don't gate-out until this container's X-ray JO is paid + cleared"); when none exists, the container gates through the normal flow. Containers without a JO are out of scope for the current services portal.

**Dual sign-off = the existing two-gate, made explicit.** A pass is "clear for release" only when **operations/checker** sign off (services done — the Checker's per-van X-ray e-signature + operations' RPS/other services) **and the cashier** signs off (all balances — base + RPS + every supplement). This is exactly the backend-enforced two-gate completion (ADR-0016); the gate module would render the two clearances as explicit, logged e-sign-offs on the pass, mirroring the X-ray e-signature.

**Launch = verify-only.** The product ships the read-only verification QR (ADR-0019). The gate **action** layer — guard/security role, `gate_events` log, one-way-per-trade gate-in/gate-out, single-use / anti-passback, and the enforced "hold on pending balance / no cashier clearance" — is deferred to the TOS build. No guard role exists yet. Full plan: `docs/obsidian-vault/09-Future/Gate Module (gate-in-out).md`.

### Positive Consequences

* The gate pass has a correct, durable home (the container/EIR spine) that scales to all container moves, not just the JO'd subset.
* The verify-QR shipped now is forward-compatible — the gate module layers the *action* onto the same scan without re-issuing slips.
* Launch scope stays tight (verification only); the dual-sign-off semantics are already enforced by the two-gate, so the future gate module inherits a sound foundation.

### Negative Consequences / Trade-offs

* The gate module depends on an EIR/container spine that does not exist yet — it cannot be built until that foundation lands.
* Until then, "gate pass" for non-JO containers remains a paper/manual process outside the portal.
* The JO slip is a *verifiable* pass but not an *enforced, single-use* one — a guard could still wave a truck through without scanning (no record), pending the gate module.

## Related ADRs

* Extends [ADR-0015](0015-modular-terminal-depot-operating-system-north-star.md) — the container/EIR spine the gate pass belongs to.
* Builds on [ADR-0019](0019-public-verify-qr-anti-forgery.md) — the verify-QR that the deferred gate action layers onto.
* Relies on [ADR-0016](0016-staff-roles-split-gates-two-gate-completion.md) — the two-gate completion that the dual ops/cashier sign-off makes explicit.

## References

* `docs/obsidian-vault/09-Future/Gate Module (gate-in-out).md` (full deferred plan)
* `docs/obsidian-vault/09-Future/Terminal & Depot Operating System (North Star).md`
* `supabase/migrations/0089_verify_job_order.sql`, `0090_verify_payment_and_containers.sql` (the verify-QR foundation)
* `src/pages/Verify.tsx` (public `/verify/:id`), `src/pages/JobOrderPrint.tsx` (slip QR)
