---
title: Current State
tags: [memory, current]
type: memory
last_updated: 2026-06-22
---

# 📌 Current State (Runtime-Aligned)

> **For sequencing of what's next, read [[Roadmap]].** This page is a runtime snapshot — *what is live today*.

## 2026-06-22 — Self-service consignee/vessel requests, CIS-as-accreditation, rate matrix; fuel Phase 0 (deferred)

**Migrations through `0150` applied to prod** (portal lane `0124`–`0141`; fuel lane `0135`/`0140`/`0150`). Two concurrent lanes ran — the **portal/job-orders** lane and a new **fuel** lane (deliberately split numbers). See [[2026-06-22 Consignee+Vessel Requests, CIS, Rate Matrix, Fuel Phase 0]]. In one line each:

- **Self-service requests** — customers **request a consignee** (`request_consignee`, `0132`) or **vessel** (`request_vessel`, `0137`) that's missing; both are created **pending + usable-immediately** (file-now, KTC verifies in parallel). A recoverable **"needs info"** review state (`0138`) lets reviewers ask for more instead of rejecting; the customer edits & resubmits in-app. New **`review_consignee_requests`** gate (CSR), customer **My Requests** view, admin dashboard pending tile; consignee request now requires address + TIN + 2303 (`0139`).
- **CIS = consignee accreditation** — the Customer Information Sheet accredits the **consignee** (billed cargo-owner), not a broker account. `0133` modeled it on the broker and gated all filing; **`0136` reverted** that — one customer pool, one CIS on the consignee record, file-now with missing docs flagged. **Print CIS** = the filled sheet as a PDF.
- **Container rate matrix** (`0141`) — the **calculator's** `terminal_rates` tariff gains **empty/full × dry/reefer** (160 combos; 120 new cells `null` so it flags "rate not set", never ₱0); `job_order_lines` carry size/fill/kind; redesigned calculator + admin tariff editor. **Live billing is unchanged** (`service_rates`); the X-ray JO stays **operational/unpriced**.
- **Fuel monitoring Phase 0 (deferred)** — backend-only **derived-variance module** on the moves spine ([[ADR-0025]]; `equipment` + `fuel_dispense`/`fuel_delivery` ledgers + effective-dated `fuel_rates`/`fuel_settings` + `move_tally` + 7 views + RLS + audit, `0135`), a non-admin **`purchaser`** role (`0150`), and a trigger-ACL fix (`0140`). **Live in the DB, committed (`9407d39`), but no frontend** — Phase 1+ parked; focus is back on the portal. Detail: [[Fuel Monitoring (Yard Operations sub-module)]].
- **UI** — portal modals now render into `<body>` (no tabbar/footer overlap), consistent small-screen padding; Taglish on the new/redesigned screens.

## 2026-06-16 — Staff role matrix, two-gate completion, per-van X-ray, verify-QR

**Migrations through `0104`, all applied to prod (main @ `1b2e824`).** The big build day — see [[2026-06-16 Staff Roles, Supplements, Per-Van X-Ray, Verify]]. In one line each:

