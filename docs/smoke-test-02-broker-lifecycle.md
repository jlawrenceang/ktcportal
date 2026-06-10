# Smoke Test ST02 — Customer Lifecycle & Anti-Spam Guards (KTC Online Portal)

**Smoke Test ID:** ST02
**Date:** 2026-06-10
**Status:** READY TO EXECUTE — server-side guardrails verified (automated); browser lanes pending manual run
**Target:** https://portal.ktcterminal.com (prod-testing) — or local `npm run dev`
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)

## Purpose

Verify the full customer lifecycle on the renamed/rebranded system (**KTC Online Portal**, `customers` table): register (with contact number) → **branded confirm email** → **/verify-id** (DPA consent + valid-ID upload) → portal as *pending final verification* → file **held** job orders (deferred `JO-######` numbering) → admin verify/approve → held orders **release + number** + **approval email**. Plus the guards: held cap (10), open cap (10), 48h verification TTL, and 10-minute idle logout. Covers migrations `0014`–`0023` and ADR-0012.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (see template).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jla.ktcport@gmail.com` | server-only `is_owner`; admin portal |
| Test customer | a throwaway email you control (e.g. `you+st02@gmail.com`) | created during Lane A |

> Email is now fully wired (Resend domain verified; branded confirm + approval templates installed), so the email steps are **no longer blocked**.

---

## Preflight gate — ✅ PASS (2026-06-10)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npm run lint` | 0 errors | ✅ PASS |
| P2 Build | `npm run build` | PASS | ✅ PASS |
| P3 Deploy health | `HEAD https://portal.ktcterminal.com` | `200` | ✅ PASS |
| P4 Migrations | `node scripts/run-migrations.mjs` | tracked, only new applied | ✅ PASS — 23 tracked (… `0023_jo_number_prefix`) |
| P5 Schema | introspection | `customers` table, `contact_number` col, JO-prefix, owner-only | ✅ PASS — customers=1 (owner), contact_number present, job_orders=0 |
| P6 Confirm email template | Management API GET `/config/auth` | branded + subject + Confirm-email ON | ✅ PASS — subject "Confirm your KTC Online Portal account", logo+button present, `mailer_autoconfirm=false` |
| P7 E2E Phase 1 | `BASE_URL=…prod npx playwright test e2e/smoke.spec.ts` | passing | re-run after deploy |

---

## Lane G — Server-side guardrails (automated) — ✅ PASS (2026-06-10)

Exercised directly against the renamed `customers` schema (rows created, asserted, deleted; JO seq reset).

| ID | Guardrail | Expected | Result |
|---|---|---|---|
| G-1 | Held order has no number | `held` insert → `jo_number IS NULL` | ✅ |
| G-2 | Release assigns JO number | approve → `held`→`submitted` + **`JO-000001`** | ✅ |
| G-3 | Held cap | 11th `held` rejected | ✅ "at most 10 … on hold" |
| G-4 | Open cap | 11th open (`submitted/processing`) rejected | ✅ "10 open job orders — contact KTC admin" |
| G-5 | Completed frees a slot | `completed` doesn't count toward open cap | ✅ |
| G-6 | Reject/suspend cancels holds | status→rejected/suspended cancels `held` | ✅ |
| G-7 | Concurrent numbering | 5 simultaneous inserts → 5 distinct numbers | ✅ (UNIQUE backstop) |
| G-8 | TTL function | `expire_unverified_brokers()` runs (hourly pg_cron) | ✅ returns 0 |
| G-9 | Rename integrity | functions/policies/triggers resolve on `customers` | ✅ 14 policies, 3 triggers, held→release cycle works |

---

## Lane A — Customer lifecycle (register → held → verify → release)

**Objective:** A new customer can register with a contact number, confirm email, land on the verify-ID page, file held job orders, and have them released + numbered on approval.
**Start state:** Logged out at `/login`.

