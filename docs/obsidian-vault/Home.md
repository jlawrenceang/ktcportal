---
title: Home
tags: [index]
type: home
last_updated: 2026-06-23
---

# KTC Portal Knowledge Home

KTC Container Terminal Corp. — the **KTC Online Portal** for port / container-terminal operations. Accredited customers (customs brokers) submit Job Orders (X-Ray, DEA exam, OOG stripping) against consignees; KTC staff (owner + admin/operations/cashier/checker/csr) run a separate admin portal on an owner-tunable [[Staff Roles & Gates|permission matrix]].

## At a glance (update every session)

| Metric | Value |
|---|---|
| Version | `v1.6.12` live on `portal.ktcterminal.com` |
| Migrations | **149 files** (`0001` … `0158`), all applied + tracked (split portal + fuel lanes) |
| Staff roles | admin · operations · cashier · checker · csr (+ owner / root owner) — gated by `has_permission`. `purchaser` (fuel desk) exists in the DB but is **frontend-deferred** |
| Completion | **two-gate** — all services + base payment + RPS (if needed) + every supplement, all confirmed; derived "✓ Cleared for release" badge |
| Active focus | portal / job orders. **Fuel monitoring** ([[ADR-0025]]) parked after Phase 0 (schema live, no UI) |
| Go-live gate | ST05 closeout (Lanes A–K + Defect D-01) · Agreement counsel sign-off · launch call |
| Prod data | test data purged 2026-06-23 — first real order = `JO-000001` (0 orders / 0 customers / 0 releases) |

## Where the rules and memory live

KTC uses a layered documentation system:

- **Repo constitution** — `CLAUDE.md` + `AGENTS.md` (Codex mirror). Immutable top-level rules.
- **Modular instruction reference** — `docs/agent/*` (in the repo). Durable, path-retrievable detail: release gate, runtime data safety, workflow invariants, coding guardrails, testing, tooling, memory policy, doc governance.
- **Decision history** — `docs/adr/*`.
- **Live memory (this vault)** — current state, roadmap, pending items, per-core pages, sessions, milestones.

Rule of thumb: if you are asking *"what is the rule?"* open `docs/agent/*`. If you are asking *"what is live right now, what's next, what did we ship?"* open this vault.

## Start here

1. [[Current State]] — what is live right now (runtime-aligned snapshot)
2. [[Roadmap]] — phased plan (Now / Next / Later / Parked)
3. [[Pending Items]] — backlog
4. [[Completed Milestones]] — shipped history
5. [[System Scale]] — counts (migrations, consignees, routes)
6. [[Architecture]] — layer + domain map
7. [[Runtime Target]] — pointer to runtime-data-safety

## ⭐ North star

- [[Terminal & Depot Operating System (North Star)]] — the endgame: grow the portal into an Octopi-class **Navis-style terminal + depot operating system** (ADR-0015). The portal today solved ancillary-services queuing; the container/EIR data spine is the next foundation.

## Core modules

- [[Authentication]]
- [[Brokers]]
- [[Consignees]]
- [[Job Orders]]
- [[Administration]]

## Key concepts

- [[Staff Roles & Gates]] · [[Multi-Owner & Root Grants]] · [[Owner Failsafe]]
- [[Two-Gate Completion]] · [[Additional-Charge Supplements]] · [[Verify-QR Anti-Forgery]]
- [[Comment Visibility & Escalation]] · [[Cashier Station]] · [[Support Tickets]] · [[Staff Notifications]]
- [[CAPTCHA Bot Protection]] · [[RLS Posture]] · [[Broker Agreement]] · [[visionOS Design System]]
- [[Localization (i18n)]] · [[Mobile & Tablet UX]]
- [[Job Order Lifecycle]] — full state machine (source of truth)

## Documentation governance

- Runtime code and migrations are source of truth.
- Rules live once — in `docs/agent/*`. The vault points, does not restate.
- Session notes are append-only under `06-Sessions/`.
