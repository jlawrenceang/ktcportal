---
title: Home
tags: [index]
type: home
last_updated: 2026-07-01
---

# KTC Portal Knowledge Home

KTC Container Terminal Corp. — the **KTC Online Portal** for port / container-terminal operations. Accredited customers (customs brokers) submit Job Orders (X-Ray, DEA exam, OOG stripping) against consignees; KTC staff (owner + admin/operations/cashier/checker/csr) run a separate admin portal on an owner-tunable [[Staff Roles & Gates|permission matrix]].

## At a glance (update every session)

| Metric | Value |
|---|---|
| Version | `v2.0.11+` live on `portal.ktcterminal.com` after July 1 go-live hardening; runtime footer still reports `v2.0.11`, latest deployed commit `830bd2a` |
| Migrations | **~236 files** (`0001` ... `0236`), all tracked (split portal + fuel lanes); `0228`-`0232` applied 2026-06-30; `0233` bulletin archive + `0234` tariff images + `0235` email-change flow + `0236` trusted MFA sessions applied to prod and mirrored to sandbox 2026-07-01 |
| Public face | signed-out `/` = a public **Landing** (terminal-photo hero); **Lara** non-LLM customer assistant; **"Continue with Google"** sign-in |
| Access hardening | pending customers **verify-only** at the RLS layer (`0163`); consent **server-enforced** (`0162`); disposable-email block (`0164`) |
| Staff roles | admin · operations · cashier · checker · csr (+ owner / root owner) — gated by `has_permission`. `purchaser` (fuel desk) exists in the DB but is **frontend-deferred** |
| Completion | **two-gate** - all services done + every billed, non-reversed `charges` row confirmed; cleared-for-release state follows the charge/payment-order spine |
| Active focus | **ADR-0037 charges cutover SHIPPED + go-live hardening DEPLOYED; internal Android staff-app lane shipped; July 1 blind-walkthrough hardening shipped through migration `0236`.** Charges/payment-orders are the live money path; route/menu transitions and trusted-MFA are now in the latest deployment. Native cloud push is scaffolded but dormant until a valid Supabase PAT + Firebase/native-push secrets are armed. **Now: execute ST08** - latest July 1 rows first, then all-roles/all-lanes and Android Part 15. Fuel still parked after Phase 0. |
| Go-live gate | `docs/smoke-test-08-go-live.md` (ST08 active/current; all roles + Android internal app lane + July 1 hardening rows) + `docs/go-live-todo.md` + independent review `docs/audits/2026-07-01-go-live-hardening-independent-review.md` - done: ADR-0037 cutover, v2.0.7-v2.0.11+ engineering hardening, Google OAuth flag enabled, MFA enrolled, owner password rotated. Still: ST08 execution, real-device APK smoke, Agreement v4 counsel pass + NPC/DPO, payment details (bank/GCash/QR), owner side-by-side smoke walk, launch call |
| Prod data | test data purged 2026-06-23 — first real order = `JO-000001` (0 orders / 0 customers / 0 releases) |

## Where the rules and memory live

KTC uses a layered documentation system:

- **Repo constitution** — `CLAUDE.md` + `AGENTS.md` (Codex mirror). Immutable top-level rules.
- **System map** — `docs/architecture-overview.md`: one-screen structural overview (topology, backend-enforced access model, the two spines, module/route map). Links out to live figures + detailed flows.
- **Modular instruction reference** — `docs/agent/*` (in the repo). Durable, path-retrievable detail: release gate, runtime data safety, workflow invariants, coding guardrails, testing, tooling, memory policy, doc governance.
- **Decision history** — `docs/adr/*`.
- **Live memory (this vault)** — current state, roadmap, pending items, per-core pages, sessions, milestones.

Rule of thumb: if you are asking *"what is the rule?"* open `docs/agent/*`. If you are asking *"what is live right now, what's next, what did we ship?"* open this vault.

## Start here

**New here?** Read [[Business Context]] first — who we are, who uses it, and what we're building (business background + product scope).

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
- [[Localization (i18n)]] · [[Mobile & Tablet UX]] · [[Lara (Customer Assistant)]]
- [[Job Order Lifecycle]] — full state machine (source of truth)

## Documentation governance

- Runtime code and migrations are source of truth.
- Rules live once — in `docs/agent/*`. The vault points, does not restate.
- Session notes are append-only under `06-Sessions/`.
