---
title: Open Decisions
tags: [memory, decisions, register]
type: memory
last_updated: 2026-06-25
---

# 🗳️ Open Decisions Register

Decisions/questions awaiting the OWNER, grouped by what they unblock. Each has a **recommendation** so most can be confirmed quickly. Mark answers inline; move resolved items to the relevant ADR / spec.

> ⚠️ **Partially stale (last full pass 2026-06-13).** Go-live gate is now **ST05** (not ST02 — see [[Current State]]). Several rate/storage questions (B4/B5 rates, C7/D3 storage) are now addressed by **ADR-0024** (release/pull-out pricing) and **ADR-0027** (per-service rate granularity + tiered foreign storage). Re-confirm the still-open `(Owner: ___)` items; move resolved ones to their ADR.

## A. Blocking the current build (operations role + vessel schedule) — ✅ ANSWERED 2026-06-13

- **A1. Free-days setting — who edits it?** ✅ **ADMIN ONLY** (gated on `manage_pricing`, migration `0058`). Schedule *data* stays operations (`manage_vessel_schedule`).
- **A2. Vessel required on every JO?** ✅ **YES — vessel + voyage required** (from the dropdown).
- **A3. Import vs export?** ✅ **Build BOTH now.** *Follow-up needed:* export's storage clock has a different base date than import (discharge) — see C7.

- **C7. Export free-storage base date** — import = `finish_discharging + free_days_import`. What drives **export** free-storage — gate-in date? vessel cut-off? departure (ETD)? Needed to compute export `last_free_day`. Doesn't block the admin UI. *(Owner: ___)*

## B. RPS / DEA billing (next slice)

- **B1. Assessment universal or exception-triggered?** Rec: **exception-triggered** — pure X-ray flows straight through; only DEA/flagged JOs route to the assessor. Avoids the assessor becoming a chokepoint. *(Owner: ___)*
- **B2. Assessor — a step in operations, or its own role?** Rec: **a step inside operations**. *(Owner: ___)*
- **B3. Payment timing.** ✅ **RESOLVED** (2026-06-13, migrations 0063): **running balance** — Total = X-ray + RPS, pay each separately, Balance due = Total − Paid. **Release = (c)** X-ray done AND balance fully paid → "Cleared for release" badge (derived; cashier/gate stays the authority). *Follow-up: RPS-payment-rejected email not yet wired.*
- **B4. Combined "X-Ray + DEA" = base ₱2,918 + RPS per-move total?** Rec: **yes**. *(Owner: ___)*
- **B5. Move-type rates** — confirm Shifting ₱950.86 / Trucking ₱1,000 / Lift On ₱730.83 (from the sample invoice), and give **Stripping / Stuffing** (+ any others). *(Owner: ___)*

## C. Workflow / bottleneck tuning (shapes the queue + assessment design)

- **C1. Volume** — JOs / containers per day, average vs peak? *(Owner: ___)*
- **C2. Ops staffing** — how many operations people; split duties (scheduler / assessor / checker) or each does all? *(Owner: ___)*
- **C3. X-ray capacity** — lanes, ~containers/hour; is the machine the true constraint? *(Owner: ___)*
- **C4. Where customers file** — ahead/remotely, or at the terminal counter? *(Owner: ___)*
- **C5. Per-JO ops action** — does operations do something on *every* JO, or only the RPS ones? (Decides B1.) *(Owner: ___)*
- **C6. DEA frequency** — confirm it's genuinely rare. *(Owner: ___)*

## D. Strategic / TOS north star ([[Terminal & Depot Operating System (North Star)]], ADR-0015)

- **D1. What is KTC's *existing* TOS today** — vendor product / in-house / manual+spreadsheets? Decides **create-vs-upgrade** + migration path. **The big one.** *(Owner: ___)*
- **D2. After this slice, which pillar next** — terminal ops / depot M&R / billing? *(Owner: ___)*
- **D3. Storage/demurrage** — now that `last_free_day` is computed: surface the free-storage countdown to customers now? Bill demurrage after it later? Rec: **surface now (free, useful), bill later**. *(Owner: ___)*

## E. Go-live / ST05

- **E1. Plan** — build the modernization wave, *then* run ST05 on the final system? Rec: **yes** (we paused ST02 to build). *(Owner: ___)*
- **E2. Payment details** — bank / account / GCash / QR are still blank; needed for real payments + ST05 Lane E. *(Owner: ___)*
- **E3. Counsel sign-off** on Customer Agreement v2 (DPO, NPC registration, liability cap) — go-live gate. *(Owner: ___)*

## Related
- [[Pending Items]] · [[Roadmap]] · [[Job Order Lifecycle]] · `docs/reference/`
