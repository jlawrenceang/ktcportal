---
title: Home
tags: [index]
type: home
last_updated: 2026-06-07
---

# KTC Portal Knowledge Home

KTC Container Terminal Corp. — a **port / container-terminal operations** portal. Brokers submit Job Orders (X-ray, DEA exam, OOG stripping, gate/yard requests) against their approved consignees; KTC staff run a separate admin portal.

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
