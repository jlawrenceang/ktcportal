# ADR-0037: Model every operational move as a Job Order, with Payment Orders and 1:1:1 invoicing

* Status: Accepted (ratified by the owner 2026-06-29)
* Deciders: Owner (Jan Lawrence Ang), engineering
* Date: 2026-06-29
* Category: Architecture
* Build note: ratified for a pre-launch build. The A→B→C→D phasing stands; the one open sequencing choice — **fold B into A** (RPS + add-on charges become standalone JOs from day one) vs. **A-then-B** — is to be finalized at Phase A kickoff (next session). Phase A is the go-live requirement.

## Context and Problem Statement

BIR compliance requires that **every money transaction carry both an ERP (Frappe) invoice and a BIR invoice** — no money confirmed without both. Today only the base JO / base release payment captures invoice numbers (`service_invoice_no`, `invoice_pad_no`, release `or_number`); **RPS** (a column block on `job_orders`) and **add-on charges** (`jo_supplements` / `release_supplements` sub-rows) can be confirmed with no invoice at all. The 2026-06-29 security audit surfaced this (finding #4); v1.7.3's `0201` patched it for the **base only** (RPS deliberately exempt, because RPS has no invoice field to require). Separately, the north-star (ADR-0015) is a Navis/Octopi-class terminal OS whose foundation is an authoritative **move ledger**. How do we model charges so every one is fully invoiced **and** the model becomes that move spine?

## Decision Drivers

* **Compliance by construction** — every charge must produce an ERP + BIR invoice; the model should make a no-invoice charge *impossible*, not guarded-against.
* **The move-ledger foundation** (ADR-0015) — the same unit should serve operations and billing.
* **Keep operations atomic; put billing flexibility on the cashier side** — ops should be simple and unambiguous; how money is *collected* is a billing concern.
* **Hard payment-before-movement control** — KTC does not release the van + papers without payment.
* **Pre-launch timing** — the portal is not live yet (seed/test data only, no real customer transactions), so reshaping the data model **now** is a clean rebuild that costs a fraction of the same change after go-live. This is a reason to do it *before* launch.

## Considered Options

* **A — Bolt invoice fields onto RPS + supplements.** Extend the current sub-row model with ERP/BIR fields + gates.
* **B — Job Order as the atomic operational + billing unit.** Every move is its own JO with its own invoice; Payment Orders bundle JOs for collection. *(chosen)*
* **C — Defer.** Keep base-only invoicing for go-live; revisit later.

## Decision Outcome

Chosen: **Option B — the Job Order is the atomic operational + billing unit.**

The model, stated crisply:

1. **Every operational move is its own Job Order** — X-ray, RPS, DEA, OOG stripping, shifting, trucking, lift-on, storage, **and** release/pull-out. The JO is the universal "billable operational event."
2. **JO : ERP invoice : BIR invoice = 1:1:1 (rigid).** Each JO carries exactly one ERP invoice + one BIR invoice. An invoice runs **draft → final**: the *draft* is the computed payable shown to the customer; the *final* is the official ERP + BIR document; **payment is confirmed only against the final** (both numbers present).
3. **Payment Order : JO = 1-to-many.** The Payment Order is the **cashier's collection unit** and may bundle several **whole** JOs (a customer paying multiple JOs at once). A JO is **never split** across payment orders, and there are **never more payment orders than JOs** (count ≤ JO count). Invoices stay **per-JO**; the payment order merely references the JOs it collects.
4. **Payment-before-movement (hard control).** A release/pull-out JO's container + papers are gated on payment. The **gate enforces this physically and bidirectionally**: at **both** gate-in (deposit/return) and gate-out (pull-out), a container with **any** unpaid charge-JO is **held** until paid.
5. **"Supplements" are retired.** An additional charge is simply **an additional JO linked to its parent** (its own invoice + its own payment), reusing the existing `parent_job_order_id`.
6. **Charge/move-only JOs** (no physical service — e.g. RPS, a fee) **skip the serving/X-ray queue** — they are billing-only.

### Positive Consequences

* **Compliance by construction** — a charge can't exist without its JO, and a JO can't be paid without both invoice numbers. The audit's supplement/RPS invoice gaps become structurally impossible.
* **One billing pipeline** — no separate supplement code path; fewer places to get it wrong (the 0194/0199 supplement guards become unnecessary).
* **Clean per-move audit trail** — each charge is a discrete, traceable document chain.
* **Move-spine foundation** — this is the atomic unit the whole terminal-OS roadmap (ADR-0015) builds on.

### Negative Consequences / Trade-offs

* **More JOs** — every move/charge is a JO; needs parent-linking (have it) and a queue-skip for charge-only JOs (new).
* **A model reshape** — the RPS column block and supplement sub-rows become standalone linked JOs. But because the portal is **pre-launch** (seed/test data only, no real transactions), this is a **clean drop/rebuild + re-seed**, not a delicate in-place migration — and far cheaper now than it would ever be after go-live, which is itself an argument for building it before launch.
* **A new cashier layer** — the Payment Order is a new entity + UI.

## Pros and Cons of Options

### Option A — bolt invoice fields onto RPS + supplements
* Good, because it's the smallest change and ships fastest.
* Bad, because it keeps **two billing concepts** forever (JO payment + supplements), each needing its own invoice gate — the exact split that produced the audit gaps. It does nothing for the move spine.

### Option B — JO as the atomic move *(chosen)*
* Good, because compliance is structural, there's one billing path, and it doubles as the move-ledger foundation.
* Bad, because it's the largest change and needs a careful phased migration off the live model.

### Option C — defer
* Good, because go-live isn't blocked on the full model.
* Bad, because launching with money confirmable on RPS/add-ons **without** a BIR invoice is a compliance risk; technical debt compounds.

## Migration path (pre-launch clean reshape · phased)

The portal is **pre-launch** — only seed/test data on prod, no real customer transactions. So this is **not** a delicate in-place migration: each phase is a **clean reshape** — drop and rebuild the JO / payment / supplement / RPS structures and **re-seed** test data, rather than preserving live rows. Doing this **now, before go-live, is far cheaper than ever after** — and is itself a reason to ratify + build it before launch.

* **JO generalizes:** `service_request` widens from {X-ray, DEA, OOG} to all move types; add a `move_type`/category; flag charge-only types to **skip `serving_no`**.
* **Parent link already exists:** `job_orders.parent_job_order_id` (built for re-X-ray children) is reused to link add-on JOs to their parent — no new linking primitive needed.
* **Per-JO invoice consolidation:** `service_invoice_no` / `invoice_pad_no` / release `or_number` → a clean **`erp_invoice_no` + `bir_invoice_no`** (+ a draft/final state) **per JO**.
* **RPS → its own JO:** the `rps_payment_*` column block on `job_orders` is **dropped** and rebuilt as a standalone linked JO of type `rps` — no live rows to backfill; re-seed test data.
* **Supplements → linked JOs:** `jo_supplements` / `release_supplements` are **dropped**; add-on charges become standalone additional JOs linked to the parent.
* **Payment Orders:** a new `payment_orders` table (cashier collection unit) + a `payment_order_id` on `job_orders` (1:N); the invoice/confirm gate moves to the payment-order ↔ per-JO invoice.
* **Gate-hold:** a container's unpaid charge-JOs block it at **both** gate-in and gate-out (extends ADR-0022's hold-on-balance).

