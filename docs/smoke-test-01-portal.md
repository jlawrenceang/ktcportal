# Smoke Test ST01 — Portal Core (Auth · CAPTCHA · Onboarding · Consignees · Job Orders · Admin)

**Smoke Test ID:** ST01
**Date:** 2026-06-07
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (prod-testing) — or local `npm run dev`
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)

## Purpose

Verify everything built up to checkpoint `checkpoint-2026-06-07`: the two role-gated portals, server-enforced CAPTCHA, broker onboarding gate, consignee accreditation, job-order submission, and owner-only staff creation — frontend + backend + side effects.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (see template).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; must land on Admin Portal |
| Test broker | a throwaway email you control | created during Lane 2 |
| Test staff | username created during Lane 5 | e.g. `smoketest1` |
| Test consignee | created during Lane 3 | e.g. name "ST01 Test Consignee" |

> CAPTCHA is live, so manual UI logins require solving the Turnstile widget. The `curl` checks bypass the UI to test server enforcement directly.

---

## Preflight gate (run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npm run lint` | 0 errors | ✅ PASS (2026-06-07) |
| P2 Build | `npm run build` | PASS | ✅ PASS (2026-06-07) |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | ✅ PASS — `200` |
| P4 Bundle target | fetch the `/assets/index-*.js` and grep | contains `mdlnfhyylvapzdubhyic.supabase.co`, NOT `twsylxbftvkwporglxnv` | ✅ PASS — KTC ref present, jta-sys absent (bundle `index-Bp95Fypb.js`) |
| P5 Turnstile inlined | grep bundle for site key | `0x4AAAAAADf_oKtFqQwj9HoP` present | ✅ PASS — present |
| P6 SPA rewrite | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com/admin/consignees` | `200` (not 404) | ✅ PASS — `200` |
| P7 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` with anon apikey | JSON `{"error_code":"captcha_failed", …}` | ✅ PASS — `captcha_failed` |

**Preflight: PASS** (all 7 green as of 2026-06-07). The browser lanes below (1–5) require manual execution. If any preflight fails on a later run, stop and fix.

---

## Lane 1 — Authentication & CAPTCHA

### Route 1A — Login gate, CAPTCHA, role landing

**Objective:** Login requires CAPTCHA; owner lands on Admin Portal; the auth API cannot be used without a token.
**Start state:** Logged out; on `/login`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects | Guardrail Test | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 1A-1 | `/login` | Load page | Logged out | — | KTC logo + Sign in form render | Turnstile widget visible (Managed: auto-passes legit clients, shows green check) | Submit gated until a token exists | **PASS** (manual 2026-06-09) |
| 1A-2 | `/login` | Observe CAPTCHA behavior | — | Turnstile (Managed) | Widget auto-issues a token for legitimate browsers — no manual puzzle | Green check appears automatically | **N/A** — Managed Turnstile auto-passes legit clients by design; real enforcement is server-side (see 1A-5). |
| 1A-3 | `/login` | Sign in as **owner** | owner exists | `supabase.auth.signInWithPassword` + captcha verify | Session created | Redirect to `/admin` (Admin Portal), Owner badge | Owner NOT dumped into broker portal | **PASS** (manual 2026-06-09) |
| 1A-4 | `/admin` | Observe shell | owner session | `useBroker` (`.eq('user_id')`) | Admin nav (Dashboard/Approvals/Brokers/Consignees/Job Orders/Settings) | Owner/Admin badge correct | `useBroker` returns owner's own row despite admin-all RLS | **PASS** (manual 2026-06-09) |
| 1A-5 | API | `curl` tokenless `POST /auth/v1/token` | anon key | Supabase Auth (Attack Protection) | `captcha_failed`, no login | — | Direct-API bypass blocked | **PASS** (preflight P7) |
| 1A-6 | header | Sign out | owner session | `supabase.auth.signOut` | Back to `/login` | Session cleared | — | **PASS** (manual 2026-06-09) |

#### Route closure
- [x] CAPTCHA present + server-enforced (Managed Turnstile auto-passes legit clients; tokenless API blocked)
- [x] Owner → `/admin`, never broker home
- [x] Tokenless API login rejected (`captcha_failed`)

#### Lane closeout
- [x] Auth + CAPTCHA coherent end-to-end — **PASS** (manual walkthrough 2026-06-09; Managed Turnstile confirmed working as designed)

---

## Lane 2 — Broker onboarding

