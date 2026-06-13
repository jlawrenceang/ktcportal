---
title: Terminal & Depot Operating System (North Star)
tags: [future, vision, tos, north-star]
type: vision
status: directional
last_updated: 2026-06-13
---

# 🧭 Terminal & Depot Operating System — North Star

> **The endgame.** KTC is a **container terminal + port-services + container-depot** operator. The [[Current State|Online Portal]] so far solved the **queuing problem for ancillary / special services** (X-Ray, DEA, OOG) — that is *one module*, not the system. The endgame is to **create / upgrade KTC's existing TOS into a Navis-style terminal + depot operating system** on the same web stack.
>
> **Reference class: Navis Octopi, not N4.** Octopi is the cloud SaaS TOS for ~100k-TEU/yr terminals — almost exactly KTC's profile. Copy Octopi's scope; consciously skip N4's enterprise optimization/automation. Full grounded brief: `docs/research/navis-tos-landscape-2026-06-13.md`. Decision recorded in **ADR-0015**.

## Why this is credible (and where the gap is)

KTC's portal today ≈ the **customer front-door** (a layer competitors like Tideworks sell separately as "Forecast" — KTC already has it) **+ a special-services request & billing layer**. The stack is already the right one (Supabase Postgres + RLS + SECURITY DEFINER RPCs; React SPA; role model; manual review patterns; per-service pricing; serving queues).

**But the container itself is off-system.** There is no authoritative container record and no move/event ledger — so today it's a queuing app, not a TOS. **That data spine is the next build; every other module is a projection over it.**

## The module map (what a TOS is)

One authoritative **container record** with these modules hanging off it: **container inventory/lifecycle (the spine)** · vessel/berth + stowage · **yard planning** · **gate + EIR** · rail · equipment/labor work-queues · **billing/tariffs** (storage/demurrage, reefer, VAS) · reefer/IMDG/KPIs · **EDI integration**. The **depot M&R** side adds the **survey → EOR → line-approval → repair → release** loop (+ reefer PTI, per-line stock by ISO-type/grade) — the heart of depot software, with no equivalent in a pure terminal TOS.

## Modular roadmap (Octopi-style)

**Phase 0 — the spine (first, non-negotiable):** `containers` (keyed on ISO 6346 number + size/type + owner line + grade, with check-digit validation), an append-only `container_events`/`moves` ledger, and the **EIR** record. Bake reefer/hazmat + KPI fields in from day one.

Then, sequenced and tied to the three pillars:

| Phase | Module | Pillar | Why it fits KTC's patterns |
|---|---|---|---|
| 1 | **Gate + e-EIR** (ISO damage coding + photos) | Depot + Terminal | reuses the valid-ID upload+review pattern; extends the checker flow |
| 2 | **Depot M&R** (surveys, EOR + lines, work orders, PTI, stock-by-line) | Depot | survey→EOR→approval→repair→release mirrors serving-number + payment-proof review; RLS scopes each line to its own boxes like customers today |
| 3 | **Yard inventory + visual map + storage clock** | Terminal + Depot | rule-based decking, rehandle tracking |
| 4 | **Billing/tariffs generalization** | All three | extend `service_rates` into handling/storage/demurrage/reefer/VAS |
| 5 | **Equipment/labor work queues** | Terminal | grow the serving-number queue into per-CHE queues |
| 6 | **KPIs/BI dashboards** | All three | reads the event ledger |
| 7 | **Integration adapters** (EDIFACT as internal state first) | All three | COPRAR/BAPLIE in → COARRI/CODECO out; COEDOR → Frappe; DESTIM → depot EOR; reconcile **e2m** (live at Davao) |

## Do NOT attempt early (copy Octopi's omissions)

Seaside stowage optimization (Autostow/crane-split) · a full EDI suite up front (start manual + portal + CSV import; add per-carrier EDI only on demand — **EDI is the single biggest hidden cost**) · automated equipment control (routing/RTG optimization/AGV) · optimizer-based yard decking · rebuilding the **official BIR invoice** (stays in the [[Current State|Frappe ERP]]) · full PCS membership.

## Open questions (decide before sequencing)

1. **What is KTC's *existing* TOS today** — vendor product / in-house / manual + spreadsheets? Decides **create-vs-upgrade** and the migration/integration path. *(Asked of the owner 2026-06-13.)*
2. Which pillar hurts most first — **terminal ops, depot M&R, or billing**? Drives whether Phase 1–2 lead with the depot vertical.
3. Cargo scope — container-only, or **mixed/general cargo** (Master-Terminal-style)? Affects the spine's data model.

## Provenance

Grounded by an **ultracode multi-agent research run (2026-06-13)** — 5 facet researchers → adversarial fact-check of 14 claims (13 confirmed, 1 refuted: *PowerYard is a third-party e4Score YMS, not a Navis product*). Source of record: `docs/research/navis-tos-landscape-2026-06-13.md`. Decision: **ADR-0015**.

## Related

- `docs/research/navis-tos-landscape-2026-06-13.md` — full brief (module map, depot, EDI, glossary)
- [[Current State]] · [[Roadmap]] · [[Home]]
