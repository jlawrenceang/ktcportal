---
title: Home
tags: [index]
type: home
last_updated: 2026-06-29
---

# KTC Portal Knowledge Home

KTC Container Terminal Corp. — the **KTC Online Portal** for port / container-terminal operations. Accredited customers (customs brokers) submit Job Orders (X-Ray, DEA exam, OOG stripping) against consignees; KTC staff (owner + admin/operations/cashier/checker/csr) run a separate admin portal on an owner-tunable [[Staff Roles & Gates|permission matrix]].

## At a glance (update every session)

| Metric | Value |
|---|---|
| Version | `v2.0.10` live on `portal.ktcterminal.com` |
| Migrations | **~231 files** (`0001` … `0231`), all tracked (split portal + fuel lanes); `0228` (release-payable + container-cap 200) + `0229` (PO submitted/consignee guards) + `0230` (customer-only self-service guards) + `0231` (SMS activation safety) applied to prod 2026-06-30 |
| Public face | signed-out `/` = a public **Landing** (terminal-photo hero); **Lara** non-LLM customer assistant; **"Continue with Google"** sign-in |
| Access hardening | pending customers **verify-only** at the RLS layer (`0163`); consent **server-enforced** (`0162`); disposable-email block (`0164`) |
| Staff roles | admin · operations · cashier · checker · csr (+ owner / root owner) — gated by `has_permission`. `purchaser` (fuel desk) exists in the DB but is **frontend-deferred** |
| Completion | **two-gate** — all services + base payment + RPS (if needed) + every supplement, all confirmed; derived "✓ Cleared for release" badge |
| Active focus | **ADR-0037 charges cutover SHIPPED + codex-review fixes DEPLOYED — `v2.0.10`, migration `0231` applied** (the move-spine: every move = a JO; 1:1:1 ERP/BIR invoicing; Payment-Order N:1; payment-before-movement; supplements retired). Fully break-tested (gates/RLS/RBAC/writes hold). 2026-06-30 deploys: v2.0.7 (release charges payable, Verify-QR all-charge PAID, per-route admin guards, container cap 200) + v2.0.8 (PO can't bundle a proof-submitted charge, PO enforces one consignee, charge-audit/checker gate alignment) + v2.0.9 (customer-only self-service guards, operations app gate, Google OAuth flag) + v2.0.10 (SMS activation safety, customer SMS opt-out, Capacitor build readiness). **Now: go-live execution** — the all-roles/all-lanes manual smoke test (`docs/go-live-smoke-test.md`) + operational onboarding (DEA rate, staff/broker accounts). Fuel still parked after Phase 0. See [[target-architecture-jo-payment-invoice]] · memory `cutover-shipped-go-live-status` |
| Go-live gate | `docs/go-live-smoke-test.md` (all roles + all lanes) + `docs/go-live-todo.md` — done: ADR-0037 cutover, v2.0.7-v2.0.9 codex fixes (`0228`-`0230` applied), Google OAuth flag enabled, MFA enrolled, owner password rotated. Still: Agreement v4 counsel pass + NPC/DPO · payment details (bank/GCash/QR) · owner side-by-side smoke walk · launch call |
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
