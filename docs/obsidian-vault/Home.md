---
title: Home
tags: [index]
type: home
last_updated: 2026-06-13
---

# KTC Portal Knowledge Home

KTC Container Terminal Corp. — the **KTC Online Portal** for port / container-terminal operations. Accredited customers (customs brokers) submit Job Orders (X-Ray, DEA exam, OOG stripping) against consignees; KTC staff (owner/admin/cashier/checker) run a separate admin portal.

## At a glance (update every session)

| Metric | Value |
|---|---|
| Version | **v1.1.0** (live on `portal.ktcterminal.com`) |
| Migrations | **55** (`0001` … `0055`), all applied + tracked |
| Smoke test | **ST02 in progress** — preflight P1–P8 ✅; manual Lanes 1–8 + P9 underway |
| Playwright | 16/16 (11 smoke + 5 authenticated; 4 mutation lanes `fixme`) |
| Go-live gate | ST02 closeout · Agreement v2 counsel sign-off · launch call |
| Prod data | wiped 2026-06-12 — first real order = `JO-000001` |

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

- [[Owner Failsafe]]
- [[CAPTCHA Bot Protection]]
- [[RLS Posture]]
- [[Broker Agreement]]
- [[visionOS Design System]]

## Documentation governance

- Runtime code and migrations are source of truth.
- Rules live once — in `docs/agent/*`. The vault points, does not restate.
- Session notes are append-only under `06-Sessions/`.
