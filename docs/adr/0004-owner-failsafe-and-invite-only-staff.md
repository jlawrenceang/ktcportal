# ADR-0004: Establish an owner failsafe and invite-only staff

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-05
* Category: Security

## Context and Problem Statement

The admin portal controls broker approvals, consignees, and staff access. We need a model where (a) the business owner can never be locked out of their own system, and (b) staff/admin accounts cannot be self-created by anyone who finds the app. How should privileged accounts be created and protected?

## Decision Drivers

* The owner must have a guaranteed, unrevocable way in — a failsafe.
* Staff are internal; allowing self-signup to admin would be a critical hole.
* Some staff have no company email — they need username/password credentials.
* Account creation must be a privileged, audited, backend operation.

## Considered Options

* **Option A** — Server-only `is_owner` failsafe + owner-created staff via a SECURITY DEFINER RPC (username + password, no email).
* **Option B** — Email-invite links for staff at deploy time.
* **Option C** — Self-signup with an admin role flag toggled later.

## Decision Outcome

Chosen option: **Option A**. The owner (`jla.ktcport@gmail.com`) carries a server-only `is_owner` flag: they override every gate, see everything, and cannot be revoked (staff cannot revoke the owner; the UI hides revoke on the owner row). Staff are created only by the owner in admin Settings via `rpc('create_staff', {p_username, p_password, p_full_name})` — a SECURITY DEFINER function that inserts the `auth.users`/`auth.identities` rows (token columns `''`, not NULL) and promotes the broker to admin/approved atomically, owner-gated by the caller's JWT. Username logins map to a synthetic `<username>@ktc-staff.local`.

### Positive Consequences

* Owner can never be locked out — a true failsafe.
* No self-signup path to admin; staff creation is privileged and atomic.
* Staff without email can still get credentials.

### Negative Consequences / Trade-offs

* Manual `auth.users` insertion must handle GoTrue's NULL-token gotcha (documented in `runtime-data-safety.md`).
* Username→synthetic-email mapping is a convention that must be applied consistently in `signIn`.

## Pros and Cons of Options

### Option A: Owner failsafe + RPC-created staff (chosen)

* Good, because failsafe + no self-signup + email-less staff.
* Bad, because manual auth-row creation is delicate (token columns).

### Option B: Email-invite links

* Good, because uses standard Supabase invite flow.
* Bad, because requires working email (Resend not yet set up) and every staff member to have an inbox.

### Option C: Self-signup + later flag

* Bad, because a window where anyone can request admin is unacceptable.

## Related ADRs

* Required by [ADR-0001](0001-design-ktc-portal-as-two-gated-portals.md) and [ADR-0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md)

## References

* `supabase/migrations/0010_create_staff.sql`
* `src/admin/Settings.tsx` · `src/lib/AuthContext.tsx` (`signIn` username mapping)
* `docs/agent/workflow-invariants.md`

## Amendments

* **2026-06-12 — owner transferred** to `jlawrenceang@gmail.com` (the owner's 2FA-protected main account); `jla.ktcport@gmail.com` demoted to a regular admin (fallback login, no failsafe). TOTP MFA added portal-wide for staff/owner with server-side aal2 enforcement (migration `0049`, `/admin/security`).
* **2026-06-28 — email-keyed failsafe + fallback removed.** Two findings from the 2026-06-28 roast/owner-access dig: (1) the documented `jla.ktcport@gmail.com` admin fallback **no longer exists** — that address was re-registered 2026-06-21 as a customer and is now `rejected`, so there is currently exactly **one** privileged account; (2) `is_owner()`/`is_admin()` decided access purely from the `customers` **column**, so a missing/flag-wrong owner row would lock the owner out — contradicting "cannot be locked out." **Fix (migration `0184`):** `is_owner()`/`is_admin()` now also return true when `auth.email()` is the owner email (a JWT fact GoTrue sets from `auth.users`, not spoofable to a confirmed address; MFA still enforced). Break-glass recovery documented in [[Owner Failsafe]] (`seed-owner.sql`, DB-credential gated). A **secret-question backdoor was considered and rejected** (a second master key bypassing 2FA — larger permanent attack surface than the rare lockout it covers). A **second owner for redundancy** was offered and **deferred** by the owner — revisit if single-account risk becomes a concern.