### Route 2A — Register → pending → approve

**Objective:** A new broker registers with a valid ID, is gated as pending, and gains access only after admin approval.
**Start state:** Logged out.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects | Guardrail Test | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 2A-0 | header | **Sign out** of the owner account | owner session | `signOut` | Back to `/login` | — | — | | |
| 2A-1 | `/login` (register) | Click "Create one"; fill full name + email + password (no valid ID here); **scroll the inline KTC Broker Agreement to the end** ("View full ↗" opens `/agreement`); **tick both** (Terms & Conditions, DPA consent); CAPTCHA auto-passes; Sign up | logged out | `supabase.auth.signUp` (`emailRedirectTo` set) + consent in auth metadata; `handle_new_user` trigger creates the broker row | auth user + `brokers` row `status='pending'` | "Account created — check your email to confirm" notice | **Ticks disabled until scrolled to end; Sign up disabled until BOTH ticks checked** | | |
| 2A-2 | email inbox | Open the **confirmation email** (Resend, `noreply@ktcterminal.com`) → click **Confirm email** | account created | Supabase verify → `emailRedirectTo` | Email confirmed; broker returns to the app, signed in | Branded KTC template renders; logo + button OK | | |
| 2A-2b | `/` (pending panel) | Upload your **valid ID** | confirmed session | storage upload `valid-ids/{user_id}/…` + `brokers.valid_id_path`; consent columns synced from metadata | ID stored; "application complete, pending review" | per-user storage policy (session) | | |
| 2A-3 | `/` (Shell) | Observe | broker `pending` | `useBroker` | Pending-approval panel shown (asks for valid ID until uploaded) | New Job Order gated off | Un-approved broker cannot transact | | |
| 2A-4 | `/admin/approvals` (as owner) | Sign out, log back in as owner; open queue; review the broker card | owner session | select brokers (consent cols); signed URL | Broker visible with **review badges**: ✓ Valid ID on file · Agreement v1 · ✓ Terms {date} · ✓ DPA consent {date} | "View valid ID" opens the file (signed URL) | Only admin/owner can view valid IDs; missing items show amber ⚠ | | |
| 2A-5 | `/admin/approvals` | Approve the broker | owner session | update `brokers` `status='approved'`, `decided_at` | Status flips to approved | Row leaves pending list | — | | |
| 2A-6 | `/` (broker) | Sign out; re-login as broker | approved | — | Broker home with "Your Broker ID: BR-#####" | Nav unlocked (Home / New Job Order / My Job Orders / IRR) | — | | |

> **Note (email confirmation):** Lane 2 uses Supabase **Confirm email = ON** with **Resend** custom SMTP (sender `noreply@ktcterminal.com`). The broker confirms via the email link, then uploads the valid ID on first login (2A-2b). Requires: Resend SMTP wired in Supabase Auth + the "Confirm signup" template installed. Tip: use a `you+broker1@gmail.com` alias as the throwaway.

#### Route closure
- [ ] Pending gate blocks un-approved brokers
- [ ] Valid ID stored + admin-viewable
- [ ] Approval unlocks broker features

#### Lane closeout
- [ ] Onboarding coherent end-to-end

---

## Lane 3 — Consignees & accreditation

### Route 3A — Search, paginate, add (dup guard), accredit, approve

**Objective:** Admin can manage the 2,488-row consignee list and accredit/approve with required docs.
**Start state:** Owner on `/admin/consignees`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects | Guardrail Test | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 3A-1 | `/admin/consignees` | Load | owner session | select consignees `.range` | First page (≤200) renders; total reflects ~2,488 | Pagination control present | — | | |
| 3A-2 | `/admin/consignees` | Page to next batch | >200 rows | `.range(next)` | Next 200 rows load | Page indicator advances | Pagination actually advances (regression guard) | | |
| 3A-3 | `/admin/consignees` | Search a known name | data loaded | `.or` ilike | Matching rows filter in | Debounced; clears correctly | — | | |
| 3A-4 | `/admin/consignees` | Add consignee (name only) | — | insert `consignees` | New row created; code auto-generated | Appears in list | — | | |
| 3A-5 | `/admin/consignees` | Add a **duplicate** code/name | existing value | insert → `23505` | Friendly duplicate error | No row created | Duplicate guard fires | | |
| 3A-6 | `/admin/consignees` | Edit: add address + TIN + upload 2303 | row exists | update + storage upload | Accreditation fields saved; 2303 path set | "View 2303" works (signed URL) | — | | |
| 3A-7 | `/admin/consignees` | Try approve **without** 2303 | a row missing 2303 | approval guard | Approval blocked | Clear message | Cannot approve without name+address+TIN+2303 | | |
| 3A-8 | `/admin/consignees` | Approve a fully-accredited consignee | 2303 present | update `status='approved'` | Status flips to approved | Row reflects approved | — | | |

