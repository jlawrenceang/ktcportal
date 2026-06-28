# Smoke Test ST07 — Full-lifecycle + adversarial + load smoke (break-test derived)

**Smoke Test ID:** ST07
**Date:** 2026-06-28
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — **v1.6.76 / DB migrations through `0186`**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Derived from:** the **2026-06-28 sandbox break-test** (`docs/audits/2026-06-28-breaktest-findings.md`) — the 33-finding adversarial dress rehearsal turned into a repeatable smoke. Each lane carries a **🧪 Emulated sandbox result (2026-06-28)** note recording what the sandbox run actually observed.

> **First executed as a sandbox emulation, not a browser walk.** ST07 was first run as a **17-agent ultracode break-test** on the **isolated** test project `zwvzadkgeyhkhyshkwhc` (data-isolated from prod, per the `break-testing` cardinal rule — isolate DATA, not just code). **Seed:** 50 approved+consented customers, 10 staff (1 admin / 3 operations / 2 cashier / 2 checker / 2 csr), **1,666 approved consignees copied from prod**, non-zero rates. Coverage: 10 full-lifecycle scenarios + a 50-customer/10-staff concurrency load + 5 adversarial probes + synthesis. After remediation **migration `0186` / v1.6.76**, a **9-agent behavioral re-test (14/14 PASS)** re-verified every repro plus a Jarvis code review. The lane tables below are the **repeatable, executable** form of those paths; the 🧪 notes are the emulated outcomes.

## Purpose

ST07 is the **whole-spine dress rehearsal + edge/branch + adversarial + concurrency** pass — the break-test made repeatable. Where ST05 is the broad onboarding/X-ray/payments/release walkthrough and ST06 is the focused **ADR-0035 deltas** pass, **ST07 stresses the entire system end-to-end to release, exercises every branch (hold/reject/cancel/priority/re-X-ray/charges/RPS), then attacks it** (evil inputs, out-of-order, permission bypass, cross-tenant reads, cap overflow, concurrency). It proves:

- **The full spine completes** — file → accept → X-ray → invoice → pay → auto-complete → release → docs → charge → pay → OR → released (Lane A).
- **Every branch resolves or terminates correctly** — on-hold resolution (B), reject-is-terminal (C), cancel (D), priority (E), re-X-ray (F), request→bill charges (G), walk-in + RPS-at-window (H), consignee request lifecycle (I).
- **The security walls hold** — adversarial inputs, permission bypass, RLS isolation, caps (J).
- **The DB/RPC layer survives concurrency** — 50×10 with integrity intact (K).
- **The `0186` fixes landed** — Lanes B/F/G/I/J carry explicit guardrail rows verifying each shipped critical/high fix.

Verify frontend **and** backend (the SECURITY DEFINER RPC + its gate) **and** side effects at each click. ST07 is a **destructive** pass (it cancels, rejects, and fires evil inputs) — run it on the live pre-public build or, preferably, re-run the sandbox emulation; never on prod once real customer rows exist.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Verified role → permission matrix (ground truth — `docs/diagrams/role-and-operation-flows.md`, live `role_permissions`, migrations through `0186`)

| Permission | admin | operations | cashier | checker | csr |
|---|:--:|:--:|:--:|:--:|:--:|
| view_job_orders | ✓ | ✓ | ✓ | ✓ | ✓ |
| view_xray_queue | ✓ | ✓ |  | ✓ | ✓ |
| file_job_orders | ✓ |  |  |  | ✓ |
| accept_orders | ✓ | ✓ |  |  |  |
| process_job_orders | ✓ | ✓ |  |  |  |
| complete_orders | ✓ | ✓ |  |  |  |
| hold_reject_orders | ✓ | ✓ |  |  |  |
| confirm_xray |  |  |  | ✓ |  |
| request_priority | ✓ | ✓ |  |  | ✓ |
| approve_priority | ✓ |  |  |  |  |
| request_rexray | ✓ | ✓ |  | ✓ |  |
| approve_rexray | ✓ |  |  |  |  |
| request_supplement | ✓ | ✓ |  |  |  |
| bill_supplement | ✓ |  | ✓ |  |  |
| assess_rps | ✓ | ✓ |  |  |  |
| review_payments | ✓ |  | ✓ |  |  |
| record_invoice | ✓ |  | ✓ |  |  |
| verify_release_docs | ✓ |  |  |  | ✓ |
| review_consignee_requests | ✓ |  |  |  | ✓ |
| manage_vessel_schedule | ✓ | ✓ |  |  |  |
| manage_support | ✓ |  |  |  | ✓ |
| manage_approvals / manage_customers / manage_consignees / manage_pricing | ✓ |  |  |  |  |

**Unchanged from ST06.** Migration `0186` was a **break-test remediation** (RPC guards + one `useAdminCounts.ts` perm fix for KTC-11 — `manage_consignees` → `review_consignee_requests`); it did **not** re-shape the role matrix. Owner bypasses every gate (failsafe). The server enforces the **live** matrix.

## Test accounts / data

ST07 can run two ways — re-run the **sandbox emulation** (preferred; fully isolated and destructive-safe), or a **live pre-public walk** with the accounts below.

| Role | Live-execution identity | Sandbox-emulation seed |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` (server-only `is_owner`; failsafe) | the project owner on `zwvzadkgeyhkhyshkwhc` |
| Admin | _create via Settings → Staff_ (everything except `confirm_xray`; approves priority + re-X-ray; bills charges) | 1 admin |
| Operations | `st07ops` (accept/process/RPS/vessels + **request** priority/re-X-ray/charge; no money; monitors X-ray) | 3 operations |
| Cashier | `st07cash` (`review_payments` + `record_invoice` + `bill_supplement`; money-only) | 2 cashiers |
| Checker | `st07check` (`confirm_xray` + `request_rexray`) | 2 checkers |
| CSR | `st07csr` (support + file-on-behalf + release-doc verify + consignee-request review + `request_priority`; never changes order status) | 2 csr |
| Test customers | ≥2 throwaway emails you control, **`approved`** (need a 2nd customer for the cross-tenant/foreign-cancel guardrails in D/J) | **50 approved + consented customers** |
| Consignees | ≥1 **approved** consignee to file against (Lane A); +1 to request/reject/resubmit (Lane I) | **1,666 approved consignees copied from prod** |
| Rates | Settings → Service rates & fees **non-zero** (X-ray rate + admin/print fees) + RPS per-move rates set | non-zero rates seeded |

> **Preconditions before the lanes:**
> - Settings → **Service rates & fees** + **RPS per-move rates** non-zero (so pay-page totals compute).
> - Settings → **Payment details** (bank / GCash / QR) filled.
> - At least one **current vessel** on the schedule + one **approved consignee** (a consignee must be approved before it can be used to file, `0167`/`0169`).
> - Two approved test customers (the second one drives the **foreign-cancel / cross-tenant RLS** guardrails in Lanes D and J).
> - Emails/bells: per [[emails-suspended-by-default]] customer emails may be **off**; when off, confirm the **in-app bell** is the surfaced side effect.
>
> **Go-live numbering note:** this run consumes `JO-0000xx` (+ `A` suffixes), `RO-0000xx`, and serving-lane numbers, and it cancels/rejects orders. Reset sequences after teardown only at a true zero-real-rows state — see ST05 Cleanup. Prefer the sandbox.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npm run lint` (`tsc --noEmit`) | 0 errors | |
| P2 Build | `npm run build` | PASS | |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | |
| P5 SPA rewrite | `curl … /app/operations` · `… /app/cashier` · `… /app/checker` · `… /app/support` · `… /admin/job-orders` · `… /releases` | `200` (not 404) for all | |
| P6 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | |
| P7 Version + migration | read `src/version.ts`; over the Management API count applied migrations | `APP_VERSION = v1.6.76`; latest migration `0186` applied | |
| P8 `0186` fixes resolve (latest defs) | over the Management API, confirm the remediation landed | `jo_supplements.amount` is **nullable** (KTC-01); `enforce_two_gate_complete` delegates the free-re-X-ray exemption to `jo_ready_to_complete` (KTC-02); `complete_on_payment_confirmed` has the billed-unpaid-supplement clause (KTC-03); `review_payment`/`record_office_payment`/`review_supplement_payment`/`record_supplement_office_payment` raise on `cancelled`/`rejected` (KTC-05/34); `file_job_order` has the container-count cap + service whitelist (KTC-08/09); `guard_broker_protected_fields` casts the array append (KTC-17) | |
| P9 Matrix server-side | read live `role_permissions where allowed` over the Management API | matches the verified matrix above; `useAdminCounts` consignee badge gated on `review_consignee_requests` (KTC-11) | |
| P10 Playwright Phase-1 | `BASE_URL=https://portal.ktcterminal.com npm run test:e2e -- e2e/smoke.spec.ts` | all unauth smoke pass (routing, AuthRail menu, protected-route redirects incl. `/app/*`, SPA rewrite, Turnstile) | |

