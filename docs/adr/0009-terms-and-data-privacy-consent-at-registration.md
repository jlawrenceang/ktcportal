# ADR-0009: Add Terms & Conditions and Data Privacy Act consent at registration

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-09
* Category: Security | Workflow

## Context and Problem Statement

Broker registration collects personal data and requires uploading a **valid government-issued ID** — regulated personal data under the Philippine **Data Privacy Act of 2012 (R.A. 10173)**. KTC needs (a) Terms & Conditions governing portal use and (b) a DPA-compliant Privacy Notice with a specific, freely-given consent before collecting and processing that data. The question is how to publish these and capture agreement.

## Decision Drivers

* The DPA requires informing data subjects and obtaining consent for processing, especially for an uploaded government ID.
* Privacy consent should be **separate and specific** — not bundled into general terms.
* Brokers must be able to read each document before agreeing.
* Versioned records of what each broker accepted, and when, are needed.
* Reuse the IRR pattern; no new dependency.

## Considered Options

* **Option A** — Publish Terms and a Privacy Notice as public pages; require two checkboxes at registration: (1) Terms & Conditions + Broker IRR, (2) a separate data-privacy consent. Record versions + timestamps.
* **Option B** — One combined "I agree to everything" checkbox covering terms + privacy.
* **Option C** — Show the documents but capture no consent.

## Decision Outcome

Chosen option: **Option A**. Two public pages were added — `/terms` and `/privacy` — alongside the existing `/irr`, all rendered from single-source Markdown (`src/content/*.md`) via a shared `MarkdownDoc` component. Registration now has **two required checkboxes**: one agreeing to the Terms & Conditions **and** the Broker IRR, and a **separate** consent to the Privacy Notice (explicitly mentioning the valid ID and the DPA). Sign-up is blocked until both are ticked (and CAPTCHA passes). Each consent's version + timestamp is recorded in auth metadata (immediately) and on `brokers` columns via migration `0012`. Keeping privacy consent on its own checkbox follows DPA good practice (specific, freely given).

### Positive Consequences

* DPA-aware: a specific, separate privacy consent for processing the uploaded ID, with a published Privacy Notice (controller, purposes, basis, sharing, retention, data-subject rights, DPO contact).
* Versioned consent trail per broker.
* Documents readable before agreeing; one shared renderer, no new dependency.

### Negative Consequences / Trade-offs

* The documents are **templates** — DPO details, retention periods, venue, fees, and legal citations are placeholders pending KTC + counsel review and possible NPC registration.
* Checkbox consent is lightweight evidence (appropriate for this stage).
* Re-consent on version bump isn't enforced yet for existing brokers (future lane).
* Three consents now at registration (Terms+IRR, Privacy) plus CAPTCHA — slightly heavier sign-up, accepted for compliance.

## Pros and Cons of Options

### Option A: Separate Terms and Privacy consent (chosen)

* Good, because DPA-aligned (specific privacy consent), versioned, reuses the pattern.
* Bad, because templates need legal finalization; heavier sign-up.

### Option B: One combined checkbox

* Good, because simplest UX.
* Bad, because bundling privacy consent into general terms is poor DPA practice and weaker evidence of specific consent.

### Option C: Display only, no consent

* Bad, because fails the DPA's consent/record expectations for processing the ID.

## Related ADRs

* Companion to [ADR-0008](0008-broker-irr-acceptance-at-registration.md) (same recording pattern).
* Builds on [ADR-0005](0005-admin-approval-and-consignee-accreditation-controls.md) (registration collects the valid ID).

## References

* `src/content/terms-and-conditions.md` · `src/content/privacy-notice.md` · `src/content/legal.ts`
* `src/components/MarkdownDoc.tsx` · `src/pages/Terms.tsx` · `src/pages/Privacy.tsx`
* `src/pages/Login.tsx` (two consent checkboxes) · `src/lib/AuthContext.tsx`
* `supabase/migrations/0012_broker_consents.sql`
* `docs/obsidian-vault/05-Concepts/Broker Agreement.md`

---

## Current-State Addendum (2026-06-09)

The separate Terms and Privacy Notice documents were **consolidated into one KTC Broker Agreement** by [ADR-0011](0011-consolidate-legal-docs-into-one-broker-agreement.md). The **two-consent structure stands** (Terms tick + a separate DPA-consent tick) and so does the recording mechanism (auth metadata + `brokers` `terms_*` / `privacy_consent_*`, migration `0012`) — both ticks now reference the one Agreement document, shown inline (scrollable) at registration with a "View full" link to `/agreement`. `/terms` and `/privacy` redirect to `/agreement`.
