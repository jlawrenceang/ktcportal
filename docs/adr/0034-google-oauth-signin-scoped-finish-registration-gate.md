# ADR-0034: Google OAuth sign-in + a scoped post-OAuth consent/contact gate

* Status: Accepted
* Deciders: owner
* Date: 2026-06-26
* Category: Security | Frontend

## Context and Problem Statement

Customers wanted one-tap "Continue with Google" sign-in. But Google returns only a name + a verified email — not the **contact number** and **Customer Agreement consent** the email/password registration collects. How do we add OAuth without losing the data and consent the normal flow captures, and without imposing the extra step on existing email/password users?

## Decision Drivers

* Keep the registration invariant — every customer provides a contact number + recorded consent.
* Don't burden email/password users with an OAuth-only step.
* Reuse the normal pending → ID → approval lifecycle (and the verify-only lockdown).

## Considered Options

* **A** — Google sign-in with no extra step (accept the missing contact + consent).
* **B** — Google sign-in + a one-time `FinishRegistration` gate scoped to OAuth users with no recorded consent.

## Decision Outcome

Chosen option: **B** (migration `0161`). `signInWithGoogle` via Supabase OAuth (the email comes back already verified, so the email-confirmation step is skipped). A new Google customer is routed once through a `FinishRegistration` gate in `ProtectedRoute` to provide a contact number + Agreement consent before the portal opens; both are recorded server-side via `complete_oauth_registration(p_contact, p_version)`. The gate is **scoped** to `app_metadata.provider === 'google'` with no recorded `terms_version`, so email/password users never see it. The account then enters the normal pending → ID-upload → approval flow, including the verify-only lockdown ([ADR-0032](0032-pending-accounts-verify-only-lockdown.md)).

### Positive Consequences

* One-tap sign-in without losing the contact + consent invariant; consent recorded server-side (through [ADR-0031](0031-server-side-agreement-consent-enforcement.md)'s writer).
* Email/password users are entirely untouched (the gate is provider-scoped).

### Negative Consequences / Trade-offs

* Open Google sign-up means anyone can create a pending account — mitigated by the verify-only lockdown ([ADR-0032](0032-pending-accounts-verify-only-lockdown.md)) + the disposable-email block ([ADR-0033](0033-block-disposable-email-domains.md)) + the human approval gate as the real filter.
* One extra onboarding step for Google users (one-time, unavoidable to preserve the invariant).

## Pros and Cons of Options

### A — no extra step
* Good, because the simplest one-tap flow.
* Bad, because it loses the contact number and consent every other customer provides — a legal + operational gap.

### B — scoped FinishRegistration gate
* Good, because it preserves the invariant for Google users while leaving email/password users untouched.
* Bad, because Google users hit one extra one-time step.

## Related ADRs

* Records consent through [ADR-0031](0031-server-side-agreement-consent-enforcement.md); the OAuth-created account is a pending, locked account per [ADR-0032](0032-pending-accounts-verify-only-lockdown.md); relates to [ADR-0009](0009-terms-and-data-privacy-consent-at-registration.md).

## References

* Migration `0161`; `02-Cores/Authentication/Authentication.md`; `src/components/FinishRegistration.tsx`, `src/components/ProtectedRoute.tsx`.