## Proposed phasing (a proposal for the owner to refine)

* **Phase A — Payment Orders + per-JO ERP+BIR invoicing (draft→final) + the cashier-side confirm gate**, for *today's* JO types. Closes the compliance gap with no operational change; lowest risk; go-live-grade.
* **Phase B — RPS + add-on charges become standalone linked JOs** (retire the RPS column block + the supplement tables); charge-only JOs skip the serving queue.
* **Phase C — Generalize the JO to all move types** (shifting / trucking / lift-on / storage …) — the move ledger.
* **Phase D — The physical gate module** (gate-in + gate-out) with **bidirectional hold-on-balance** (delivers ADR-0022's deferred action layer on top of this model).

## Related ADRs

* **Extends** [ADR-0015](0015-modular-terminal-depot-operating-system-north-star.md) — this is the move-spine foundation of the terminal-OS north star.
* **Refines** [ADR-0035](0035-job-order-ops-overhaul-queue-priority-rexray-autocomplete-invoice-gate.md) — generalizes its base-payment invoice gate to *every* charge.
* **Required by** [ADR-0022](0022-gate-pass-is-container-eir-not-job-order.md) — the gate enforces this model physically (bidirectional hold-on-balance).
* **Relates to** [ADR-0036](0036-cash-basis-billing-consignee-payment-terms-deferrals.md) — cash-basis, payment-before-release.

## References

* The 2026-06-29 security audit (finding #4 — the invoice-gate bypass) and v1.7.3 `0201` (base-only patch; RPS exempt).
* Co-design conversation, 2026-06-29 (owner + engineering).

## Addendum 2026-06-29 — Phase A refinement: a uniform charge layer under the JO (not charge-as-JO)

At Phase A build kickoff the owner clarified that KTC's **existing TOS already owns the container move-ledger** (gate-in→gate-out); the portal carries only a **dormant** `container_cycles`/`container_events` scaffold as the future integration seam, and the immediate driver is the X-ray service + **discovered invoice fraud** (fictitious/copied invoices + unwarranted charges). Given that, the body's literal *"every add-on/RPS becomes its own linked Job Order"* is refined:

* The **Job Order remains the customer service request** (X-ray these vans; it owns the queue position, status, consignee).
* Each billable — base X-ray, RPS move, add-on — is a row in **one uniform `charges` table** hanging off the JO, individually carrying its **ERP + BIR invoice** (draft→final), payment, **maker-checker approval** (add-ons), attribution, and `payment_order_id`.
* **Payment Orders** bundle whole charges (N:1). `parent_job_order_id` is retained for genuine re-X-ray **child JOs**, not for charges.

**Rationale.** This preserves every Phase-A goal (one billing pipeline; invoice-before-confirm for *every* charge type; compliance + anti-fraud by construction; payment-order collection) and matches the four-layer shape **container → moves → charges → payment orders**, keeping *charge* and *move* as distinct concepts rather than re-collapsing them into the JO. Because the move ledger lives in the TOS (mirrored later via the dormant scaffold), charge-as-JO would add status/serving/consignee baggage + a queue-skip hack without buying the move-spine here. Net: charge=JO (body) → **charge=row-under-JO** (this addendum). Same intent, lighter realization, better layering for the pre-launch POC. The four anti-fraud controls — **authenticity** (QR-verifiable, server-issued), **authorization** (maker-checker), **accountability** (per-charge attribution), **reconciliation** (monthly containers×rate vs cash) — ride on this charge layer. Spec: `docs/specs/xray-phase-a-anti-fraud-billing.md`.
