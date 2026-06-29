# Smoke Test ST06 — X-ray Billing Cutover (ADR-0037 Phase A): uniform charges · per-charge pay · final-invoice confirm gate · payment orders · one-rule completion · monthly serving

**Smoke Test ID:** ST06
**Date:** 2026-06-27 · **Rewritten 2026-06-29 for the v2.0.0 cutover**
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — **v2.0.0 / DB migrations through `0222`**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Supersedes:** its own ADR-0035 **request→bill supplement** / **invoice-gated base payment** lanes, and the billing/cashier/serving content of **ST05** + **ST07**. ADR-0037 (`0203`–`0222`) replaced the old base/RPS/supplement/service-invoice billing with **one uniform `charges` table** — the ONLY X-ray billing path. **Where this doc and ST04/ST05/ST07 disagree on billing/cashier/serving, ST06 + runtime win.**

## What changed in the cutover (the new parameters this doc proves)

- **Billing is one uniform `charges` table** (migration `0203`). Each billable — base X-ray (`service`), an RPS move (`rps`), an add-on (`addon`) — is its own `charges` row hanging off the Job Order, carrying its **own** ERP+BIR invoice (draft→final), payment state, maker-checker approval (add-ons), attribution, and `payment_order_id`. The old `base/RPS/supplement/service-invoice` billing was **dropped** (`0220`).
- **Deleted screens/routes:** the customer **Payment page** (`/job-order/:id/pay`) and the admin **CashierStation** (`/admin/cashier`, `/app/cashier`) — gone, along with `src/lib/joPayment.ts`. The cashier now works the **Payment Order desk** (`/admin/payment-orders`, PWA `/app/payment-orders`).
- **Payment is PER-CHARGE, inline.** The customer sees **`JobOrderCharges`** inside the My Job Orders detail — each charge with its own invoice + **Pay this charge** action. The cashier collects via **`PaymentOrderDesk`** and adds/approves charges via **`ChargeApproval`** (`/admin/charges`).
- **Filing auto-creates the base `service` charge + links containers** (`0212`). RPS assessment seeds `rps` charges (`0213`); staff "add charge" creates `service`/`rps`/`addon` charges (`0206`).
- **Completion = one rule** (`0216`): **all services done AND every billed charge confirmed** (paid, or reversed). No charge confirms without `invoice_state='final'` + `erp_invoice_no` + `bir_invoice_no`.
- **Serving number resets MONTHLY** and displays **`YYMM-XXXX`** (e.g. `2606-0001`; priority `P-…`, re-X-ray `R-…`) — `0217`. Was weekly `#N`.
- **Consignee picker uses the `search_consignees` RPC** (id/code/name only) — a broker can no longer SELECT the full consignee master list (`0218`).
- **Cancel:** customer self-cancel is **blocked** once a charge is past *pristine* (payment/invoice/bundled); a new **admin-only** `admin_cancel_job_order(p_id, p_reason)` exists (`0219`).
- **Kept/unchanged:** the **release desk** (its own screens; release billing is charge-shadowed via `0214`/`0215`), the rate **Calculator** (`terminal_rates`), per-van **X-ray confirmation** (`record_van_xray`), the **priority** + **re-X-ray** lanes, RPS **assessment**, and the auth/registration flow.

## Purpose

A focused **blind walkthrough of the ADR-0037 billing cutover** on the current build, proving each new gate works front-to-back **and** is backend-enforced (the SECURITY DEFINER RPC + its gate). Verify frontend **and** backend **and** side effects at each click.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Roles → who touches billing (ground truth — the charge RPCs, `0206`/`0209`/`0210`, live `role_permissions`)

The supplement gates (`request_supplement`/`bill_supplement`) are **retired** with the supplements table. Charges reuse the existing permission gates:

