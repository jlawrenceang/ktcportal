---
title: Multi-Owner & Root Grants
tags: [concept, security, auth, owner]
type: concept
last_updated: 2026-06-16
---

# 🗝️ Multi-Owner & Root Grants

KTC can now have **2–3 owners** for redundancy, but only the **primary ("root") owner** may mint or revoke owner access. A secondary owner has every other owner power but **cannot create another owner**. Built in **`0093`** (alerting in `0092`); extends [[Owner Failsafe]].

## Model

- **`is_root_owner`** — the one super-owner (seeded = the current owner). **Never** changeable through the app — the protected-fields guard always reverts it.
- **`is_owner`** — still server-protected. The **only** app path that may change it is **`set_owner_access(target, grant)`**, which verifies the caller `is_root_owner()` and sets a **txn-local** flag (`ktc.allow_owner_change`) the guard honours for that transaction only. Everything else reverts `is_owner` as before.
- A secondary owner is full `is_owner` (bypasses every gate, see [[Staff Roles & Gates]]) but `set_owner_access` refuses them — root-only.
- `set_owner_access` cannot touch the root owner (raises). Granting owner also sets `is_admin = true`.

## Privilege-grant alerting (`0092`)

Separate from the escalation-**attempt** alerts (`0046`), `0092` logs + alerts whenever an account actually **gains** admin / owner / a staff role — **by any path**, including a direct DB write that bypasses the auth-context guard (`audit_privilege_grant` trigger; `by_db_context = true` when there's no app session = red flag). The owner gets an email within 15 min via the widened ops watchdog. Legit grants alert too — by design, so an illicit one can't hide.

## Single session per account

Owners (like all accounts) are still bound by single-session-per-account (`0054`/`0055`) — last login wins, evicted sessions cut off via `session_alive()` in the RLS helpers.

## Related

- [[Owner Failsafe]] · [[Staff Roles & Gates]] · [[Authentication]] · [[RLS Posture]] · [[Operational Invariants]]
- Migrations `0092` (privilege-grant alert), `0093` (root owner + owner grants), `0094` (review hardening)
