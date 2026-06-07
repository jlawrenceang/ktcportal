# ADR-0001: Design the KTC system as two role-gated portals

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-05
* Category: Architecture

## Context and Problem Statement

KTC Container Terminal needs a web system where external brokers submit Job Orders for terminal services, and internal KTC staff approve brokers, manage consignees, and process those orders. Brokers and staff have fundamentally different trust levels and capabilities. The question is how to structure these two audiences — separate apps, or one app with role gating.

## Decision Drivers

* Brokers are external/untrusted; staff are internal and privileged.
* The two audiences share core data (brokers, consignees, job orders) but see different slices.
* Small team, single codebase, single deploy is preferable for maintenance.
* Access control must be enforced server-side, not by which URL a user visits.

## Considered Options

* **Option A** — One SPA with role-gated routes (broker portal + admin portal under the same app).
* **Option B** — Two separate deployed apps sharing one database.
* **Option C** — A single undifferentiated app with conditional UI only.

## Decision Outcome

Chosen option: **Option A — one SPA, two role-gated portals**, because it keeps a single codebase and deploy while cleanly separating the broker surface (`src/pages`, `Shell.tsx`) from the admin surface (`src/admin`, `AdminShell.tsx`). Routing sends users to the correct portal by role (`RoleLanding`: admins → `/admin`, brokers → broker home), and access is enforced by RLS + `hasAdminAccess()` + route guards — not by URL secrecy.

### Positive Consequences

* One build, one Vercel project, one set of shared types and Supabase client.
* Clear ownership boundary between `src/pages` (broker) and `src/admin` (staff).
* Role landing prevents an admin from being dumped into the broker portal (and vice versa).

### Negative Consequences / Trade-offs

* Both portals ship in the same bundle (acceptable at this scale).
* Role gating must be correct in two places (RLS + UI guards); a mistake leaks UI but not data if RLS holds.

## Pros and Cons of Options

### Option A: One SPA, role-gated (chosen)

* Good, because single codebase + deploy, shared contracts.
* Good, because role landing + guards keep the surfaces distinct.
* Bad, because admin code ships to broker browsers (mitigated: data is RLS-protected).

### Option B: Two separate apps

* Good, because hard separation of surfaces.
* Bad, because duplicated client/types/build/deploy overhead for a small system.

### Option C: One undifferentiated app

* Bad, because mixing external and internal capabilities invites access-control mistakes.

## Related ADRs

* Required by [ADR-0004](0004-owner-failsafe-and-invite-only-staff.md)
* Extended by [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md)

## References

* `src/App.tsx` — `RoleLanding`, `Protected`, `Admin` route wrappers
* `src/components/Shell.tsx` (broker) · `src/admin/AdminShell.tsx` (admin)
