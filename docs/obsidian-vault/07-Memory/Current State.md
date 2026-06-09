---
title: Current State
tags: [memory, current]
type: memory
last_updated: 2026-06-07
---

# 📌 Current State (Runtime-Aligned)

> **For sequencing of what's next, read [[Roadmap]].** This page is a runtime snapshot — *what is live today*.

## 2026-06-09 — Legal docs consolidated into one Broker Agreement

**Consolidated (ADR-0011, supersedes the structure of the two entries below).** The Broker IRR + Terms & Conditions + Privacy Notice are fused into a single **KTC Broker Agreement** (`src/content/broker-agreement.md`), centered on **confidentiality/NDA** and the **Data Privacy Act (R.A. 10173)**, at the public `/agreement` route (old `/irr` `/terms` `/privacy` redirect there). Registration shows the Agreement **inline in a scrollable box** with a **"View full ↗"** link, and **two required ticks** below: (1) Terms & Conditions, (2) DPA consent. Acceptance recorded as before (`terms_*` + `privacy_consent_*`, migration `0012`). See [[Broker Agreement]].

## 2026-06-09 — Terms & Conditions + Data Privacy consent

**Added (ADR-0009).** Public `/terms` and `/privacy` pages (single-source Markdown via a shared `MarkdownDoc` renderer). The Privacy Notice is **DPA (R.A. 10173)-aware** — required because brokers upload a government ID. Registration now requires two consents: (1) Terms & Conditions + Broker IRR, (2) a **separate** data-privacy consent. Versions + timestamps recorded in auth metadata + `brokers` columns via migration **`0012`** (apply to KTC DB; metadata holds the record until then). Login page has footer links. All three legal docs are templates pending KTC/legal finalization. *(Later consolidated — see [[Broker Agreement]] and the top entry.)*

## 2026-06-09 — Broker IRR acceptance gate

**IRR added (ADR-0008).** Implementing Rules and Regulations content in `src/content/broker-irr.md` (versioned via `IRR_VERSION`), rendered at the **public** `/irr` page + broker nav link. Registration now requires agreeing to the IRR (required checkbox linking to `/irr`); acceptance recorded in auth metadata immediately and on `brokers` columns via migration **`0011`** (must be applied to the KTC DB; metadata holds the record until then). IRR text is a template pending KTC/legal finalization. *(Later folded into the one Agreement — see [[Broker Agreement]].)*

## 2026-06-09 — Flow change: brokers pick consignee from master list

**Per-broker consignee accreditation disabled (ADR-0007).** The New Job Order page (`src/pages/JobOrder.tsx`) now uses a debounced server-side **typeahead over the full consignee master list** instead of an accreditation-fed dropdown — any approved broker can pick any consignee and submit. The `/accreditation` page is replaced with a notice (route kept) and its nav link removed (`Shell.tsx`). The broker self-register → admin-approve gate is unchanged; the `accreditations` table + admin accreditation features are untouched (reversible). Lint + build clean.

Also added: Playwright E2E Phase 1 (8 unauth smoke tests passing). Phase 2 (auth flows) pending a CAPTCHA-free path — see [[Pending Items]].

## 2026-06-07 — Live on portal.ktcterminal.com with CAPTCHA + full docs

**Deployed + protected.** The portal is live on Vercel at **`portal.ktcterminal.com`** (custom domain, DNS on Vercel, HTTPS valid, SPA deep-links working). Cloudflare **Turnstile CAPTCHA** is live on login + registration and **enforced server-side** in Supabase Auth (verified: auth API returns `captcha_failed` without a token). Vercel CLI installed + linked. Access is gated behind login — not public yet (prod testing).

**Documentation system shipped.** Mirrored jta-sys's layered docs: `CLAUDE.md` + `AGENTS.md`, `docs/agent/*`, `docs/adr/*` (ADRs 0001–0006), and this Obsidian vault. See [[2026-06-07 Deploy + CAPTCHA + Docs System]].

## What is live

- **Auth** — broker email/password registration with valid-ID upload; staff username login; owner failsafe; invite-only staff creation. CAPTCHA enforced. See [[Authentication]].
- **Brokers** — self-register → `pending` → admin approval → portal access. See [[Brokers]].
- **Consignees** — admin CRUD, search, pagination (2,488 imported), approval, accreditation (address/TIN/2303). See [[Consignees]].
- **Job Orders** — broker submission + history; admin processing maturing. See [[Job Orders]].
- **Administration** — approvals, broker/consignee management, owner-only staff settings. See [[Administration]].

## Backend

- Supabase project `mdlnfhyylvapzdubhyic` (KTC's own account). Migrations `0001_init` … `0012_broker_consents` (`0011`–`0012` pending apply to the KTC DB; consents recorded in auth metadata until then). RLS enabled; role model via `is_owner`/`is_admin`/`status`.

## In progress / not yet

- Admin dashboard metrics + job-order processing workflow.
- Per-broker accredited-consignee scoping.
- Resend SMTP (email confirmations / password resets).
- Supabase Auth Site URL / Redirect URLs not yet pointed at the custom domain.
- Playwright Phase 1 unauth smoke (10 tests, passing); Phase 2 authenticated flows pending a CAPTCHA-free path. No Vitest unit suite.

## Immediate priorities

**See [[Roadmap]] for authoritative sequencing.** Summary: (1) manual browser UAT on the live domain; (2) set Supabase Auth URLs; (3) admin job-order processing; (4) Resend SMTP for go-live.