| Charge action | RPC | Permission gate |
|---|---|---|
| Add a charge (service/rps bill now; addon is *proposed*) | `add_charge` | admin **or** `accept_orders` **or** `complete_orders` |
| Approve a proposed add-on (maker-checker — approver ≠ creator) | `approve_charge` | admin **or** `complete_orders` **or** `hold_reject_orders` |
| Record the FINAL ERP + BIR invoice on a charge | `record_charge_invoice` | `record_invoice` |
| Confirm / reject a charge's payment | `confirm_charge_payment` | `review_payments` |
| Bundle charges → a payment order | `create_payment_order` | `review_payments` |
| Collect a payment order (records ONE OR) | `confirm_payment_order` | `review_payments` |
| Reverse a confirmed charge (credit note) | `reverse_charge` | owner / admin only |
| Customer submits a per-charge proof | `submit_charge_payment` | the charge's own customer |
| Admin-cancel a JO (with reason) | `admin_cancel_job_order` | owner / admin only |

**Landings (current):** owner/admin → `/admin` · operations → `/app/operations` · **cashier → `/app/payment-orders`** · checker → `/app/checker` · csr → `/app/support` · customer → `/`. **Owner bypasses every gate** (failsafe). The server enforces the **live** matrix.

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; failsafe; bypasses every gate; only role that can `reverse_charge` besides admin |
| Admin (secondary) | _create via Settings → Staff_ | full back office; approves add-ons; can `admin_cancel_job_order` |
| Operations | `st06ops` | `accept_orders` + `complete_orders` + `assess_rps` → can **add charges** (and approve, via complete) but **no money** |
| Cashier | `st06cash` | `review_payments` + `record_invoice` → records invoices, confirms charge payments, bundles/collects payment orders; **no** order-status power |
| Checker | `st06check` | `confirm_xray` (per-van X-ray) only |
| CSR | `st06csr` | support + file-on-behalf + release-doc verify; **never** changes order status or money |
| Test customer | a throwaway email you control, **`approved`** | needs ≥1 `processing` JO with X-ray container lines, and a rate set so a charge amount computes |

> **Preconditions before the lanes:**
> - Settings → **Service rates & fees** non-zero (so a base charge `amount` computes; an unset rate renders **"—"**, never ₱0).
> - Settings → **Payment details** (bank / GCash / QR) filled.
> - ≥1 **current vessel** + ≥1 **approved consignee** (a consignee must be approved before it can be filed against).
> - The test customer is **`approved`** and owns a **`processing`** JO with multiple X-ray container lines.
> - Emails/bells: per [[emails-suspended-by-default]] customer emails may be **off**; when off, confirm the **in-app bell** is the side effect.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npm run lint` (`tsc --noEmit`) | 0 errors | |
| P2 Build | `npm run build` | PASS | |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | |
| P5 New billing routes resolve | `curl … /admin/payment-orders` · `… /admin/charges` · `… /app/payment-orders` | `200` (SPA rewrite, not 404) | |
| P5b Deleted billing routes gone | `curl … /admin/cashier` · `… /app/cashier` · `… /job-order/00000000/pay` | `200` from the rewrite, but the app **catch-all → `/`** (no Pay/Cashier screen) | |
| P6 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | |
| P7 Charge RPCs resolve (latest defs) | over the Management API, confirm: `add_charge` / `approve_charge` / `record_charge_invoice` / `submit_charge_payment` / `confirm_charge_payment` / `reverse_charge` / `create_payment_order` / `confirm_payment_order` / `admin_cancel_job_order` exist; the **dropped** RPCs (`review_payment`, `record_service_invoice`, `bill_supplement`, `request_supplement`, `add_supplement`) are **absent**; `jo_supplements` table **gone** (`0220`) | |
| P8 Smoke (unauth) | `BASE_URL=https://portal.ktcterminal.com npm run test:e2e -- e2e/smoke.spec.ts` | all pass (incl. the new billing-route + deleted-route checks) | |

If any preflight check fails, pause and fix first.

---

## Lane A — Roles land right; the cashier works Payment Orders (not the deleted station)

### Route A — `/app/*` landings + the deleted billing screens are truly gone

