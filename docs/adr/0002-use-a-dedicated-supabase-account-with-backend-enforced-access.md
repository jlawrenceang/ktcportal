# ADR-0002: Use a dedicated Supabase account with backend-enforced access

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-05
* Category: Database | Security

## Context and Problem Statement

KTC needs an authoritative backend for auth and business data. The owner already runs jta-sys on Supabase under `jlawrenceang@gmail.com`, which has hit Supabase's 2-free-project-per-user limit. The question is where KTC's backend lives and how business rules are enforced.

## Decision Drivers

* KTC data must stay completely isolated from jta-sys (different business, different users).
* Supabase free tier covers prod testing for a small batch of customers.
* The frontend is a UI layer only — critical rules (auth, approvals, staff creation) must live in the database.
* The 2-free-project limit blocks adding KTC under the existing account.

## Considered Options

* **Option A** — A new, dedicated Supabase account exclusive to KTC.
* **Option B** — A third project under the existing jta-sys account (blocked by the limit / paid upgrade).
* **Option C** — Share the jta-sys project with a separate schema.

## Decision Outcome

Chosen option: **Option A — a dedicated KTC Supabase account** (project `mdlnfhyylvapzdubhyic`), because it gives hard isolation from jta-sys at the account boundary and stays within free tier. Business rules are enforced backend-first: RLS on every table, SECURITY DEFINER RPCs for privileged actions (e.g. `create_staff`), and the `is_owner`/`is_admin` role model. The React app is a UI layer over `src/lib/supabase.ts`.

### Positive Consequences

* Complete data + auth isolation from jta-sys.
* Free tier sufficient for prod testing; GitHub + Vercel accounts stay shared (no per-user limit there).
* Backend-enforced controls survive a compromised or buggy frontend.

### Negative Consequences / Trade-offs

* A separate account means separate credentials/login to manage.
* **The in-session `mcp__supabase__*` tools point at jta-sys, not KTC** — KTC schema must be applied via the direct Postgres connection (`scripts/run-migrations.mjs`) or the KTC SQL Editor, never via those MCP tools.

## Pros and Cons of Options

### Option A: Dedicated KTC account (chosen)

* Good, because hard isolation + free tier.
* Bad, because separate credentials and no MCP tooling wired to it.

### Option B: Third project under jta-sys account

* Bad, because blocked by the 2-free-project limit (would force a paid plan), and weaker isolation.

### Option C: Shared project, separate schema

* Bad, because co-mingles KTC and jta-sys auth users and data — unacceptable isolation risk.

## Related ADRs

* Required by [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md)
* Required by [ADR-0004](0004-owner-failsafe-and-invite-only-staff.md)

## References

* `src/lib/supabase.ts` — the single client (env-built)
* `supabase/migrations/` · `scripts/run-migrations.mjs`
* `docs/agent/runtime-data-safety.md`