If any preflight check fails, pause and fix first.

---

## Lane A — Happy path to release (the full spine)

### Route A — File JO → accept → X-ray → invoice → pay → auto-complete → file release → verify → charge → pay → OR → released

**Objective:** Drive one shipment through **both spines** end to end, each step taken by its **correct role**, proving the JO spine auto-completes and the Release spine reaches `released` with an OR + ERP invoice on file.
**Start state:** an `approved` test customer; an `approved` consignee; non-zero rates; staff created.

**🧪 Emulated sandbox result (2026-06-28): PASS.** The JO **auto-completed the instant the base payment confirmed** (X-ray was already done), and the release reached `released` with the OR + ERP invoice recorded. Every step succeeded as its correct role; no gate had to be bypassed.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | `/job-order` (customer) | File a JO — X-ray service, an **approved** consignee, ≥1 container line | approved customer | `file_job_order` | `job_orders` row `status='submitted'`; `jo_number='JO-0000xx'`; serving-number row assigned | order appears in My Job Orders; staff queue shows it | filing against an **unapproved** consignee is refused (`0167`/`0169`) | | |
| A-2 | `/app/operations` (ops) | **Accept** the submitted JO | ops session | `staff_transition_order` (→ processing) | `status='processing'` | leaves the unaccepted bucket | cashier/checker/csr can't accept (`accept_orders` denies) | | |
| A-3 | `/app/checker` (checker) | Confirm the X-ray for each container van | processing JO | `record_van_xray` | last van rolls up → X-ray service done | per-van e-signature stamped | only `confirm_xray` (checker) can confirm; ops/admin can view, not confirm | | |
| A-4 | `/app/cashier` (cashier) | **Record ERP invoice #** + **BIR pad serial** | base proof or walk-in pending | `record_service_invoice` | `service_invoice_no` normalized, `invoice_pad_no` set, `invoice_recorded_at` stamped | live padded preview | all-zeros ERP / bad pad serial rejected (`record_invoice`-gated) | | |
| A-5 | `/app/cashier` (cashier) | **Record office (walk-in) base payment** | invoice on file, X-ray done | `record_office_payment` (`'base'`) | base `payment_status='confirmed'` → **two-gate met → AUTO-completes**; `completed_at` stamped | "Cleared for release"; completed bell | base confirm without an invoice is refused (`0177`/`0178`) | | |
| A-6 | `/releases` (customer) | File a Release / Pull-out — consignee + BL + DO/BL upload | approved customer | `file_release_order` | release row `status='submitted'`; `RO-0000xx` | appears in My Releases | a non-approved customer can't file a release (no held path) | | |
| A-7 | `/app/support` (csr) | **Verify** the release docs | csr session | `verify_release_docs` | `status='docs_verified'` | docs marked verified | cashier/ops/checker can't verify docs | | |
| A-8 | `/app/support` (csr/admin) | **Set release charges** (once, non-zero) | docs verified | `set_release_charges` | `status='payable'` | charge shown to customer | charge set **once**; re-set blocked (additions go via `add_release_charge`) | | |
| A-9 | `/release/:id/pay` (customer) | Pay the release charge (upload proof) | payable | `submit_release_payment` | proof `submitted` | cashier sees the proof | proof scoped to this release | | |
| A-10 | `/app/cashier` (cashier) | **Confirm** the release payment | proof submitted | `confirm_release_payment` | `status='paid'` | balance clears | confirm acts only on a `submitted` proof (idempotent) | | |
| A-11 | `/app/cashier` (cashier) | **Record OR + ERP control no.** | paid, all supplements confirmed | `record_release_or` | `status='released'`; OR + ERP no. stamped | released; pull-out cleared | OR blocked if any supplement unpaid (`0131`) | | |

#### Route closure
- [ ] The JO spine completes **automatically** the instant the last gate (here, base payment) lands
- [ ] Each step is taken by its **correct role** (no gate bypassed)
- [ ] The Release spine reaches `released` with the OR + ERP invoice on file

#### Lane closeout
- [ ] Full file→released spine coherent end-to-end (🧪 sandbox PASS)

---

## Lane B — On-hold resolution (field-targeted hold → respond & resubmit)

### Route B — Ops holds (general + field-targeted); customer responds in-app; KTC-06 container-swap invalidation holds

**Objective:** Ops puts a JO `on_hold` (general **and** field-targeted: entry / containers / vessel); the customer resolves it **in-app** via the "Respond & resubmit" form (`MyJobOrders.tsx` NeedsInfoForm) back to `submitted` with `needs_fields` cleared. **The `0186` guardrail (KTC-06):** a container-set change on resubmit now also invalidates prior base payment + ERP invoice + X-ray completion.
**Start state:** a `submitted`/`processing` JO owned by the test customer; signed in as `st07ops`, then the customer.