**Objective:** Each staff role lands on its focused `/app/*` screen; the **cashier lands on `/app/payment-orders`** (the old `/app/cashier` is gone); the customer `/job-order/:id/pay` page and `/admin/cashier` no longer exist; the charge gates are server-enforced.
**Start state:** Owner on `/admin/settings`; the st06* staff created (or create them here).

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| A-1 | `/admin/settings` | Create `st06ops` / `st06cash` / `st06check` / `st06csr` | `create_staff` | each appears with a role badge | staff creation is owner-only | |
| A-2 | `/login` → `/` | Sign in as each role; observe the landing | `RoleLanding` | ops → `/app/operations` · **cashier → `/app/payment-orders`** · checker → `/app/checker` · csr → `/app/support` · admin/owner → `/admin` | a role can't deep-link a tab it lacks (URL bounce, no data flash) | |
| A-3 | `/job-order/<any-id>/pay` (customer) | Navigate directly | — (no route) | the catch-all redirects to `/`; **no Pay page** — billing is per-charge in My Job Orders | the old `/pay` page is deleted (`joPayment.ts` gone) | |
| A-4 | `/admin/cashier` + `/app/cashier` (cashier) | Navigate directly | — (no route) | redirect to `/`; the cashier works **`/app/payment-orders`** instead | the CashierStation is deleted | |
| A-5 | `/app/payment-orders` (cashier login) | As `st06cash`, try to **accept / hold / complete** an order | `staff_transition_order` | **no** order-status controls; a forced RPC **denies** | cashier is money-only (review_payments + record_invoice) | |

#### Route closure
- [ ] Every role lands on its `/app/*` screen; **cashier → `/app/payment-orders`**
- [ ] The deleted billing routes (`/job-order/:id/pay`, `/admin/cashier`, `/app/cashier`) no longer render — catch-all → `/`
- [ ] Cashier money-only is server-enforced

---

## Lane B — Serving number: monthly reset, displayed `YYMM-XXXX`

### Route B — Numbers assign on `submitted`, reset MONTHLY, render `YYMM-XXXX`; charge-only work skips the queue

**Objective:** A serving number is assigned automatically when a JO hits `submitted`/`processing`, is vacated when it leaves, and is **displayed as `YYMM-XXXX`** (was weekly `#N`). The counter **resets on the first of each month** (PH time). Priority and re-X-ray lanes prefix `P-`/`R-`. The customer never sees a serving number.
**Start state:** Signed in as `st06ops` (and `st06check` for the queue); a `submitted` JO.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| B-1 | `/app/checker` (checker) | Open the X-ray Queue; read the serving tag on the active van | `assign_serving_numbers` + `servingTag()` (`src/lib/serving.ts`) | the tag renders as **`YYMM-XXXX`** — e.g. `2606-0001` for June 2026 (priority `P-2606-0001`, re-X-ray `R-2606-0001`) | the format is `YYMM-XXXX`, NOT `#1` / a weekly batch | |
| B-2 | (DB) | Confirm the reset boundary | `serving_week()` → first of month (PH) | the `week_start` column holds the **month-start** date; `max(serving_no)+1` is scoped to it, so numbering restarts each month | crossing into a new month restarts at `…-0001` | |
| B-3 | `/app/operations` | **Hold** the JO (→ `on_hold`), then re-submit (customer responds) | `staff_transition_order` + serving trigger | the active number is **vacated**; re-entry gets a **new tail** number (the old one stays burned) | a vacated number is never reused | |
| B-4 | `/job-orders` (customer) | Open My Job Orders | select own (RLS) | **no** serving/priority number shown to the customer | the lane bookkeeping is staff-only | |

#### Route closure
- [ ] Serving numbers render **`YYMM-XXXX`** and reset **monthly**
- [ ] Vacate-on-exit + new-tail-on-re-entry still hold; the customer sees no serving number

---

## Lane C — Priority lane: request → admin approve → served ahead (unchanged by the cutover)

### Route C — Ops/CSR request priority; an admin approves; granted orders sort first

**Objective:** Operations or CSR **requests** priority (`request_priority`); an **admin approves** (`review_priority`) moving it to the priority lane — or denies. The requester can't self-approve.
**Start state:** `st06ops` (or `st06csr`), an open JO; then the admin.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| C-1 | `/app/operations` (ops) | **Request priority** on an open JO | `request_priority(p_id)` | `priority_status='requested'`; a "Priority requested" chip | only `request_priority` roles see it | |
| C-2 | `/app/operations` | Look for an **Approve priority** control | — | **no** approve control for ops | `review_priority` denies ops (forced call) | |
| C-3 | `/admin/job-orders` (admin) | **Approve priority** | `review_priority(p_id,true)` | `priority_status='granted'`; a `P-YYMM-XXXX` priority-lane number; sorts ahead | approving a non-requested order raises (state guard) | |
| C-4 | `/app/checker` (checker) | Confirm the granted JO sorts ahead | queue sort | the priority order tops the lane sort | a regular order never sorts above a granted-priority one | |