| ID | Screen | UI Action | Expected | Result | Evidence |
|---|---|---|---|---|---|
| A-1 | `/login` | Create account: full name + **contact number** + email + password; scroll the inline **KTC Customer Agreement** to the end; tick **both** consents; CAPTCHA; Sign up | "Account created — check your email" notice; `customers` row `status='pending'`, `contact_number` set | | |
| A-2 | inbox | Open the **branded** confirm email (KTC logo + orange button) → **Confirm** | Email confirmed; session created; **redirected to `/verify-id`** | | |
| A-3 | `/verify-id` | Observe | Focused page: "PENDING FINAL VERIFICATION", **DPA consent tick** (links to `/agreement`), valid-ID upload (disabled until ticked), and a **"Skip for now — continue to the portal →"** link | | |
| A-4 | `/verify-id` | Tick consent → upload a valid ID (image/PDF) | Stored to `valid-ids/{uid}/…`; `valid_id_path` + Terms/DPA consent timestamps recorded; redirected to the portal | | |
| A-5 | `/` (portal) | Observe | Full portal (Home / New Job Order / My Job Orders / Agreement) + **PENDING FINAL VERIFICATION** banner; Home shows **"Your Customer ID: BR-…"** | | |
| A-6 | `/job-order` | Fill + **File Job Order** | Saves; "filed (held)" confirmation; can't be processed until verified | | |
| A-7 | `/job-orders` | My Job Orders | Order shows **"Draft (no number yet)"** + "Pending approval" | | |
| A-8 | `/admin/approvals` (owner) | Re-login as owner; review the card | Shows email + **contact number**; badges: ✓ Email confirmed · ✓ Valid ID on file · Agreement v1 · ✓ Terms · ✓ DPA. "View valid ID" opens (signed URL) | | |
| A-9 | `/admin/approvals` | **Approve** | Row leaves queue | | |
| A-10 | inbox | — | Customer receives the **branded "account approved"** email | | |
| A-11 | `/job-orders` (customer) | Re-login as customer | The held order is now **`submitted`** with **`JO-000001`** | | |
| A-12 | `/admin/job-orders` (owner) | Admin queue | The released order is visible; held orders were **not** shown pre-release | | |

#### Lane closeout
- [ ] Lifecycle coherent end-to-end (register+contact → confirm → verify-id → held → approve → release + JO number + email)

---

## Lane B — Held cap (pending customer)

| ID | UI Action | Expected | Result |
|---|---|---|---|
| B-1 | File 10 held orders | All 10 saved (Draft / Pending approval) | |
| B-2 | Attempt an 11th | Blocked: "You can keep at most 10 job orders on hold until your account is verified…" | |

## Lane C — Open cap (verified customer)

| ID | UI Action | Expected | Result |
|---|---|---|---|
| C-1 | Submit 10 orders (approved) | All 10 `submitted`, each `JO-######` | |
| C-2 | Attempt an 11th | Blocked: "You have 10 open job orders — contact KTC admin to file more." | |
| C-3 | Admin completes one (when processing UI exists) | A slot frees; can file again | |

## Lane D — Idle auto-logout

| ID | UI Action | Expected | Result |
|---|---|---|---|
| D-1 | Sign in, idle 10 min | Auto sign-out → `/login` with "You were signed out after 10 minutes of inactivity." | |
| D-2 | Interact within 10 min | Session stays alive | |

> Tip: to test fast, temporarily set `IDLE_LOGOUT_MS` in `src/components/Shell.tsx` to `15 * 1000`, then revert.

## Lane E — Email-confirmation gate

| ID | UI Action | Expected | Result |
|---|---|---|---|
| E-1 | (Confirm email ON) register, but DON'T click the link; try to reach the portal | No session → `/login`. If a session ever exists unconfirmed, the **"Awaiting email confirmation"** page shows (with **Resend confirmation email**) | |

---

## Defects tracker

| ID | Lane / Action | Severity | Issue | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| | | | | | | OPEN |

## Final summary

| Lane | Status | Go / Hold |
|---|---|---|
| Preflight | ✅ PASS | Go |
| G — Server guardrails (auto) | ✅ PASS | Go |
| A — Lifecycle | | |
| B — Held cap | | |
| C — Open cap | | |
| D — Idle logout | | |
| E — Email-confirmation gate | | |

**Overall go / no-go:** ____

## Cleanup after run

- Delete the test customer (auth user + `customers` row) and its job orders; delete its `valid-ids/{uid}/…` file in the Storage dashboard.
- Reset numbering if needed (only safe with zero job orders): `select setval('public.jo_number_seq', 1, false);` → next is `JO-000001`.
- (I can run the customer/auth cleanup via the transaction pooler on request.)
