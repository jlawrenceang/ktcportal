---
title: Broker Agreement
tags: [concept, policy, privacy, security, legal]
type: concept
---

# 📜 Broker Agreement

The single master legal document brokers accept at registration — fuses the former Broker IRR, Terms & Conditions, and Privacy Notice into one, centered on **confidentiality / non-disclosure (NDA)** and the **Data Privacy Act of 2012 (R.A. 10173)**. See ADR-0011 (supersedes the document structure of ADR-0008/0009).

## Where it lives

- **Content (single source):** `src/content/customer-agreement.md` (Markdown). Edit here.
- **Version:** `src/content/legal.ts` → `AGREEMENT_VERSION` (+ `AGREEMENT_VERSION_LABEL`). Bump on material change.
- **Page:** `src/pages/Agreement.tsx` at the **public** `/agreement` route (shared `MarkdownDoc` renderer). The old `/irr`, `/terms`, `/privacy` routes **redirect** here.

## Document sections

Acceptance/eligibility · broker conduct & acceptable use · **confidentiality and non-disclosure** · **data privacy consent (R.A. 10173)** — PIC + DPO, data collected (incl. valid ID), purposes, legal basis, processors (Supabase/Vercel/Cloudflare), disclosure, international transfer, retention, data-subject rights · liability/termination · governing law (PH) + amendments.

## Registration UX + consents (two ticks)

The Agreement is shown **inline in a scrollable box** on the registration form, with a **"View full ↗"** link opening `/agreement`, and **two required checkboxes** below it:

1. **Terms & Conditions** (incl. confidentiality / NDA).
2. **Data Privacy Act consent** (separate tick — DPA good practice; explicitly covers the uploaded valid ID).

Sign-up is blocked until both are ticked (CAPTCHA still applies).

## How acceptance is recorded

Both ticks reference the one Agreement; acceptance is recorded as `AGREEMENT_VERSION` + timestamp:
- **Auth user metadata**: `terms_version`/`terms_accepted_at` + `privacy_consent_version`/`privacy_consented_at` (always, even before the migration).
- **`brokers` columns** via migrations `0011` + `0012` — for admin querying.

## Status / caveats

- The Agreement is a **working template** — DPO details, retention periods, venue, fees, legal citations are placeholders for KTC + counsel. Not legal advice. Confirm NPC registration obligations.
- Re-acceptance on a version bump is **not yet enforced** for existing brokers (future lane).
- A single document mixes instruments (terms + NDA + privacy); counsel may prefer a standalone Privacy Notice for NPC purposes.

## Related

- [[Brokers]] · [[Authentication]] · [[Broker Onboarding]] · [[RLS Posture]]
- ADR-0008, ADR-0009, ADR-0011