#### Route closure
- [ ] Ops/CSR request; only admin approves/denies; granted → priority lane (`P-…`), served ahead

---

## Lane D — Re-X-ray lane: request on a completed JO → internal child → admin approve (unchanged)

### Route D — Checker/ops request a re-X-ray; a suffixed internal child runs its own lifecycle

**Objective:** On a **completed** JO, a checker/ops **requests a re-X-ray** (`request_rexray`) → a **child** order (`JO-000001A`, containers copied) an **admin approves** (`review_rexray`). The child is **internal** (no customer notifications, customer can't see/cancel/edit it, can't be X-rayed before approval). Free by default → no charges → completes on services-done alone.
**Start state:** A **completed** JO; `st06check` (or ops), then admin, then the customer.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| D-1 | `/app/checker` (checker) | **Request re-X-ray** on the completed JO → confirm | `request_rexray(p_parent)` | a child `job_orders` row: `is_rexray=true`, `parent_job_order_id` set, `rexray_status='requested'`, `jo_number='…A'`, containers copied, `status='submitted'`; staff pinged | request only on a **completed** non-re-X-ray order | |
| D-2 | `/job-orders` (customer) | Open My Job Orders | select own (RLS) | the child is **NOT** visible; no notification | the re-X-ray child emits no customer notifications | |
| D-3 | `/admin/job-orders` (admin) | **Approve re-X-ray** (free) | `review_rexray(p_id,true,false)` | child `rexray_status='approved'`, `status='processing'`, no charges; enters the re-X-ray lane (`R-…`) | can't X-ray before approval; can't be accepted via the generic path | |
| D-4 | `/app/checker` (checker) | Confirm the child's X-ray vans | `record_van_xray` | last van → services done → **free re-X-ray auto-completes** (no charges to pay) | a **billable** re-X-ray (a charge added) would need that charge confirmed before completing | |

#### Route closure
- [ ] Re-X-ray only on a completed order; child is internal; free child auto-completes on services-done (no charge gate)

---

## Lane E — Charges = add → (approve add-ons) → per-charge pay → confirm

### Route E — Staff add a charge; add-ons are maker-checker; the customer pays each charge inline; the cashier confirms

**Objective:** Staff **add a charge** (`add_charge`): a `service`/`rps` charge bills immediately (priced off the rate spine); an **`addon` is PROPOSED** and needs **approval by a different staffer** (`approve_charge`) before it bills. The customer sees every charge itemized in **`JobOrderCharges`** and **pays each one inline** (`submit_charge_payment`); the cashier **confirms** (`confirm_charge_payment`) — gated on the FINAL invoice (Lane F).
**Start state:** A `processing` JO; signed in as `st06ops`, a 2nd staffer (admin) for the approval, then the test customer, then `st06cash`.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| E-0 | `/job-orders` (customer) | Open the order filed earlier; confirm the **base X-ray charge** is already there | filing seed (`0212`) | the **Charges** panel ("Every charge on this order — itemized and verifiable. No hidden fees.") lists the base `service` charge with a **Draft invoice** + **Unpaid** chip | filing auto-seeds the base charge — nothing is hidden | |
| E-1 | `/admin/charges` (ops/admin) | **Add charge** → type **Add-on**, label + qty (e.g. "Reefer monitoring" / 1) | `add_charge(p_jo,'addon',…)` | a `charges` row `bill_status='proposed'`, `created_by` = ops; shows **"Awaiting approval"** to the customer, **not yet billable** | only add-charge roles; a zero/negative qty is rejected | |
| E-2 | `/admin/charges` (same ops user) | Try to **Approve charge** on your own proposed add-on | `approve_charge` | **blocked** — "A charge must be approved by someone other than who created it." | maker-checker: approver ≠ creator (`0206`) | |
| E-3 | `/admin/charges` (admin) | **Approve charge** (a different staffer) | `approve_charge` | `bill_status='billed'`, `approved_by` recorded; now billable + customer-payable | "Created by" / "Approved by" both attributed (accountability) | |
| E-4 | `/job-orders` (customer) | On the billed charge, **Pay this charge** → upload a slip → **Submit to KTC** | `submit_charge_payment(p_charge,p_proof)` | charge `payment_status='submitted'`; "Your proof is with KTC for review" | proof scoped to this charge only (its own folder) | |
| E-5 | `/app/payment-orders` (cashier) | Find the submitted proof; try **Confirm payment** **before** recording the invoice | `confirm_charge_payment(p_charge,true)` | **blocked** — "Record the FINAL ERP + BIR invoice before confirming this charge." (→ Lane F) | no charge confirms without a final invoice (every type) | |

