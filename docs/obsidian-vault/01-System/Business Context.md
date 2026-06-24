---
title: Business Context
tags: [system, onboarding]
type: system
last_updated: 2026-06-24
---

# Business Context

> Canonical onboarding doc: **WHO** this serves + **WHY** it exists (stable, top half)
> and **WHAT** we're building (faster-moving scope, bottom half). Current-state and
> runtime-aligned. Module mechanics live in `02-Cores/` and `05-Concepts/`; link, don't
> restate. Live counts/version live in [[Current State]] — link, don't carry them here.
> Runtime wins: if the scope half disagrees with the route tree / migrations, this file
> is the bug — fix it in the **same** change.

## In one sentence

KTC Container Terminal Corp. runs the **KTC Online Portal** so accredited customs-broker
customers can transact port / terminal services online, while KTC staff process every
order through a backend-enforced workflow.

---

## WHO / WHY

### The company

- **Legal entity:** KTC Container Terminal Corp.
- **Line of business:** a **port terminal, container depot, and various port operations**
  (container handling, ancillary cargo services, depot / yard, release / pull-out).
- **Location / context:** **Davao, southern Mindanao, Philippines** (operates under the Data
  Privacy Act, R.A. 10173).
- **Tenancy:** **single-company / single-tenant by construction.** There is no
  `src/lib/company.ts` and no tenancy primitives anywhere — no `tenant_id` / `org_id` /
  `company_id` columns; the app is hardwired to one Supabase project. Do **not** introduce
  org scoping. (`Broker.company_name` in `src/lib/types.ts` is an individual customer's own
  business-name field, not a multi-company construct.)

> **Terminology note:** the code / DB say **broker** (table `brokers`, `BrokerStatus`,
> `useBroker`); newer docs and UI say **customer** (one customer pool). The drift is
> intentional — see [[Current State]]. Read "broker" and "customer" as the same actor.

### The problem this exists to solve

KTC's ancillary-service intake, payment, and cargo release previously ran on manual,
counter-bound and paper/sheet-era processes. The portal moves filing, payment (QRPH), and
release/pull-out online, with an anti-forgery verification slip, so customers transact
without queuing at the counter and staff process everything through enforced gates.

### Who uses it (personas)

| Persona | Internal / external | Comes here to… |
|---|---|---|
| Accredited customer (customs broker) | external | File Job Orders (X-Ray, DEA exam, OOG), request release / pull-out, pay online (QRPH) |
| Consignee (cargo owner) | external | Self-service consignee / vessel requests; the party a Job Order is filed against |
| admin · operations · cashier · checker · csr | internal | Process orders through two-gate completion; confirm payment; run stations |
| owner / root owner | internal | Tune the permission matrix; the server-only owner failsafe |
| purchaser (fuel desk) | internal | Exists in the DB but **frontend-deferred** — no UI yet |

> Staff-role enforcement (`has_permission` + `staff_transition_order`) lives in
> [[Staff Roles & Gates]] and [[Administration]] — link to it; do not duplicate the matrix.

### Customers / counterparties

The paying customers are **accredited customs brokers**, acting on behalf of **consignees**
(the cargo owners). Both are external; KTC staff are internal.

### What success looks like

Cargo cleared for release **online** — filed, paid, and verified through enforced gates with
a tamper-evident slip — instead of a counter queue and paper trail, with access-control
integrity never compromised for convenience.

---

## WHAT WE'RE BUILDING

### Product in one line

A backend-enforced, role-gated **port-services portal** on one Supabase DB — a single SPA
serving a customer portal and a staff admin portal.

### Shape of the system

One React + TypeScript SPA over Supabase (Postgres + Auth + RLS + SECURITY DEFINER RPCs)
serving **two role-gated portals** from one codebase
([ADR-0001](../../adr/0001-design-ktc-portal-as-two-gated-portals.md)). See
[[Architecture]] for the layer map and [[Tech Stack]] for the stack.

### Two pillars on one Supabase database