**🧪 Emulated sandbox result (2026-06-28): PASS.** The in-app respond-and-resubmit path works; guards were clean — ownership-scoped, status-guarded, required flagged fields enforced, unflagged fields locked server-side, CSR denied. **KTC-06** (container swap on resubmit kept prior payment + X-ray "done" → revenue leak + customs/X-ray bypass) was a **pre-0186 HIGH** — **FIXED in 0186** and re-verified; B-4 below is the explicit guardrail row.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | `/app/operations` (ops) | **Hold** the JO with a general note | ops session | `hold_job_order` | `status='on_hold'`, `admin_note` set; serving number vacated | customer sees the note; order off the active board | a held order can't be paid/processed until resolved | | |
| B-2 | `/app/operations` (ops) | Re-hold flagging specific fields (entry / containers / vessel) | on_hold/processing | `hold_job_order(['entry_number','containers','vessel'])` | `needs_fields` set to the flagged set | the customer form reveals only the flagged inputs | flagging is the contract — unflagged fields stay locked | | |
| B-3 | `/job-orders` (customer) | "Respond & resubmit" — fill the flagged fields → submit | on_hold JO, owned | `resubmit_needs_info` | `status='submitted'`; `needs_fields` cleared | order re-enters the queue at a **new tail** serving number | required flagged fields enforced; **unflagged fields can't be changed** (server-side); a foreign customer / CSR can't resubmit | | |
| B-4 | `/job-orders` (customer) | Resubmit changing the **container set** on a JO that was **already paid + X-rayed** | on_hold w/ `containers` flagged, prior base paid + X-ray done | `resubmit_needs_info` (containers branch) | **KTC-06 fix:** `payment_status` reset to `unpaid`, `service_invoice_no`/invoice fields nulled, affected `service_completions` deleted + `xray_done_at` cleared | the order no longer reads "paid/cleared" for the new container set | a container change can **never** carry a stale paid/X-ray-done state forward (revenue-leak + customs-bypass closed, `0186`) | | |

#### Route closure
- [ ] Ops can hold **generally** and **field-targeted**; only flagged fields are editable on resubmit
- [ ] The customer resolves the hold **in-app** (NeedsInfoForm) → `submitted`, `needs_fields` cleared; foreign/CSR resubmit denied
- [ ] **KTC-06 (FIXED 0186):** a container-set change resets payment + invoice + X-ray completion

#### Lane closeout
- [ ] On-hold resolution coherent end-to-end (🧪 sandbox PASS; KTC-06 re-verified)

---

## Lane C — Reject is terminal

### Route C — Ops rejects; all customer recovery RPCs error; the only recovery is filing a new order

**Objective:** A rejected JO is **terminal** — `rejected_recoverable` is forced `false`, every customer order-level recovery RPC errors, and the only path forward (matching the UI copy) is to **file a new order**.
**Start state:** a `submitted` JO owned by the test customer; signed in as `st07ops`, then the customer.

**🧪 Emulated sandbox result (2026-06-28): PASS (by design).** The reject was terminal and every order-level recovery RPC raised. Two **open mediums/lows** surfaced (NOT yet fixed): **KTC-13** — the legacy `resubmit_rejected` grant still exists and pre-`0154` rejected rows lack the `rejected_recoverable=false` backfill, so a legacy row could be bypassable; **KTC-25** — the customer "needs action" count still includes recoverable-rejected orders the action list can't render (stale badge). Both are tracked in the Defects tracker.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | `/app/operations` (ops) | **Reject** the submitted JO with a note | ops session | `hold_job_order` / `staff_transition_order` (→ rejected) | `status='rejected'`, `rejected_recoverable=false`; serving number vacated | customer sees the rejection note + "file a new order" copy | only `hold_reject_orders` (ops/admin) can reject | | |
| C-2 | `/job-orders` (customer) | Attempt order-level recovery (resubmit / resubmit-rejected / cancel — forced RPC) | rejected JO, owned | `resubmit_needs_info` / `resubmit_rejected` / `cancel_job_order` | **all raise** — a `rejected` order is terminal | no order-level recovery control rendered | the customer can't self-revive a terminal reject (matches the UI copy) | | |
| C-3 | `/job-order` (customer) | File a **new** JO instead | approved customer | `file_job_order` | a fresh `submitted` JO with a new number | the new order enters the queue normally | filing a new order is the **only** recovery path | | |
| C-4 | (defect watch) | Confirm the two open recovery gaps | — | `resubmit_rejected` grant / `needs action` count | **KTC-13:** legacy `resubmit_rejected` still granted + pre-`0154` rows un-backfilled → potentially bypassable. **KTC-25:** stale "needs action" count includes recoverable-rejected orders | note both; do not block | OPEN — tracked (NOT fixed in 0186) | | |

#### Route closure
- [ ] Reject is terminal — `rejected_recoverable=false`; every order-level recovery RPC errors
- [ ] The only recovery is filing a **new** order (matches the UI copy)
- [ ] KTC-13 + KTC-25 logged as **open** defects (not fixed)

#### Lane closeout
- [ ] Reject-is-terminal coherent end-to-end (🧪 sandbox PASS by design; 2 open mediums/lows)

---

## Lane D — Cancel

### Route D — Customer cancels a submitted order; serving number is burned; idempotent + foreign-cancel refused

**Objective:** A customer cancels their own `submitted` JO → `cancelled`, the serving number is **vacated (burned, never reused)**; a re-cancel is **idempotent/refused** and a **foreign customer** can't cancel someone else's order.
**Start state:** a `submitted` JO owned by customer #1; a 2nd approved customer signed in for the foreign-cancel guardrail.

