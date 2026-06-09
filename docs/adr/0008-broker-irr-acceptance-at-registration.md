# ADR-0008: Require broker IRR acceptance at registration

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-09
* Category: Workflow | Security

## Context and Problem Statement

KTC needs brokers to agree to its Implementing Rules and Regulations (IRR) — eligibility, conduct, prohibited acts, liability, penalties — before they transact. The question is how to publish the IRR and how (and whether) to capture each broker's agreement.

## Decision Drivers

* Brokers must be bound by the IRR; KTC wants a record of who accepted which version and when.
* The IRR text will change over time — versioning is needed so a new version can require re-acceptance.
* A registering broker must be able to read the IRR before agreeing.
* Keep it simple: no new dependency, works during prod testing without extra infrastructure.

## Considered Options

* **Option A** — Publish the IRR as an in-app page and require an acceptance checkbox at registration, recording version + timestamp on the broker (auth metadata immediately, brokers columns via migration).
* **Option B** — In-app page only, no acceptance capture.
* **Option C** — A static PDF/printed document outside the app.

## Decision Outcome

Chosen option: **Option A**. The IRR content lives in `src/content/broker-irr.md` (single source) with a version constant in `src/content/irr.ts` (`IRR_VERSION`). A **public** `/irr` route renders it (readable before login, and linked from the acceptance checkbox). Registration adds a **required "I have read and agree to the KTC Broker IRR (vN)" checkbox**; sign-up is blocked until it's ticked. Acceptance is recorded two ways: on the auth user's metadata (`irr_version`, `irr_accepted_at`) immediately at sign-up, and on the `brokers` row (migration `0011`) for admin querying. A small built-in Markdown renderer avoids adding a dependency.

### Positive Consequences

* Brokers cannot register without accepting the current IRR; agreement is recorded with version + timestamp.
* Versioned — a future IRR change can require re-acceptance.
* No new runtime dependency; IRR text is editable in one Markdown file.
* Acceptance survives even before the `0011` migration (stored in auth metadata).

### Negative Consequences / Trade-offs

* A checkbox is lightweight evidence of consent (sufficient for this stage; not a signed contract).
* The IRR content is a template — legal specifics (fees, penalties, citations) are placeholders pending KTC review.
* Re-acceptance on version bump is not yet enforced for already-registered brokers (future lane).

## Pros and Cons of Options

### Option A: Page + acceptance gate (chosen)

* Good, because enforces + records consent, versioned, dependency-free.
* Bad, because checkbox consent is lightweight; placeholders need legal finalization.

### Option B: Page only

* Good, because simplest.
* Bad, because no record that any broker agreed.

### Option C: External PDF

* Bad, because not enforced in the flow and no acceptance trail.

## Related ADRs

* Builds on [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md) (broker onboarding) and the registration flow.

## References

* `src/content/broker-irr.md` · `src/content/irr.ts` · `src/pages/Irr.tsx`
* `src/pages/Login.tsx` (acceptance checkbox) · `src/lib/AuthContext.tsx` (records acceptance)
* `supabase/migrations/0011_broker_irr_acceptance.sql`
* `docs/obsidian-vault/05-Concepts/Broker Agreement.md`

---

## Current-State Addendum (2026-06-09)

The standalone IRR document/page/route was **folded into the single KTC Broker Agreement** by [ADR-0011](0011-consolidate-legal-docs-into-one-broker-agreement.md). The acceptance-recording mechanism here (auth metadata + `brokers` columns, migration `0011`) still stands — IRR/terms acceptance is now captured under the Agreement's "Terms & Conditions" tick. `/irr` redirects to `/agreement`.
