# ADR-0031: Enforce Customer Agreement / DPA consent in the database, not the UI

* Status: Accepted
* Deciders: owner
* Date: 2026-06-26
* Category: Security | Database

## Context and Problem Statement

The Customer Agreement (terms + NDA + Data Privacy Act consent) was recorded and enforced only in the frontend. The frontend is bypassable, so a determined customer could file a job order or open a ticket without ever recording consent — the one remaining go-live legal gate. How do we make recorded consent a hard precondition that can be neither bypassed nor spoofed?

## Decision Drivers

* Backend-enforced access is a project non-negotiable — the UI is convenience only.
* A `SECURITY DEFINER` function bypasses RLS, so an RLS-only fix is insufficient for the real write paths.
* The consent columns must not be writable (spoofable) by a raw client UPDATE.
* Zero lockout for the existing already-consented customers.

## Considered Options

* **A** — RLS `WITH CHECK` on the write tables only.
* **B** — column-level `REVOKE` on the consent columns.
* **C** — gate inside the `SECURITY DEFINER` write paths + a guard trigger + GUC-gated, server-stamped consent columns.

## Decision Outcome

Chosen option: **C** (migration `0162`). Three layers:

1. **No transaction without consent** — `file_job_order` and `open_ticket` (the real definer write paths) refuse to run unless `has_recorded_consent()` is true. The gate lives *inside* the function, where it actually fires, because the definer bypasses RLS. RLS `WITH CHECK` is kept as defense-in-depth.
2. **Consent can't be spoofed** — the six consent columns are server-stamped only; a raw client UPDATE is pinned back by the `customers` guard trigger, gated by a transaction-local `ktc.allow_consent_write` flag that only the consent RPCs set (mirrors the existing `ktc.allow_owner_change` pattern).
3. **One server-stamped writer** — every path (email/password signup, pending-banner sync, valid-ID page, OAuth finish-registration) records through `record_agreement_consent` (or `complete_oauth_registration`).

### Positive Consequences

* Consent is unbypassable (enforced where it fires) and unspoofable (server-stamped + guard-pinned).
* Zero lockout — the two existing customers already carry consent.

### Negative Consequences / Trade-offs

* The guard-trigger + transaction-local-GUC pattern is **non-obvious** — an unaware edit to `handle_*`/the guard could naively undo it (the reason for this ADR).
* Column-level `REVOKE` was rejected as a **no-op against the table-level grant** Supabase issues to `authenticated`; the guard trigger is the only thing that actually pins the columns.

## Pros and Cons of Options

### A — RLS WITH CHECK only
* Good, because simple.
* Bad, because the definer write paths bypass RLS entirely — consent would not be enforced where orders/tickets are actually created.

### B — column REVOKE
* Good, because intuitive.
* Bad, because a column REVOKE is a no-op against the table-level ALL grant — it does not actually prevent the write.

### C — definer gate + guard trigger + GUC
* Good, because it enforces where the write fires and pins the columns against spoofing.
* Bad, because it's a subtle, multi-part pattern that must be understood before editing.

## Related ADRs

* Extends [ADR-0009](0009-terms-and-data-privacy-consent-at-registration.md) (consent captured at registration) and [ADR-0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md) (backend-enforced access). The OAuth path ([ADR-0034](0034-google-oauth-signin-scoped-finish-registration-gate.md)) records through the same enforcement.

## References

* Migration `0162`; `05-Concepts/Broker Agreement.md`; `scripts/check-security-invariants.mjs` (owner-guard-trigger backstop).