#### Route closure
- [ ] Search + pagination work over the full list
- [ ] Duplicate guard blocks dup code/name
- [ ] Accreditation requires 2303 before approval

#### Lane closeout
- [ ] Consignee management coherent end-to-end

---

## Lane 4 — Job orders

### Route 4A — Submit against an approved consignee

**Objective:** An approved broker submits a job order with service lines against a consignee chosen from the master list; both broker and admin can see it.
**Start state:** Approved broker session. (No accreditation prerequisite — per ADR-0007 the broker picks from the consignee master list.)

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects | Guardrail Test | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 4A-1 | `/job-order` | Open New Job Order; type ≥2 chars in the Consignee box | approved broker | `consignees` `.or` ilike `.limit(40)` | Typeahead returns master-list matches | Results list renders; "Type at least 2 characters" before that | Server-side search (handles >1000 rows); submit blocked until one is selected | | |
| 4A-2 | `/job-order` | Select a consignee + add service line(s) | search results shown | `SERVICE_REQUESTS` enum | Consignee chosen (box shows code – name, "Change" appears); lines added | Line UI updates | Only valid service types; "Select a consignee" error if none chosen | | |
| 4A-3 | `/job-order` | Submit | lines present | insert `job_orders` + `job_order_lines` | Header + lines persisted | Confirmation / redirect | — | | |
| 4A-4 | `/job-orders` | Open My Job Orders | submitted | select own job orders | The new order appears | Lines + consignee shown (via `one<T>()`) | Broker sees only own orders (RLS) | | |
| 4A-5 | `/admin/job-orders` (owner) | Open admin list | order exists | select all | The order is visible to admin | Broker + consignee resolved | Admin sees all orders | | |

#### Route closure
- [ ] Job order targets only approved consignees
- [ ] Header + lines persist; visible to broker (own) and admin (all)

#### Lane closeout
- [ ] Job-order submission coherent end-to-end

---

## Lane 5 — Admin: owner-only staff creation

### Route 5A — Create staff, login, revoke guard

**Objective:** Only the owner can create staff (username + password, no email); staff can log in; the owner cannot be revoked.
**Start state:** Owner on `/admin/settings`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects | Guardrail Test | Result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 5A-1 | `/admin/settings` | Observe (as owner) | owner session | — | "Create staff account" form visible | Staff list shows owner (Owner badge) | Non-owner admin sees "only the owner can change access" | | |
| 5A-2 | `/admin/settings` | Create staff: full name + username + password | owner session | `rpc('create_staff')` | auth user + `auth.identities` created; broker promoted admin/approved (atomic) | Notice with username; list refreshes | Token columns `''` (login works) | | |
| 5A-3 | `/login` | Sign in with the **username** (no @) | staff created | signIn maps to `<username>@ktc-staff.local` | Session created | Lands on `/admin` | CAPTCHA still required | | |
| 5A-4 | `/admin/settings` (as staff) | Observe | staff session | — | Cannot create staff (owner-only) | Read-only message | RPC rejects non-owner caller | | |
| 5A-5 | `/admin/settings` (as owner) | Look at owner row | owner session | — | No "Revoke admin" on owner | — | Owner cannot be revoked | | |
| 5A-6 | `/admin/settings` | Revoke the test staff | owner session | update `is_admin=false` | Staff demoted | Row updates | — | | |

#### Route closure
- [ ] Staff creation is owner-only and atomic
- [ ] Username login works + lands on admin
- [ ] Owner is non-revocable

#### Lane closeout
- [ ] Staff/access management coherent end-to-end

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | OPEN | |

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| Preflight | | | |
| 1 — Auth & CAPTCHA | | | |
| 2 — Broker onboarding | | | |
| 3 — Consignees & accreditation | | | |
| 4 — Job orders | | | |
| 5 — Admin staff | | | |

**Overall go / no-go:** ____

## Cleanup after run

- Delete the test broker, test consignee, and test job order if they were against real data.
- Revoke/remove the test staff account.
