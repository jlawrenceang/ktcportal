---
title: Objectives
tags: [memory, okr, goals]
type: memory
last_updated: 2026-06-25
---

# 🎯 Objectives (OKR-lite)

Measurable goals — 3 Objectives from launch to the **north-star endpoint** (a Navis-class terminal + depot operating system). KRs are falsifiable and double as `evals` targets. Execution detail + sequencing live in [[Roadmap]] / [[Pending Items]] — link, don't restate. The qualitative "what success looks like" + the north star are in [[Business Context]].

> Owner-owned. Re-cut when the active phase turns over.

## O1 — Launch the portal publicly *(NOW)*
- **KR1** — **ST05 closeout PASS** (Lanes A–K + Defect D-01 fixed) on live.
- **KR2** — **Payment details entered** (P9: bank / GCash / QR) → real online payment works end-to-end.
- **KR3** — **Customer Agreement v2 counsel sign-off** (DPO / NPC registration / liability cap).
- **KR4** — Prod-testing restriction removed; **first real external Job Order** (JO-000001+).

## O2 — Harden for real traffic *(post-launch)*
- **KR1** — 4 Playwright mutation `fixme` lanes implemented + Playwright wired into **CI**.
- **KR2** — Defect D-01 **server-enforced**; status-change notifications + JO drafts / document attachments shipped (or explicitly deferred).
- **KR3** — Per-customer accredited-consignee scoping live.

## O3 — Lay the first stone of the Navis-class TOS/ERP *(endpoint / north star)*
- **KR1** — Answer the gating question — **what is KTC's *existing* TOS today** (create vs upgrade) — recorded as an ADR.
- **KR2** — **Pillar 2 container/EIR move-logger spine**: Phase 1 (logger) go/no-go decided + scoped ([ADR-0015](../../adr/0015-modular-terminal-depot-operating-system-north-star.md) / [ADR-0022](../../adr/0022-gate-pass-is-container-eir-not-job-order.md)).
- **KR3** — Fuel monitoring (Phase 0 done) resumed, or consciously kept parked with a **dated** decision.

## Scoring
At period end, score each KR 0.0–1.0 (or hit/miss) with the evidence that proves it. Carry misses into the next period or [[Roadmap]].

## Related
- [[Roadmap]] · [[Pending Items]] · [[Business Context]] (what success looks like + the north star)