#### Route closure
- [ ] `service`/`rps` charges bill immediately; an `addon` is **proposed** and needs a **different** staffer to approve
- [ ] The customer pays **per charge** inline (`Pay this charge` → `Submit to KTC`); no `/pay` page
- [ ] A charge confirm is blocked until its FINAL invoice is on file

---

## Lane F — The invoice gate + Payment Orders (collection)

### Route F — Record the FINAL ERP+BIR invoice per charge; bundle into a Payment Order; collect with ONE OR

**Objective:** A charge confirms **only** against a FINAL ERP + BIR invoice (`record_charge_invoice`). The cashier can confirm a single charge, **or** bundle several whole charges of **one customer** into a **Payment Order** (`create_payment_order`) and collect them with **one OR** (`confirm_payment_order`) — each still gated on its own final invoice.
**Start state:** Lane E's submitted charge proof(s); signed in as `st06cash`.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| F-1 | `/app/payment-orders` (cashier) | **Record invoice** on the charge — ERP control no. (`OR-INV-…` cash / `BI-INV-…` credit) + BIR pad serial → Save | `record_charge_invoice(p_charge,erp,bir)` | `invoice_state='final'`, `erp_invoice_no` normalized (e.g. `OR-INV-00135921`), `bir_invoice_no` set (digits, 4–8, non-zero); customer's charge shows **"Final invoice"** + "Invoice on file: …" | all-zeros ERP rejected; bad pad serial rejected; `record_invoice`-gated | |
| F-2 | `/app/payment-orders` (cashier) | Now **Confirm payment** on that charge | `confirm_charge_payment(p_charge,true)` | charge `payment_status='confirmed'`; if it was the last billed-unpaid charge and services are done, the JO **auto-completes** (Lane G) | confirm acts only on a `submitted` proof (idempotent) | |
| F-3 | `/app/payment-orders` (cashier) | **Reject** a different charge's proof with a note | `confirm_charge_payment(p_charge,false,note)` | charge `payment_status='rejected'`; the customer can re-upload | reject requires a non-empty note | |
| F-4 | `/admin/payment-orders` (cashier) | Bundle ≥2 billed charges of **one customer** into a **Payment Order**, then **Collect** with one OR | `create_payment_order` + `confirm_payment_order(p_po,or_no)` | a `PO-######`; **all** bundled charges confirmed; ONE `collection_or_no` recorded | bundling charges of two customers is rejected; collection is blocked unless **every** bundled charge has its FINAL invoice | |
| F-5 | `/admin/charges` (admin/owner) | **Reverse (credit note)** a confirmed charge with a reason | `reverse_charge(p_charge,reason)` | `payment_status='reversed'` (credit note + audit), never a silent delete; reason required | only owner/admin can reverse; reverses only a `confirmed` charge | |

#### Route closure
- [ ] A charge confirms **only** against a FINAL ERP+BIR invoice — every type (`service`/`rps`/`addon`)
- [ ] Payment Orders bundle whole charges of one customer, collect with **one OR**, each still invoice-gated
- [ ] Reversal is explicit (credit note + audit), owner/admin only

---

## Lane G — One-rule completion (no manual button)

### Route G — A JO auto-completes the instant the rule is met: all services done AND every billed charge confirmed

