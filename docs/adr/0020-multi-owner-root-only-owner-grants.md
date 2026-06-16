# ADR-0020: Allow multiple owners but let only a single root owner grant or revoke owner access

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Security

## Context and Problem Statement

The owner failsafe (ADR-0004) modelled a *single* server-only owner who overrides everything and cannot be locked out. The owner now wants 2–3 owners for redundancy (so the business isn't bricked if one owner is unavailable) — but creating an owner is the single most dangerous privilege in the system, so it must not be something *any* owner can do. We needed multiple owners while keeping the power to mint/revoke owners pinned to one specific super-owner, and we needed to detect any owner/admin/role grant — including one that bypasses the app entirely (e.g. a leaked service-role key writing the row directly).

## Decision Drivers

* Redundancy — more than one owner, so a single absent owner can't block the business.
* Contain the most dangerous privilege — only one account ("root") may create or revoke owners; a secondary owner has every other owner power but cannot mint another owner.
* Server-protected, not frontend — owner-grant must be enforced in the protected-fields guard + a dedicated RPC, never a UI toggle.
* Tamper-evidence on every path — any actual grant of owner/admin/role (app or direct DB) must be logged and alerted, so an illicit grant can't hide.
* Don't weaken the existing failsafe — the root owner still cannot be locked out or changed.

## Considered Options

* **A — Keep a single owner.** No redundancy; status quo.
* **B — Multiple equal owners, any owner can mint owners.** Redundant but every owner holds the most dangerous power.
* **C — Multiple owners + an `is_root_owner` super-owner that alone mints/revokes owners via a root-verified RPC, plus a grant-audit trigger on every path (chosen).**

## Decision Outcome

Chosen option: **C** (migrations `0092`, `0093`, `0094`).

**Root owner (`0093`).** A new `customers.is_root_owner` boolean; the current owner is seeded as root. `is_root_owner` is **never** changeable through the app — the protected-fields guard always reverts it (even in trusted SQL context). `0094` adds a partial unique index so **exactly one** root owner can exist (DB-enforced).

**Owner grants are root-only (`0093`).** `is_owner` stays server-protected: the *only* app path that may change it is `set_owner_access(p_target, p_grant)`, which verifies the caller `is_root_owner()`, refuses to touch the root owner, sets a transaction-local flag (`ktc.allow_owner_change`) that the guard honours for that transaction only, then grants/revokes `is_owner` (granting also sets `is_admin`). Everything else reverts as before. A secondary owner therefore has every owner power *except* minting owners. `0094` additionally makes `is_admin` owner-only at the guard (a plain admin can't laterally mint another admin).

**Grant auditing on every path (`0092`, `0094`).** An `after update` trigger `audit_privilege_grant` on `customers` logs a `privilege_granted` security event whenever an account *gains* owner / admin / a staff role — **regardless of who did it or whether there was an app session**, flagging `by_db_context` (no `auth.uid()` = a direct DB write, a red flag). The ops watchdog (`check_ops_alerts`, broadened in `0092`, recipient pinned to the **root owner** in `0094`) emails on every security event in the window, with a 1-hour per-category dedupe. Legitimate grants alert too — by design, so an illicit one can never hide among them and a real one is easy to confirm.

This composes with single-session-per-account (migrations `0054`/`0055`) — an owner is still subject to last-login-wins and the session-alive RLS gate.

### Positive Consequences

* Redundant ownership without diluting the most dangerous privilege — only root mints owners.
* Owner-grant is enforced in the guard + a root-verified RPC, not a UI toggle; the root owner remains un-lockable.
* Every grant (app or direct DB) is logged and alerted, with a direct-DB-write red flag — tamper-evident even against a leaked service-role key.

### Negative Consequences / Trade-offs

* A single point of authority — only the root owner can add/remove owners; if the root owner is truly lost, owner administration is stuck (acceptable: it's the deliberate failsafe; root is server-only and un-lockable).
* Legitimate grants generate alert emails (by design) — slightly noisy, mitigated by the per-category dedupe.
* The protected-fields guard grows more conditional logic (root flag, txn-local owner-change flag, admin owner-only); it's security-critical and must be edited carefully.

## Pros and Cons of Options

### A: Single owner
* Good, because simplest.
* Bad, because no redundancy.

### B: Multiple equal owners
* Good, because redundant and simple.
* Bad, because every owner holds the power to mint owners — the blast radius of any one compromised owner is maximal.

### C: Root-only grants + multi-owner + grant audit (chosen)
* Good, because redundant *and* the dangerous power is contained, server-enforced, and tamper-evident.
* Bad, because a single root authority and more guard complexity.

## Related ADRs

* Extends [ADR-0004](0004-owner-failsafe-and-invite-only-staff.md) (owner failsafe + invite-only staff) — the single owner becomes a root owner that alone mints additional owners.

## References

* `supabase/migrations/0092_privilege_grant_alert.sql` (`audit_privilege_grant`, broadened watchdog)
* `supabase/migrations/0093_root_owner_and_owner_grants.sql` (`is_root_owner`, `set_owner_access`, guard honours root)
* `supabase/migrations/0094_review_security_hardening.sql` (one-root-owner index; `is_admin` owner-only; alerts to root owner)
* `src/admin/Settings.tsx` (owner-management surface)
