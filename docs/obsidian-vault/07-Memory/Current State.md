---
title: Current State
tags: [memory, current]
type: memory
last_updated: 2026-06-10
---

# 📌 Current State (Runtime-Aligned)

> **For sequencing of what's next, read [[Roadmap]].** This page is a runtime snapshot — *what is live today*.

## 2026-06-10 — Processing workflow, printable slip, account self-service

**Admin job-order processing is live (ADR-0014, migration `0029`).** The admin Job Orders page advances orders `submitted → processing → completed`, or **on_hold** / **rejected** with a customer-visible `admin_note`. "Approve = start processing." Admin UPDATE policy on `job_orders`; customers still can't self-update. **Printable A6 job-order slip** at `/job-order/:id/print`, styled as a mini KTC Service Invoice (logo/TIN header, JOB ORDER + red JO No., bordered customer block, container/service table with an Amount column ready for prices, signature lines) → browser print / Save-as-PDF; **"ON PROCESS" watermark** for in-progress orders. Available once approved (processing/completed); reachable from admin queue + My Job Orders.

**My Account self-service (ADR-0013, migration `0028`).** `/account` lets a customer edit full name / contact, change email (re-confirm link to the new address), and change password (in-page + reset-by-email). An **approved** customer changing their legal name triggers **re-verification** (→ `pending`, re-upload ID), because the verified name was matched to the now-deleted ID; the protected-fields guard now permits `approved → pending` self-transition.

**Polish:** unified `Notice` component (banner + login bubbles), Back-to-Home/Dashboard buttons + clickable logo on every page, **bulk-paste** containers (uncapped) + file→My-Job-Orders redirect, collapsible My-Job-Orders cards with status badges, square frosted-glass admin dashboard, and a **login lockout** (5 wrong passwords → 60s cooldown). Committed `aeac344`, tag `checkpoint-2026-06-10`, **live** on `portal.ktcterminal.com` (verified bundle).

## 2026-06-09 — Email-confirmation registration flow

**Confirm-email ON via Resend.** Registration now collects full name + email + password + 2 consents + CAPTCHA — **no valid ID at sign-up**. Broker confirms via email (Resend from `noreply@ktcterminal.com`; template `docs/email-templates/confirm-signup.html`), then on first login uploads their valid ID in the pending panel (`PendingPanel.tsx`), which also syncs consent columns from metadata. `emailRedirectTo` set. Email is the login identifier (no separate username). Rationale: the `valid-ids` storage policy needs a session, so post-confirmation upload keeps per-user security (no anon uploads). Resend domain `ktcterminal.com` verified + working (right-team API key in `.env.local`). **Still to do (you):** Supabase → Auth → Custom SMTP (Resend), paste the email template, Confirm email = ON, Site/Redirect URLs. See [[Broker Onboarding]].

## 2026-06-09 — Flow change Phase 1: approval workflow

**Reject-with-reason + suspend (in progress flow overhaul).** `/admin/approvals` now captures a **required reason** when rejecting a broker or accreditation (shown to the broker on the gated panel). `/admin/brokers` can **suspend / reactivate** approved brokers (with reason). New broker status **`suspended`** (auto-gated out via `broker_is_approved()`). Needs migration **`0013_approval_workflow.sql`** applied (decision_reason columns + suspended in the status check). Vercel MCP added (`https://mcp.vercel.com`, pending OAuth). Remaining flow phases: consignee-request, job-order documents, broker edit/cancel, status lifecycle (after smoke test). See [[Roadmap]].

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
- **Job Orders** — customer submission + history; **admin processing live** (approve/process · hold · reject w/ note · complete) + printable A6 slip. See [[Job Orders]].
- **Account** — customer self-service at `/account` (name/contact/email/password; name change → re-verify). See [[Authentication]].
- **Administration** — approvals, customer/consignee management, square frosted-glass dashboard, owner-only staff settings. See [[Administration]].

## Backend

- Supabase project `mdlnfhyylvapzdubhyic` (KTC's own account). Migrations `0001_init` … **`0029_admin_job_order_processing`** — **all applied + tracked** in `public._migrations` (runner applies only new files). RLS enabled; role model via `is_owner`/`is_admin`/`status`. Email (Resend) fully wired (confirm + approval + reset).

## In progress / not yet

- Per-customer accredited-consignee scoping (currently master-list typeahead, ADR-0007).
- **Pricing on job orders** — the printable slip has an Amount column + totals slot reserved; no price fields in the DB yet.
- In-progress job-order **drafts**, document attachments, customer edit/cancel of own order.
- Playwright Phase 1 unauth smoke (11 tests, passing); Phase 2 authenticated flows pending a CAPTCHA-free path. No Vitest unit suite.

## Immediate priorities

**See [[Roadmap]] for authoritative sequencing.** Summary: (1) walk **ST02** on the live domain (new flow end-to-end); (2) finalize the Customer Agreement with counsel; (3) decide pricing model for the slip; (4) public launch hardening.
