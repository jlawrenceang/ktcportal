---
title: RLS Posture
tags: [concept, security, rls, database]
type: concept
---

# 🔐 RLS Posture

How row-level security backs the role model.

## Model

- Every core table (`brokers`, `consignees`, `job_orders`, `job_order_lines`, `accreditations`) has RLS enabled.
- **Brokers** can read/write their own rows (scoped by `user_id`).
- **Admins/owner** can read all rows (broad admin policies) and perform privileged updates.
- Privileged actions that must not be client-forgeable (staff creation, role promotion) run through SECURITY DEFINER RPCs, not direct table writes.

## The `useBroker` consequence

Because admin policies return **all** broker rows, a naive `select().maybeSingle()` breaks for admins. `useBroker` therefore **must** filter `.eq('user_id', uid)`. This is the bug that previously dumped the owner into the broker portal.

## Source of truth

The migrations under `supabase/migrations/` are authoritative for exact policies. This note is a conceptual summary — verify policy detail against the SQL before relying on it (idempotent style: `drop policy if exists` then `create policy`).

## Caveats

- Production-only runtime (no staging). Changes land on live data.
- Confirm you are operating on the KTC project (`mdlnfhyylvapzdubhyic`), not jta-sys, before any policy change. See `docs/agent/runtime-data-safety.md`.

## Related

- [[Authentication]] · [[Operational Invariants]] · [[Owner Failsafe]]
- ADR-0002