- **Pillar 1 — the KTC Online Portal (this repo, live).** Accredited customers file
  **Job Orders** for special / ancillary services (X-ray, DEA exam, OOG) and KTC staff
  process them. Plus the **release / pull-out** flow
  ([ADR-0024](../../adr/0024-customer-filed-online-release-pullout-payment.md)): customers
  file online — pick consignee + BL no. + upload **DO/BL** → **CSR** documents-desk
  verifies → staff enter charges → online pay (QRPH) → cashier confirms → **OR claimed at
  office** for pull-out. Customer-facing queue terms are **batch (filing day) +
  working-hours aging**, not a serving / priority number; the X-ray queue is an
  **operations** view (gate `view_xray_queue`), and the checker is the spotter who confirms.

- **Pillar 2 — Yard Operations (planned, not built).** An offline-first PWA **move logger**
  + a `moves` **event-log** spine from which inventory, container aging, bay occupancy, and
  per-equipment (billing) move counts are all **derived** (Postgres views), never
  hand-stored. This is the start of the container / EIR data spine
  ([ADR-0015](../../adr/0015-modular-terminal-depot-operating-system-north-star.md) /
  [ADR-0022](../../adr/0022-gate-pass-is-container-eir-not-job-order.md)). Full plan:
  [[Yard Operations — Pillar 2 (Move Logger + Yard)]]. Phases: 0 schema+views → 1 logger →
  2 inventory+aging → 3 yard map → 4 billing tie-in (`job_order_id` on billable moves) →
  5 planning sim → 6 vessel-schedule optimization. Principle: **derived over
  hand-maintained; planned vs actual strictly separate; ship each phase before the next.**

### North star

Grow the portal modularly into an Octopi / **Navis-class terminal + depot operating
system** — see [[Terminal & Depot Operating System (North Star)]],
[ADR-0015](../../adr/0015-modular-terminal-depot-operating-system-north-star.md), and the
research brief `docs/research/navis-tos-landscape-2026-06-13.md`.

### Modules / surfaces

| Surface | Status | One-line purpose | Core / concept |
|---|---|---|---|
| Job Orders (X-Ray / DEA / OOG) | live | Customer files ancillary-service orders | [[Job Orders]] |
| Release / pull-out + QRPH + Verify-QR | live | Pay online, cashier-confirm, anti-forgery slip | [[Verify-QR Anti-Forgery]] |
| Consignees / vessels self-service | live | Customer-submitted requests | [[Consignees]] |
| Staff stations (cashier / checker / csr) | live | Two-gate completion workflow | [[Two-Gate Completion]] · [[Cashier Station]] |
| Administration | live | Approvals, settings, owner failsafe | [[Administration]] |
| Fuel Monitoring | parked (Phase 0: schema live, no UI) | Derived fuel variance on the moves spine | [ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md) |
| Yard Operations (move-logger spine) | planned (Pillar 2) | Terminal yard moves → derived inventory | [[Yard Operations — Pillar 2 (Move Logger + Yard)]] |

> The status column tracks the live route tree (`src/App.tsx`). A page existing under
> `src/pages` / `src/admin` does **not** imply it is wired.

### Where we are now

- **Live version, migration count, prod-data state, and go-live gate:** see [[Current State]]
  and the at-a-glance table in [[Home]] — **do not hardcode those numbers here** (they drift).
- **What's next:** [[Roadmap]] · [[Pending Items]].

### Explicitly NOT in scope (yet)

- Pillar 2 Yard Operations UI (spine planned, not built).
- Fuel-desk frontend (the `purchaser` role exists in the DB but is frontend-deferred).
- Native mobile beyond responsive web (absent an explicit ask).
- Multi-company / multi-tenancy (single-company by construction — see Tenancy above).

---

## See also

- [[Architecture]] — how it's built (layer + domain map)
- [[Runtime Target]] — runtime authority + data-safety
- [ADR-0001](../../adr/0001-design-ktc-portal-as-two-gated-portals.md) — two gated portals (the founding decision)
- [[Current State]] — live metrics / version / prod-data state (linked, never carried here)
