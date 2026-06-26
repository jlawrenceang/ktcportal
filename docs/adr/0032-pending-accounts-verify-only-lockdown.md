# ADR-0032: Lock pending accounts to verify-only (a data-exposure boundary)

* Status: Accepted
* Deciders: owner
* Date: 2026-06-26
* Category: Security

## Context and Problem Statement

A pending (unapproved) account could read business data — the vessel schedule, the rate tables, the consignee master list — and file held orders. With self-signup now possible via "Continue with Google" ([ADR-0034](0034-google-oauth-signin-scoped-finish-registration-gate.md)), *anyone* can create a pending account, so a competitor or scraper could sign up and harvest operational data and structure. How do we limit a pending account to only what it needs to get verified?

## Decision Drivers

* Self-signup means a pending account is **not** a trusted party.
* The consignee master list (2,488 records) and the rate tables are sensitive.
* Must be backend-enforced (RLS) — route-gating is bypassable.
* Approved customers and staff must be entirely unaffected.

## Considered Options

* **A** — frontend route-gating only (hide the pages from pending users).
* **B** — RLS lockdown: gate every business surface behind `broker_is_approved()`.

## Decision Outcome

Chosen option: **B** (migration `0163`). A `status='pending'` account — including any Google self-registration — can **only** upload a valid ID, see its status, read the Agreement, manage account basics, and sign out. Every business surface — filing (`file_job_order` is approved-only), the vessel schedule, the rate/calculator config (`terminal_rates` / `service_rates` / `pricing_settings`), the consignee master list, and bulletins — is locked behind `broker_is_approved()` at the **RLS layer**. Shell route-gating is kept as UX only, and Lara is hidden for pending accounts. Verified: every `FOR ALL` policy is staff-scoped (no bypass), approved customers + staff still read everything, pending read nothing.

### Positive Consequences

* Closes the self-signup data-exposure surface at the real wall (RLS), making open Google sign-up safe.
* The approval gate becomes the actual filter between "anyone who signed up" and "can see our data."

### Negative Consequences / Trade-offs

* A future RLS edit could loosen one of these surfaces unknowingly — this ADR pins verify-only as an **access-model invariant** to check against.
* Pending customers see empty/locked surfaces until approved (intended, but a UX cost — the banners explain why).

## Pros and Cons of Options

### A — route-gating only
* Good, because quick.
* Bad, because the data is still reachable via the API/RLS — it only *hides* the pages, it doesn't protect the data.

### B — RLS lockdown
* Good, because the data itself is unreadable until approval, regardless of client.
* Bad, because it must be maintained as an invariant as new surfaces are added.

## Related ADRs

* Tightens [ADR-0012](0012-pending-brokers-enter-portal-submit-gated.md) (pending enter the portal, submit-gated) for the post-OAuth world; relies on [ADR-0002](0002-use-a-dedicated-supabase-account-with-backend-enforced-access.md). The anti-abuse companion is [ADR-0033](0033-block-disposable-email-domains.md).

## References

* Migration `0163`; `05-Concepts/RLS Posture.md`.