**Objective:** A JO reaches `completed` from **exactly one rule** (`jo_ready_to_complete`, `0216`): **all services done AND no billed charge is unconfirmed/unreversed**. There is **no "Mark completed" button**. Verified from both directions.
**Start state:** A `processing` JO with X-ray vans confirmable + a billed charge to confirm (its invoice recorded, Lane F).

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| G-1 | `/app/operations` / `/app/payment-orders` | Look for a **Mark completed** button | — | **no** manual complete button anywhere | completion is implicit (ADR-0035 + `0216`) | |
| G-2 | `/app/payment-orders` (charge-last) | With all services done, **confirm the last billed charge** (after recording its invoice) | `complete_jo_on_charge_confirmed` (trigger `charges_autocomplete`) | the JO **auto-completes** the instant the last charge confirms; `completed_at` stamped | completion fires on the last gate — no click; the `enforce_two_gate_complete` backstop agrees | |
| G-3 | `/app/checker` (services-last) | On a 2nd JO already fully paid, confirm the **final X-ray van** | `record_van_xray` → service-completion → `jo_ready_to_complete` | the JO **auto-completes** when the last service lands | services-last completes too (same single rule) | |
| G-4 | `/verify/:id` | Open the public verify page on the completed JO | anon `verify_job_order` + `VerifyCharges` | shows **✓ PAID** + **Completed**, and the **authentic charge list** (QR charge-authenticity, `0211`) | a JO with a billed-unpaid charge shows **NOT fully paid**; the QR reveals the true charges/amounts | |

#### Route closure
- [ ] No manual complete button — completion is automatic from the single rule
- [ ] Auto-completes from both charge-last and services-last; verify page reflects PAID + Completed only when the rule is met

---

## Lane H — Cancel: customer self-cancel blocks once billing starts; admin-cancel with a reason

### Route H — The pristine-charge guard + the new admin-only cancel

**Objective:** A customer can self-cancel a `submitted`/`on_hold` order **only while every charge is pristine**; once any charge has a payment in flight, a recorded invoice, or is bundled, self-cancel is **blocked** with a clear message. A new **admin-only** `admin_cancel_job_order(p_id, p_reason)` can always cancel an open order with a recorded reason.
**Start state:** Two `submitted` JOs for the test customer — one pristine, one with a charge moved past pristine; then the admin.

| Action ID | Screen / Route | UI Action | Backend Owner | Expected State / Data | Guardrail Test | Result |
|---|---|---|---|---|---|---|
| H-1 | `/job-orders` (customer) | On the **pristine** order, **Cancel this order** → "Yes, cancel it" | `cancel_job_order(p_id)` | `status='cancelled'`; serving number vacated | cancel allowed while pristine (`submitted`/`on_hold`) | |
| H-2 | `/job-orders` (customer) | On the order whose charge left pristine (proof submitted / invoice recorded / bundled), try **Cancel this order** | `cancel_job_order` | **blocked** — "This order already has billing in progress — please contact KTC admin to cancel." | a charge past pristine blocks customer self-cancel (`0219`) | |
| H-3 | `/admin/job-orders` (admin) | Use the order **Cancel** action → enter a reason | `admin_cancel_job_order(p_id,p_reason)` | `status='cancelled'`; the reason is logged to the timeline (customer-visible) | admin-only; an empty reason is refused; can't cancel a `completed`/`cancelled`/`rejected` order | |

#### Route closure
- [ ] Customer self-cancel works while pristine, **blocks** once a charge is past pristine
- [ ] `admin_cancel_job_order` cancels an open order with a required reason (admin/owner only)

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| A — Landings + deleted billing screens gone | | | |
| B — Monthly serving `YYMM-XXXX` | | | |
| C — Priority lane | | | |
| D — Re-X-ray lane | | | |
| E — Charges add → approve → per-charge pay | | | |
| F — Invoice gate + Payment Orders | | | |
| G — One-rule completion | | | |
| H — Cancel guard + admin-cancel | | | |

## Reuse rule

Keep the canonical Route/Click/Backend-Contract structure (`docs/smoke-test-template-canonical.md`). ST06 is now the **billing-cutover owner** (ADR-0037). For onboarding / X-ray confirmation / release walk see **ST05**, for the full-lifecycle + adversarial + load pass see **ST07** — both defer their **billing/cashier/serving** content to this doc. The automated counterpart is `e2e/customer-lifecycle.spec.ts` (per-charge billing wire) + the `test.fixme` charge lanes in `e2e/authenticated.spec.ts`.