- **Staff model** — five staff roles **admin / operations / cashier / checker / csr** (+ owner / **root owner**) on the owner-tunable [[Staff Roles & Gates]] matrix; `process_job_orders` **split** into `accept_orders` / `hold_reject_orders` / `complete_orders` and enforced in `staff_transition_order`; X-ray confirmation is **checker-only**; root-only owner grants ([[Multi-Owner & Root Grants]]) + privilege-grant alerting.
- **Completion** — hard **[[Two-Gate Completion]]**: all services done AND base payment AND (RPS not needed OR paid) AND every supplement paid; auto-fires from whichever side finishes last; raw-update backstop.
- **X-ray** — confirmed **per container van** by the checker (BOC performs it), with an immutable name e-signature on the slip.
- **Payments** — RPS folded into the gate; **walk-in/office payment** at the [[Cashier Station]]; **[[Additional-Charge Supplements]]** (JO-####-A/B/C) with under-review re-completion.
- **Anti-forgery** — every slip carries a QR → public **[[Verify-QR Anti-Forgery|/verify/:id]]** (PAID + status + consignee/container cross-check).
- **Queue / comments / edit** — one **generalized priority number per JO** (weekly reset); **[[Comment Visibility & Escalation]]** (staff-only notes + complaint flag); staff JO-header edit (checker excluded).
- **Earlier same-day** — reworked rate calculator + per-line charge rules, **[[Support Tickets]]**, admin **bottom-tab nav**, **[[Staff Notifications]]** bell, consolidated customer email, atomic JO filing.

## 2026-06-13 — v1.1.0 trial-run release; ST02 manual lanes underway

**v1.1.0 live on `portal.ktcterminal.com`** (migrations through `0055`; prod wiped clean 2026-06-12 — first real order will be `JO-000001`). Everything since the 2026-06-10 snapshot, in one line each:

- **Payments & invoicing:** per-JO pay page (charges computation, bank/GCash + QR, payment-slip upload → admin confirm/reject), `/calculator`, ERP invoice recording (`OR-INV-`/`BI-INV-` + pad no. → PAID/BILLED chips), unpaid-completed view, admin-configurable `service_rates`/fees with pricing lock + server-guarded statutory VAT (`0050`), data-driven service catalogue (add/deactivate/reorder/safe-delete, `0051`).
- **Lifecycle & stations:** per-service serving numbers (weekly reset, vacate/restore rules), on-hold respond-&-resubmit + recoverable rejection loops, per-service ✓ completion, checker station (`/admin/checker`), admin file-on-behalf (`/admin/new-job-order`), order history trail, weekly archive + carry-over crons.
- **Roles & security:** cashier/checker roles + role-permission matrix, TOTP 2FA for admin/owner (server-enforced aal2, `0049`), single session per account — last-login-wins + dead-session RLS cut-off (`0054`/`0055`), idle timeouts everywhere (customer 15 min / staff 60 min) with "still there?" prompt, auto-suspend + owner alerts on escalation attempts (`0046`–`0048`), security headers/CSP in `vercel.json`, Logs tab + 15-min ops watchdog + System health panel (`0045`).
- **Onboarding & content:** Customer Agreement v2 (counsel sign-off pending), contact number at registration, `/verify-id` flow, ID retention 24h-guaranteed → 3-day auto-purge (`0052`/`0053`), per-role manuals + demo tours, version provenance in footers.
- **Testing:** ST02 (`docs/smoke-test-02-portal.md`) preflight **P1–P8 green** (P8 = Playwright 16/16 vs the test project, keys regenerated 2026-06-13); P9 (rates + payment-details entry) and manual Lanes 1–8 in progress with the owner.

*Detail: `CHANGELOG.md` v1.1.0 + sessions 10a–10s.*

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

- **Auth** — customer email/password registration (contact no. + Agreement v2 consents) → confirm email → `/verify-id`; staff username login; owner failsafe; invite-only staff; CAPTCHA, lockout, 2FA (admin/owner), single session, idle timeouts. See [[Authentication]].
- **Customers** — self-register → `pending` (full portal, held orders) → upload ID → admin approval; 48h TTL; suspend/reject loops. See [[Brokers]].
- **Consignees** — admin CRUD, search, pagination (2,488 imported), approval, accreditation (address/TIN/2303). See [[Consignees]].
- **Job Orders** — customer + CSR/operations-on-behalf filing, **one priority number per JO** (weekly reset), gated transitions (`staff_transition_order` + split gates), hold/respond + recoverable reject loops, **per-van X-ray** (checker), DEA/OOG service-done, **[[Two-Gate Completion]]**, base + RPS + **supplement** payments, walk-in payment, ERP invoice recording, printable A6 slip + **verify-QR**, timeline comments + staff-only notes/flags, weekly archive/carry-over. See [[Job Orders]], [[Job Order Lifecycle]].
- **Account** — `/account` self-service (name/contact/email/password; name change → re-verify). See [[Authentication]].
- **Administration** — approvals, customers, consignees, JO queue, **stations** (operations / checker / [[Cashier Station|cashier]] / [[Support Tickets|CSR support]]), payments review + walk-in, rates/fees/tariff/charge-rules/RPS-rates config, staff + **[[Staff Roles & Gates|role gates]]** + root-owner grants, **[[Staff Notifications]]** bell, bottom-tab nav, Logs, System health, manuals + tours. See [[Administration]].

## Backend

- Supabase project `mdlnfhyylvapzdubhyic` (KTC's own account). Migrations `0001_init` … **`0150_purchaser_role`** (141 files; numbering split across a portal lane and a fuel lane) — **all applied + tracked** in `public._migrations`. RLS + role-permission matrix (`has_permission`) + `session_alive()` woven into all helpers; pg_cron jobs (see [[System Scale]]). Email (Resend) fully wired (consolidated nudge, `0099`).

## In progress / not yet

- **ST02 manual Lanes 1–8** on live (owner walking them now); P9 = real rates/fees + bank/GCash/QR entry in Settings.
- Customer Agreement v2 **counsel sign-off** (DPO designation, NPC registration, liability cap).
- Per-customer accredited-consignee scoping (master-list typeahead stands, ADR-0007).
- JO drafts, document attachments; BOC Sheets mirror (blocked on Google service-account creds); 4 Playwright mutation lanes (`fixme`). No Vitest unit suite.
- Management-API scripts blocked: `SUPABASE_ACCESS_TOKEN` holds a secret key, not a `sbp_` PAT (see `docs/agent/tooling-inventory.md`).

## Immediate priorities

**See [[Roadmap]] for authoritative sequencing.** Summary: (1) finish **ST02** manual lanes + teardown (reset `jo_number_seq`/`broker_code_seq` after); (2) counsel sign-off on Agreement v2; (3) go-live/public-launch call.