**🧪 Emulated sandbox result (2026-06-28): PASS.** The cancel vacated the serving number (burned, not reused by the next filing), the re-cancel was refused, and the foreign-customer cancel was refused at the ownership/RLS layer.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | `/job-orders` (customer #1) | **Cancel** the submitted JO | owned, `submitted` | `cancel_job_order` | `status='cancelled'`; serving number **vacated** | order leaves the active queue | cancel allowed only while `submitted`/`on_hold` (not once `processing`) | | |
| D-2 | (DB / queue) | File the **next** JO and check its serving number | post-cancel | `serving_numbers_on_status` trigger | the new order gets a **fresh tail** number — the burned one is **not** reused | queue numbering continues forward | a vacated number is never recycled | | |
| D-3 | `/job-orders` (customer #1) | **Cancel again** (forced RPC) on the already-cancelled order | `cancelled` JO | `cancel_job_order` | **refused / no-op** — not re-cancellable | no state change | re-cancel is idempotent/guarded | | |
| D-4 | `/job-orders` (customer #2) | Try to cancel **customer #1's** order (forced RPC) | foreign order | `cancel_job_order` | **refused** — ownership/RLS denies | nothing visible to customer #2 | a customer can only cancel their **own** order | | |

#### Route closure
- [ ] Cancel from `submitted` → `cancelled`; serving number **burned, not reused**
- [ ] Re-cancel is idempotent/refused
- [ ] Foreign-customer cancel is refused (ownership/RLS)

#### Lane closeout
- [ ] Cancel coherent end-to-end (🧪 sandbox PASS)

---

## Lane E — Priority lane (request → approve, with negative auth)

### Route E — Ops requests priority; admin approves (P-1 lane) or denies; revoke-after-grant blocked

**Objective:** Ops **requests** priority (`request_priority`); an **admin approves** (`review_priority`) — moving the order to the **priority lane** (queue number vacated, **P-1** assigned) — or **denies** (flag cleared). The requester can't self-approve, a granted order can't be revoked, and customer/checker can't request.
**Start state:** a `submitted`/`processing` JO; signed in as `st07ops`, then the admin.

**🧪 Emulated sandbox result (2026-06-28): PASS (mechanics).** Request → approve → P-1 lane worked; deny cleared the flag; revoke-after-grant was blocked; negative auth held (customer/checker can't request; ops can't approve). Two **open mediums** surfaced (NOT fixed): **KTC-18** — the **desktop Checker** view shows **no lane chip** for a priority order (it silently re-sorts); **KTC-30** — the main **AllJobOrders** admin/ops queue shows a Priority **chip but does NOT move the order ahead** (the sort isn't applied there). Both logged.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | `/app/operations` (ops) | **Request priority** on an open JO | `request_priority` (ops/csr/admin) | `request_priority(p_id)` | `priority_status='requested'` | "Priority requested" chip | an already-granted order can't be re-requested | | |
| E-2 | `/app/operations` (ops) | Try to **approve** priority (forced RPC) | ops session | `review_priority` | **denied** — ops can't approve | no approve control for ops | `approve_priority` is admin-only (no self-approve) | | |
| E-3 | `/admin/job-orders` (admin) | **Approve priority** | `approve_priority` (admin) | `review_priority(p_id,true)` | `priority_status='granted'`; old queue number vacated, **P-1** priority-lane number assigned | ★ Priority chip; jumps ahead in the checker/ops queue | approving a non-requested order raises (`0183`) | | |
| E-4 | `/admin/job-orders` (admin) | **Deny priority** on a different requested JO | admin session | `review_priority(p_id,false)` | `priority_status` cleared (NULL); stays regular lane | chip clears | denying a non-requested order raises (`0183`) | | |
| E-5 | `/admin/job-orders` (admin) | Try to **revoke** a granted priority (forced RPC) | granted JO | `review_priority` | **blocked** — a grant can't be revoked | no revoke control | revoke-after-grant is not a path | | |
| E-6 | (customer / checker) | Try `request_priority` as customer + as checker (forced RPC) | wrong roles | `request_priority` | **denied** for both | no request control for either | only `request_priority` roles (ops/csr/admin) can request | | |
| E-7 | (defect watch) | Confirm the two lane-display gaps | granted JO | queue sort/chip | **KTC-18** desktop Checker shows no lane chip; **KTC-30** AllJobOrders chip doesn't sort | note both | OPEN — tracked (NOT fixed in 0186) | | |

#### Route closure
- [ ] Ops requests; only an admin approves/denies (no self-approve, no revoke-after-grant)
- [ ] Approve → priority lane (P-1, queue number vacated); deny clears the flag
- [ ] Negative auth holds (customer/checker can't request); KTC-18 + KTC-30 logged as **open**

#### Lane closeout
- [ ] Priority lane coherent end-to-end (🧪 sandbox PASS mechanics; 2 open mediums)

---

## Lane F — Re-X-ray lane (the KTC-02 dead-end, fixed)

### Route F — Checker requests a re-X-ray on a completed JO → child JO-####A → admin approves → child auto-completes

**Objective:** On a **completed** JO, a checker **requests a re-X-ray** (`request_rexray`), creating an internal **child** (`JO-000001A`, containers copied); an **admin approves** (`review_rexray`) into the re-X-ray (R-1) lane; the checker X-rays the child and the **free child auto-completes** on services-done.
**Start state:** a `completed` JO from Lane A; signed in as `st07check`, then the admin.

**🧪 Emulated sandbox result (2026-06-28): was a DEAD-END pre-0186, now FIXED + re-verified PASS.** **KTC-02 (CRITICAL):** `enforce_two_gate_complete` required `payment_status='confirmed'` with **no** free-re-X-ray exemption, while `jo_ready_to_complete` had it — so a free re-X-ray child's `record_van_xray` rolled the whole transaction back and the child was stuck in `processing` forever (the feature was 100% dead end-to-end). **FIXED in 0186** by delegating the backstop to `jo_ready_to_complete` so the two gates can't drift; the re-test confirmed the **free child now auto-completes**. F-3 is the explicit guardrail row.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | `/app/checker` (checker) | On the completed JO, **Request re-X-ray** | `request_rexray` (checker/ops/admin) | `request_rexray(p_parent)` | child row: `is_rexray=true`, `parent_job_order_id` set, `rexray_status='requested'`, `jo_number='JO-####A'`, X-ray containers copied, `status='submitted'` | confirm popup names the suffixed child; **staff** pinged (`notify_staff`, `0183`) | request only on a **`completed`** non-re-X-ray order; child emits **no** customer notifications | | |
| F-2 | `/admin/job-orders` (admin) | **Approve re-X-ray** (free; leave billable off) | `approve_rexray` (admin) | `review_rexray(p_id,true,false)` | child `rexray_status='approved'`, `status='processing'`, `rexray_billable=false`; enters the R-1 lane | Re-X-ray chip; appears in the checker re-X-ray lane | approving via the generic `accept_orders` path is blocked (`0178`); can't X-ray before approval (`0181`) | | |
| F-3 | `/app/checker` (checker) | Confirm the child's X-ray van(s) | child approved | `record_van_xray` → `enforce_two_gate_complete` | **KTC-02 fix:** last van rolls up X-ray done → the **free re-X-ray child AUTO-completes** (no payment gate, no rollback); `completed_at` stamped | child → `completed` | a **free** re-X-ray completes on services-done alone — the backstop no longer demands payment (`0186`); a **billable** re-X-ray would still require payment | | |

#### Route closure
- [ ] Re-X-ray only on a **completed** order; builds a suffixed internal child (X-ray lines copied); staff pinged
- [ ] Admin approves into the R-1 lane; can't X-ray before approval / via the generic path
- [ ] **KTC-02 (FIXED 0186):** the free re-X-ray child now **auto-completes** (was a permanent dead-end)

#### Lane closeout
- [ ] Re-X-ray lane coherent end-to-end (🧪 sandbox FIXED + re-verified PASS)

---

## Lane G — Additional charges (request → bill → pay → confirm); the KTC-01 + KTC-03 fixes

### Route G — Ops requests a charge (label only); cashier bills it; un-priced never blocks; billed-unpaid does block

**Objective:** Ops **requests** a charge with a **label only** (`request_supplement`, no amount); the **cashier bills** it (`bill_supplement`, sets the amount); the customer pays; the cashier confirms. A **requested (un-priced)** charge never blocks completion; a **billed-unpaid** charge **does** block; billing on a completed order doesn't reopen it.
**Start state:** a `processing` JO; signed in as `st07ops`, then `st07cash`, then the customer.

**🧪 Emulated sandbox result (2026-06-28): two criticals here, both FIXED + re-verified PASS.** **KTC-01 (CRITICAL):** `request_supplement` inserted `NULL` into the NOT-NULL `jo_supplements.amount` — the RPC **crashed on every call**, so ops "Request a charge" was dead on arrival and the ADR-0035 maker-checker split was non-functional. **KTC-03 (CRITICAL):** when base/RPS payment confirmed **last**, a **billed-unpaid** supplement did **not** block completion — the order auto-completed with money owed. **Both FIXED in 0186** (`amount` made nullable; `complete_on_payment_confirmed` got the billed-unpaid-supplement clause) and re-verified. G-1 and G-5 are the explicit guardrail rows.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | `/app/operations` (ops) | **Request charge** — pick a label, **no amount** | `request_supplement` (ops/admin) | `request_supplement(p_jo,p_label)` | **KTC-01 fix:** `jo_supplements` row written, `amount=NULL`, `bill_status='requested'` (no NOT-NULL crash) | the **cashier** is pinged ("set the amount to bill it") | the RPC **succeeds** (was dead-on-arrival pre-0186); ops can't set the amount | | |
| G-2 | `/app/operations` | Verify the un-priced request does **not** block completion | G-1 done, JO otherwise ready | `jo_ready_to_complete` / `sync_open_supplement` | `has_open_supplement` stays false (only **billed**-unpaid sets it) | no phantom balance on the customer's order | a `requested` (un-priced) supplement never blocks the two-gate | | |
| G-3 | `/app/cashier` (cashier) | **Bill** the requested charge — enter amount > 0 | `bill_supplement` (cashier/admin) | `bill_supplement(p_id,p_amount)` | `amount` set, `bill_status='billed'`; now a payable; customer notified | charge appears as its own PaySection; `has_open_supplement=true` | zero/negative rejected; billing a non-`requested` supplement rejected (no double-bill) | | |
| G-4 | `/job-order/:id/pay` (customer) | Pay the billed supplement (upload proof) | billed | `submit_supplement_proof` | supplement `payment_status='submitted'` | cashier's Additional-charges lists it | proof scoped to this supplement | | |
| G-5 | `/app/cashier` (cashier) | With X-ray done + the supplement **billed-unpaid**, confirm the **base** payment last | services done, supplement billed-unpaid | `record_office_payment`/`review_payment` (`'base'`) → `complete_on_payment_confirmed` | **KTC-03 fix:** the JO does **NOT** auto-complete — it **stays `processing`** because a billed-unpaid supplement is open | no "completed with money owed" | a billed-unpaid supplement **blocks** completion even when payment confirms last (`0186`) | | |
| G-6 | `/app/cashier` (cashier) | Confirm the supplement payment | proof submitted, base confirmed | `review_supplement_payment` / `record_supplement_office_payment` | supplement `confirmed` → last gate clears → JO **auto-(re)completes** | charge clears | completion needs every **billed** supplement confirmed | | |
| G-7 | `/app/cashier` (cashier) | Bill a charge on an **already-completed** JO | a completed JO | `bill_supplement` / `add_supplement` | order **stays `completed`** (not reverted); flagged `has_open_supplement` until paid | release badge reflects the open balance, not a status flip | billing on a completed order does **not** reopen it (`0183`) | | |

#### Route closure
- [ ] **KTC-01 (FIXED 0186):** `request_supplement` succeeds (label only); ops can't price, cashier can't request
- [ ] A **requested** (un-priced) charge never blocks completion or shows a phantom balance
- [ ] **KTC-03 (FIXED 0186):** a **billed-unpaid** supplement blocks completion even when payment confirms last; billing a completed order doesn't reopen it

#### Lane closeout
- [ ] Charges request→bill loop coherent end-to-end (🧪 sandbox: KTC-01 + KTC-03 FIXED + re-verified PASS)

---

## Lane H — Walk-in + RPS at the window

### Route H — Walk-in base paid → order stays processing (RPS due) → RPS-at-window bucket → RPS paid → auto-completes

**Objective:** A walk-in JO with an RPS assessment completes in two payment legs: base is paid at the window (invoice-gated) but the order **stays `processing`** because RPS is due; it surfaces in the **Collect-RPS-at-the-window** cashier bucket; the RPS payment is collected and the order **auto-completes**.
**Start state:** a `submitted` JO; signed in as `st07ops` (accept + RPS), `st07check` (X-ray), then `st07cash`.

**🧪 Emulated sandbox result (2026-06-28): PASS.** The T1-05 **RPS-at-window** bucket surfaced the order **even after base was paid** (it didn't disappear into "paid"), and collecting the RPS leg auto-completed the order. One **open medium** surfaced (NOT fixed): **KTC-14** — `record_office_payment(p_kind='rps')` can confirm an RPS payment on an order with **no RPS assessed**, and a later real assessment inherits the stale confirm. Logged.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| H-1 | `/app/operations` (ops) | **Accept** the JO | ops session | `staff_transition_order` (→ processing) | `status='processing'` | enters processing | — | | |
| H-2 | `/app/operations` (ops) | **Assess RPS** as **needed** (per-move) | processing | `record_rps_assessment` | `rps_status='needed'`, RPS charge computed | RPS leg appears on the pay page | only `assess_rps` (ops/admin) can assess | | |
| H-3 | `/app/checker` (checker) | Confirm the X-ray van(s) | processing | `record_van_xray` | X-ray service done | per-van e-signature | — | | |
| H-4 | `/app/cashier` (cashier) | **Record invoice**, then **record office base payment** | invoice + X-ray done | `record_service_invoice` + `record_office_payment` (`'base'`) | base `payment_status='confirmed'` but order **stays `processing`** (RPS still due) | NOT yet completed | base confirm is invoice-gated (`0177`/`0178`); RPS keeps it open | | |
| H-5 | `/app/cashier` (cashier) | Open the **Collect-RPS-at-the-window** bucket | base paid, RPS due | cashier RPS bucket query | the order **appears** in the RPS-due bucket (not hidden by "base paid") | bucket lists it | a base-paid-but-RPS-due order stays surfaced (T1-05) | | |
| H-6 | `/app/cashier` (cashier) | **Record office RPS payment** | RPS assessed, base paid | `record_office_payment` (`'rps'`) | RPS confirmed → two-gate met → **AUTO-completes**; `completed_at` stamped | completed bell | RPS leg closes the last gate | | |
| H-7 | (defect watch) | Try `record_office_payment('rps')` on a JO with **no** RPS assessed | unassessed JO | `record_office_payment` | **KTC-14:** confirms a phantom RPS; a later assessment inherits the stale confirm | note it | OPEN — tracked (NOT fixed in 0186) | | |

#### Route closure
- [ ] Base paid (invoice-gated) but the order **stays `processing`** while RPS is due
- [ ] The order surfaces in the **Collect-RPS-at-the-window** bucket even after base is paid
- [ ] Collecting the RPS leg **auto-completes** the order; KTC-14 logged as **open**

#### Lane closeout
- [ ] Walk-in + RPS-at-window coherent end-to-end (🧪 sandbox PASS; 1 open medium)

---

## Lane I — Consignee request lifecycle (the 0185 visibility + resubmit path)

### Route I — Customer requests a consignee → rejected → customer sees it + resubmits → approved → files against it

**Objective:** A customer **requests** a new consignee (`request_consignee`); CSR/admin **rejects**; the customer **sees** the rejected row and **resubmits** it back to pending (`resubmit_consignee`, the `0185` fix); CSR/admin **approves**; the customer files a JO against it.
**Start state:** an approved customer; signed in as the customer, then `st07csr`/admin.

**🧪 Emulated sandbox result (2026-06-28): PASS (the 0185 visibility + resubmit path works end to end).** Three findings attach here: **KTC-04** (consignee_code_seq could lag bulk-imported codes) was a **sandbox artifact** — a read-only prod check confirmed `consignee_code_seq` is **ahead** of `max(code)`, so it **does NOT reproduce in prod** (downgraded to LOW, defensive hardening only). **KTC-10** (every `unique_violation` mapped to "name already exists", masking a code collision) and **KTC-11** (no CSR notification on a new consignee request + the badge gated on a permission CSR doesn't hold) were **FIXED in 0186**.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| I-1 | `/job-order` (customer) | **Request a new consignee** (a name not in the master list) | approved customer | `request_consignee` | a `consignees` row `status='pending'`, code assigned | **KTC-11 fix:** CSR notified (`notify_staff('review_consignee_requests',…)`); consignee badge now gated on `review_consignee_requests` | a code-vs-name collision raises a **branched** message (KTC-10 fix), not a blanket "name already exists" | | |
| I-2 | `/app/support` (csr/admin) | **Reject** the consignee request | review session | consignee review RPC | `status='rejected'` | the request leaves the pending queue | only `review_consignee_requests`/`manage_consignees` can decide | | |
| I-3 | `/job-order` (customer) | See the **rejected** row and **Resubmit** it | rejected, owned | `resubmit_consignee` | **0185 fix:** the customer **sees** the rejected consignee and `resubmit_consignee` sends it **back to pending** | the row is visible + actionable to the customer | a customer can resubmit only their **own** rejected request | | |
| I-4 | `/app/support` (csr/admin) | **Approve** the resubmitted consignee | pending again | consignee review RPC | `status='approved'` | now selectable for filing | — | | |
| I-5 | `/job-order` (customer) | **File a JO** against the newly approved consignee | approved consignee | `file_job_order` | a `submitted` JO bound to the consignee | filing succeeds | a consignee must be **approved** to file against (`0167`/`0169`) | | |
| I-6 | (defect watch) | Confirm KTC-04 is **not** a prod issue | — | `consignee_code_seq` vs `max(code)` | seq **ahead** of max code → `request_consignee` works in prod; sandbox lag was an import artifact | note as resolved | KTC-04 **DOWNGRADED → LOW** (defensive hardening only) | | |

#### Route closure
- [ ] Customer requests → CSR/admin rejects → **customer sees + resubmits** (0185) → approved → files against it
- [ ] **KTC-11 (FIXED 0186):** CSR notified + badge gated correctly; **KTC-10 (FIXED 0186):** code-vs-name collision message branched
- [ ] **KTC-04 (DOWNGRADED):** verified **not** a prod issue (seq ahead of max code)

#### Lane closeout
- [ ] Consignee request lifecycle coherent end-to-end (🧪 sandbox PASS)

---

## Lane J — Adversarial / negative (the security walls)

### Route J — Evil inputs, out-of-order, permission bypass, cross-tenant reads, cap overflow

**Objective:** Attack the system and confirm the walls hold — malformed/evil inputs to `file_job_order`, out-of-order/double-submit, permission bypass across roles, cross-tenant RLS reads, and cap overflow. Plus the explicit guardrail rows for the financial-integrity fixes shipped in `0186`.
**Start state:** an approved customer; a 2nd approved customer (cross-tenant); each staff role available for forced-RPC probes.

**🧪 Emulated sandbox result (2026-06-28): core walls HELD.** No SQL injection landed, no cross-customer / cross-privilege bypass, no partial writes, and the **10-open cap held under concurrency**. **FIXED in 0186:** **KTC-05/34** (payment + supplement-payment can no longer confirm on a cancelled/rejected order — revenue/ERP/BIR bound to a dead order), **KTC-07** (cancel blocked when a charge is paid/pending), **KTC-08/09** (container-count cap + service-catalogue whitelist added to `file_job_order`), **KTC-17** (the privilege-escalation audit log no longer aborts on a malformed array literal, so `protected_field_attempt` + owner alert fire). **Open (NOT fixed):** **KTC-31** (`payment_info` readable by pending users), **KTC-32** (anon `verify_job_order` over-discloses container numbers + payment/RPS status), **KTC-33** (`shipping_lines` + `role_permissions` world-readable to any authenticated incl. pending), **KTC-21/22** (`file_job_order` length caps + friendly errors / container-format check), and the **KTC-09 residuals** (whitelist not yet on `update_job_order`/`admin_file_job_order`; `types.ts` fallback casing). All in the Defects tracker.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| J-1 | (forced RPC, customer) | Fire evil `file_job_order` payloads — null/empty/0/negative qty, 10k-char strings, unicode, SQLi-shaped text, malformed UUID, unapproved/foreign consignee | approved customer | `file_job_order` | each is **rejected** (no row, no partial write); no SQL injection | clean error, no crash | malformed input never persists; SQLi text is treated as data | | |
| J-2 | (forced RPC, customer) | Out-of-order / double-submit (pay before file, two concurrent submits of one draft) | — | `file_job_order` / payment RPCs | duplicates/early calls **refused**; no double-write | idempotent behavior | state machine enforces order | | |
| J-3 | (forced RPC, container cap) | File **0** lines and **>100** lines | approved customer | `file_job_order` | **KTC-08 fix:** 0 and >100 both **rejected** (was unbounded — a 2000-line order was accepted pre-0186) | clean rejection | the customer path now caps containers like the admin path (`0141`/`0186`) | | |
| J-4 | (forced RPC, service text) | File a line with a **non-catalogue** `service_request` | approved customer | `file_job_order` | **KTC-09 fix:** rejected — service must exist in active `service_rates` | clean rejection | the catalogue whitelist is enforced on `file_job_order` (residuals on `update`/`admin` paths still **open**) | | |
| J-5 | (forced RPC, role bypass) | Customer → staff RPCs; cashier → checker RPCs (and vice-versa); self privilege-escalation (set `is_admin` on own row) | each wrong role | RPC `has_permission` / `guard_broker_protected_fields` | **all denied**; **KTC-17 fix:** the privilege-escalation attempt is **logged** (`protected_field_attempt` + owner alert) — the audit no longer aborts on the array-literal bug | denials surfaced; audit row written | maker-checker + role gates hold; escalation is audited (`0186`) | | |
| J-6 | (forced RPC, cross-tenant) | Customer #2 reads/writes customer #1's orders/payments | 2 customers | RLS | **denied** — only own rows visible | no cross-tenant leak | RLS isolates tenants | | |
| J-7 | (forced RPC, dead-order pay) | Confirm a **base** payment + a **supplement** payment on a **cancelled/rejected** order | dead order w/ a proof | `review_payment` / `record_office_payment` / `review_supplement_payment` / `record_supplement_office_payment` | **KTC-05/34 fix:** all **blocked** (`select status for update` → raise on cancelled/rejected) — no revenue/ERP/BIR bound to a dead order | confirm refused | payment can't confirm on a terminal order (`0186`) | | |
| J-8 | (forced RPC, cancel-with-charge) | Cancel a JO that has a **paid/pending** supplement | order w/ paid charge | `cancel_job_order` | **KTC-07 fix:** cancel **blocked** while a supplement is `submitted`/`confirmed` | cancel refused | cancel can't strand a paid charge (`0186`) | | |
| J-9 | (forced RPC, cap overflow) | Open an 11th order while 10 are open | approved customer at cap | `file_job_order` (`enforce_order_caps`) | the **11th is blocked** ("contact admin"); cap held even under concurrency | clean cap message | the 10-open cap holds (incl. under load, Lane K) | | |
| J-10 | (defect watch) | Confirm the open read-disclosure gaps | pending user / anon | RLS / `verify_job_order` | **KTC-31** `payment_info` readable by pending; **KTC-32** anon verify over-discloses; **KTC-33** `shipping_lines`/`role_permissions` world-readable | note all | OPEN — tracked (NOT fixed in 0186) | | |

#### Route closure
- [ ] Evil inputs, out-of-order, role bypass, cross-tenant reads, cap overflow — **all walls held**
- [ ] **FIXED 0186:** KTC-05/34 (dead-order pay), KTC-07 (cancel-with-charge), KTC-08/09 (cap + whitelist), KTC-17 (escalation audit)
- [ ] **OPEN:** KTC-31, KTC-32, KTC-33, KTC-21/22, KTC-09 residuals — logged in the Defects tracker

#### Lane closeout
- [ ] Adversarial / negative coherent end-to-end (🧪 sandbox: core walls HELD; financial fixes re-verified; read-disclosure mediums/lows open)

---

## Lane K — Concurrency load (50 × 10)

### Route K — 50 customers file concurrently + 10 staff accept concurrently; integrity intact

**Objective:** Under concurrency, the **DB/RPC layer stays consistent** — no duplicate `jo_number`, no duplicate active serving number per lane+week, no 10-open-cap breach, no inconsistent state — and identify the real concurrency ceiling.
**Start state:** the seeded sandbox (50 approved customers, 10 staff incl. 3 operations).

**🧪 Emulated sandbox result (2026-06-28): PASS — DB/RPC layer clean.** 50 concurrent `file_job_order` + 10 concurrent operations accepts produced **0 duplicate jo_number, 0 duplicate serving numbers per lane+week, 0 cap breaches, no inconsistent state**. The **only** ceiling was the **GoTrue login rate limit** under a naive sign-in burst (**KTC-20** — ~30/50 logins succeeded in a raw burst; token minting, not the DB, is the limit). Action: **raise prod Auth rate limits before public launch** and add client-side throttle/back-off on 429. **Re-verify on prod, not the sandbox.** (Watch-point **KTC-29:** every concurrent filing serializes on one weekly `serving:queue` advisory lock — ~1322ms at 50 concurrent, no errors; fine now, a scale watch-point.)

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| K-1 | (load harness) | 50 customers fire `file_job_order` **concurrently** | 50 approved customers | `file_job_order` (+ `ensure_jo_number`, `assign_serving_numbers`) | 50 orders written; **0 duplicate `jo_number`** (atomic `nextval` + UNIQUE backstop) | all orders land | jo_number is concurrency-safe | | |
| K-2 | (load harness) | 10 operations **concurrently** accept the inflow | 10 staff (3 ops) | `staff_transition_order` | no double-accept; each order processed once | no lost updates | accept is row-locked / idempotent | | |
| K-3 | (integrity check) | Audit the result set | post-load | DB query | **0** dup jo_number · **0** dup active serving per lane+week · **0** 10-open-cap breaches · no inconsistent state | integrity report clean | the serving-number + cap invariants hold under concurrency | | |
| K-4 | (auth harness) | Sign 50 customers in via a **naive burst** | 50 customers | GoTrue `/token` | **KTC-20:** ~30/50 succeed; the rest hit the auth **rate limit** (429) — the DB/RPC layer is fine | login failures, not data corruption | token minting is the concurrency ceiling — **raise prod Auth limits + client back-off** before launch | | |

#### Route closure
- [ ] 50×10 concurrency: **0** dup jo_number, **0** dup serving per lane+week, **0** cap breaches, no inconsistent state
- [ ] The concurrency ceiling is **GoTrue login rate-limiting** (KTC-20), not the DB/RPC layer
- [ ] KTC-20 (raise prod Auth limits + client back-off) + KTC-29 (advisory-lock watch-point) logged

#### Lane closeout
- [ ] Concurrency load coherent end-to-end (🧪 sandbox PASS; auth rate-limit is the only ceiling — re-verify on prod)

---

## Defects tracker

Pre-populated from `docs/audits/2026-06-28-breaktest-findings.md`. **All CRITICAL + HIGH were fixed in migration `0186` / v1.6.76 (+ a `useAdminCounts.ts` perm) and re-verified by a 9-agent behavioral re-test (14/14 PASS) + a Jarvis code review.** KTC-04 was **downgraded** (verified not a prod issue). MEDIUM/LOW items remain **OPEN** (a later remediation pass).

| ID | Lane / Route / Action | Severity | Issue Summary | Status | Evidence |
|---|---|---|---|---|---|
| KTC-01 | G / G-1 | Critical | `request_supplement` inserted NULL into NOT-NULL `jo_supplements.amount` — ops "Request a charge" dead on arrival | **FIXED (0186, v1.6.76) — re-verified** | `amount` made nullable; re-test PASS |
| KTC-02 | F / F-3 | Critical | Free re-X-ray child could never complete (`enforce_two_gate_complete` vs `jo_ready_to_complete` drift) | **FIXED (0186, v1.6.76) — re-verified** | backstop delegates to `jo_ready_to_complete`; child auto-completes |
| KTC-03 | G / G-5 | Critical | Billed-unpaid supplement didn't block completion when payment confirmed last → completed with money owed | **FIXED (0186, v1.6.76) — re-verified** | billed-unpaid clause added to `complete_on_payment_confirmed` |
| KTC-04 | I / I-6 | ~~Critical~~ → **Low** | `consignee_code_seq` could lag bulk-imported codes | **DOWNGRADED — not a prod issue** | prod check: seq (1659) ahead of max code (1653); hardening only |
| KTC-05 | J / J-7 | High | Payment confirmable on a cancelled/rejected order → revenue/ERP/BIR bound to a dead order | **FIXED (0186, v1.6.76) — re-verified** | `select status for update` + raise on terminal status |
| KTC-06 | B / B-4 | High | `resubmit_needs_info` container swap kept prior base payment + X-ray completion (revenue leak + customs bypass) | **FIXED (0186, v1.6.76) — re-verified** | container change resets payment/invoice + clears completions |
| KTC-07 | J / J-8 | High | `cancel_job_order` stranded a paid/pending supplement payment | **FIXED (0186, v1.6.76) — re-verified** | cancel raises on a paid/pending supplement |
| KTC-08 | J / J-3 | High | `file_job_order` had no per-order container cap (2000-line order accepted) | **FIXED (0186, v1.6.76) — re-verified** | array-length guard (reject 0 / >100) added |
| KTC-09 | J / J-4 | High | `service_request` accepted arbitrary non-catalogue text | **FIXED on `file_job_order` (0186) — residuals OPEN** | whitelist on `file_job_order`; not yet on `update_job_order`/`admin_file_job_order`; `types.ts` fallback casing |
| KTC-10 | I / I-1 | High | `request_consignee`/`resubmit_consignee` mapped every unique_violation to "name already exists" | **FIXED (0186, v1.6.76) — re-verified** | unique_violation handler branched on constraint name |
| KTC-11 | I / I-1 | High | CSR consignee handoff invisible — no notification + badge gated on a perm CSR lacks | **FIXED (0186, v1.6.76) — re-verified** | `notify_staff` added; `useAdminCounts.ts` perm → `review_consignee_requests` |
| KTC-17 | J / J-5 | High | Privilege-escalation guard errored (malformed array literal) before logging → audit + owner alert never fired | **FIXED (0186, v1.6.76) — re-verified** | array append cast; `protected_field_attempt` now logs |
| KTC-34 | J / J-7 | High | Supplement-payment RPCs lacked the KTC-05 order-status guard | **FIXED (0186, v1.6.76) — re-verified** | terminal-status guard added to both supplement-payment RPCs |
| KTC-12 | (cashier) | Medium | Cashier can't record the ERP invoice on a walk-in unpaid order (invoice-then-pay dead-ends in-station) | OPEN | `record_office_payment` gate vs `CashierStation.tsx` |
| KTC-13 | C / C-4 | Medium | Legacy `resubmit_rejected` still granted + pre-0154 rejected rows un-backfilled → terminal-reject bypassable | OPEN | backfill + revoke pending |
| KTC-14 | H / H-7 | Medium | `record_office_payment('rps')` confirms RPS on an unassessed order; later assessment inherits the stale confirm | OPEN | require `rps_status='needed'`; reset on (re)assess |
| KTC-15 | (RPS) | Medium | `record_rps_assessment` can set the RPS charge on a cancelled/rejected/completed order | OPEN | needs `select status for update` + raise |
| KTC-16 | (checker) | Medium | No "order accepted" handoff; `record_van_xray` advances a never-accepted (submitted) order | OPEN | scope checker queue to processing; require accepted |
| KTC-18 | E / E-7 | Medium | Desktop Checker re-orders a priority order with no visual cue (no lane chip) | OPEN | mirror AppChecker chip + add `priority_status` to SELECT |
| KTC-19 | (queue) | Medium | `now_serving()` board RPC dead (zero callers); two parallel queue models | OPEN | pick one source of truth |
| KTC-20 | K / K-4 | Medium | Burst sign-in hits the GoTrue auth rate limit (~30/50) — token minting is the concurrency ceiling | OPEN | raise prod Auth limits + client back-off; re-verify on prod |
| KTC-21 | J / J-10 | Medium | `file_job_order` accepts unbounded entry/vessel/voyage/visit (10k-char stored) | OPEN | length caps + CHECK constraints |
| KTC-22 | J / J-10 | Medium | `file_job_order` leaks raw Postgres errors + no container-number format check | OPEN | pre-validate mirroring `admin_file_job_order` |
| KTC-23 | B (vessel) | Low | Vessel-flagged on-hold lacks an in-app free-text resubmit fallback when the schedule has no match | OPEN | reveal free-text vessel/voyage inputs |
| KTC-24 | B | Low | `hold_job_order`/`resubmit_needs_info` retain default anon EXECUTE | OPEN | revoke from public/anon; grant to authenticated |
| KTC-25 | C / C-4 | Low | Stale "needs action" count includes recoverable-rejected orders the list can't show | OPEN | drop the rejected clause from both `.or()` filters |
| KTC-26 | F | Low | Unapproved re-X-ray child shows in the checker queue but can't be acted on | OPEN | exclude `is_rexray && rexray_status!=='approved'` |
| KTC-27 | F | Low | `request_rexray` copies ALL parent service lines (DEA/OOG), not just X-ray | OPEN | restrict copied lines to `service_line_of='xray'` |
| KTC-28 | A / H | Low | Operations gets no notification on a new order (only a polled, lumped badge) | OPEN | `notify_staff('accept_orders',…)` on submitted |
| KTC-29 | K | Low | Every concurrent filing serializes on one weekly `serving:queue` advisory lock (~1322ms @ 50) | OPEN (watch-point) | per-lane sequence or scope the lock |
| KTC-30 | E / E-7 | Low | Main admin/ops queue shows a Priority chip but doesn't move the order ahead | OPEN | sort granted-priority first; align with Checker |
| KTC-31 | J / J-10 | Low | `payment_info` (KTC payee bank/GCash) readable by any authenticated incl. pending | OPEN | gate to `broker_is_approved() or current_is_staff()` |
| KTC-32 | J / J-10 | Low | Anon `verify_job_order` over-discloses container numbers + payment/RPS status | OPEN | drop payment/rps fields, return container count |
| KTC-33 | J / J-10 | Low | `shipping_lines` + `role_permissions` world-readable to any authenticated incl. pending | OPEN | gate shipping_lines to approved/staff; role_permissions to staff |

**Tally:** Critical 3 FIXED + 1 downgraded · High 8 FIXED (KTC-09 has open residuals) · **14/14 critical+high repros re-verified PASS** · Medium/Low **OPEN** for a later remediation pass.

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| A — Happy path to release (full spine) | | 🧪 PASS — JO auto-completed on base pay; release reached `released` | |
| B — On-hold resolution | | 🧪 PASS — in-app path clean; KTC-06 (container-swap invalidation) FIXED 0186 | |
| C — Reject is terminal | | 🧪 PASS by design; KTC-13 + KTC-25 OPEN | |
| D — Cancel | | 🧪 PASS — serving burned; idempotent + foreign-cancel refused | |
| E — Priority lane | | 🧪 PASS mechanics; KTC-18 + KTC-30 (lane display/sort) OPEN | |
| F — Re-X-ray lane | | 🧪 was DEAD-END (KTC-02) → FIXED 0186 + re-verified PASS | |
| G — Additional charges | | 🧪 KTC-01 (crash) + KTC-03 (auto-complete owing money) FIXED 0186 + re-verified | |
| H — Walk-in + RPS at the window | | 🧪 PASS — RPS-at-window bucket works after base pay; KTC-14 OPEN | |
| I — Consignee request lifecycle | | 🧪 PASS (0185 path); KTC-04 NOT a prod issue; KTC-10 + KTC-11 FIXED 0186 | |
| J — Adversarial / negative | | 🧪 core walls HELD; KTC-05/34/07/08/09/17 FIXED 0186; KTC-31/32/33/21/22 OPEN | |
| K — Concurrency load (50×10) | | 🧪 PASS — DB/RPC clean; KTC-20 (GoTrue rate-limit) the only ceiling | |

## Reuse rule

Keep the canonical Route/Click/Backend-Contract structure (`docs/smoke-test-template-canonical.md`). ST07 is the **break-test-derived full-lifecycle + adversarial + load** pass (the `break-testing` skill made repeatable); for the broad onboarding / X-ray / payments / release walkthrough see **ST05**, for the **ADR-0035 ops-overhaul deltas** see **ST06**, and for the release/pull-out deep dive **ST04**. The source backlog is `docs/audits/2026-06-28-breaktest-findings.md`. See `docs/agent/testing-and-release.md`.
