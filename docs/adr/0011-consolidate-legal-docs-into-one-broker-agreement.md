# ADR-0011: Consolidate the legal docs into one Broker Agreement (Terms + NDA + DPA)

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-09
* Category: Workflow | Security

## Context and Problem Statement

ADR-0008 added the Broker IRR and ADR-0009 added separate Terms & Conditions and Privacy Notice — three documents and (briefly) one or two checkboxes. KTC wants this **streamlined into a single master document**, **centered on confidentiality / non-disclosure (NDA)** and the **Data Privacy Act of 2012 (R.A. 10173)**, while still capturing a **specific data-privacy consent**. How should the documents and the registration consents be structured?

## Decision Drivers

* Fewer documents to read and maintain; concise.
* Center on the NDA (confidentiality) and DPA — KTC's priorities, given brokers upload a government ID.
* DPA good practice: privacy consent should be **specific** — capture it as its own tick, not buried.
* Reversible/versioned; reuse the existing single-source-Markdown rendering and the recorded-consent columns.

## Considered Options

* **Option A** — One master **KTC Broker Agreement** (terms of use + broker conduct/IRR + confidentiality/NDA + DPA consent), with **two registration ticks**: (1) Terms & Conditions, (2) Data Privacy Act consent. Both link to the one document.
* **Option B** — One master document, **one** combined tick.
* **Option C** — Keep three separate documents (status quo, ADR-0008/0009).

## Decision Outcome

Chosen: **Option A**. The Broker IRR, Terms & Conditions, and Privacy Notice are fused into a single concise `src/content/broker-agreement.md` (sections: acceptance/eligibility, broker conduct, **confidentiality & non-disclosure**, **data privacy consent (R.A. 10173)**, liability/termination, governing law). It renders at the public `/agreement` route; the old `/irr`, `/terms`, `/privacy` routes **redirect** to it. Registration shows **two ticks** — Terms & Conditions and DPA consent — both required and both linking to the one document. Acceptance is recorded as before (auth metadata + `brokers` columns `terms_*` and `privacy_consent_*`, both = `AGREEMENT_VERSION`); no new migration. `src/content/legal.ts` now exposes a single `AGREEMENT_VERSION` / `AGREEMENT_BODY`.

### Positive Consequences

* One concise document, centered on NDA + DPA; easier to read and maintain.
* Still a **specific** DPA consent (its own checkbox) — DPA-aligned.
* Old links/bookmarks/tests keep working via redirects. No DB migration needed (reuses `0012` columns).

### Negative Consequences / Trade-offs

* Supersedes the separate-document structure of ADR-0008/0009 (kept as history with addenda).
* The single document still mixes instruments (terms + NDA + privacy) — acceptable, but counsel may prefer a standalone Privacy Notice for NPC purposes.
* Still a template pending KTC/legal finalization.

## Pros and Cons of Options

### Option A: one document, two ticks (chosen)

* Good, because streamlined + NDA/DPA-centered + specific privacy consent + reversible.
* Bad, because one document mixes instruments; supersedes prior ADRs.

### Option B: one document, one tick

* Good, because simplest UX.
* Bad, because bundling privacy consent weakens its specificity under the DPA.

### Option C: three separate documents

* Good, because cleanest legal separation.
* Bad, because more to read/maintain; not what KTC wants.

## Related ADRs

* Supersedes the document structure of [ADR-0008](0008-broker-irr-acceptance-at-registration.md) and [ADR-0009](0009-terms-and-data-privacy-consent-at-registration.md) (see their addenda). The acceptance-recording mechanism and migration `0012` still stand.

## References

* `src/content/broker-agreement.md` · `src/content/legal.ts` · `src/pages/Agreement.tsx`
* `src/pages/Login.tsx` (two ticks → one document) · `src/App.tsx` (redirects)
* `docs/obsidian-vault/05-Concepts/Broker Agreement.md`
