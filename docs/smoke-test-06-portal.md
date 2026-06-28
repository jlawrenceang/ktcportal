# Smoke Test ST06 — Job-Order Ops Overhaul (ADR-0035): auto-complete · serving lanes · priority · re-X-ray · request→bill charges · invoice-gated payment · role re-split

**Smoke Test ID:** ST06
**Date:** 2026-06-27
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — **v1.6.73 / commit `b730eb3` / DB migrations through `0183`**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Supersedes (in part):** the **retired-serving-number** content of **ST05/ST03**. ST05 (drafted at `0131`) recorded the serving number as *retired* (daily Batch + working-hours aging chip). **ADR-0035 (`0170`–`0177`) reintroduced an automatic serving-number queue** with **priority** + **re-X-ray** lanes, made completion **automatic**, split **charges** into request→bill, gated **payment** on the ERP invoice, and **re-split the roles** (`0171`). ST06 is the focused pass on those new surfaces. ST05 still owns the broad onboarding / X-ray / payments / release walkthrough; ST06 layers the ADR-0035 deltas on top.

## Purpose

A focused **blind walkthrough of the ADR-0035 ops overhaul** on the current build, proving each new gate works front-to-back **and** is backend-enforced:

- **Roles (separation of duties, `0171`):** every staff role lands on its **focused staff-PWA screen** (`/app/*`, full portal one tap away); the verified matrix gained six request/approve gates; CSR can't approve orders and the cashier is money-only.
- **Automatic completion (`0172`/`0179`):** no role clicks "complete" — the order self-completes the moment the last gate (services *or* payment) lands.
- **Automatic serving-number lifecycle + lanes (`0173`/`0174`/`0175`):** numbers assign on `submitted`/`processing`, vacate on `on_hold`/`rejected`/`cancelled`/`completed`; re-entry gets a **new tail number**; three lanes (regular · priority · re-X-ray) sort **priority → regular → re-X-ray**; the manual `restore_serving_number` queue-jump is gone (`0182`).
- **Priority lane (`0174`):** CS/ops **request** → admin **approve**; granted orders sort ahead.
- **Re-X-ray lane (`0175`):** checker/ops **request** on a completed JO → a suffixed **child** (`JO-000001A`) → admin **approve**; the child is internal (no customer notifications, customer can't cancel/edit it, can't be X-rayed before approval).
- **Charges = request→bill (`0176`):** ops **requests** a charge (label only) → cashier **bills** it (sets the amount) → customer pays → confirm; an un-priced request never blocks completion; billing on a completed order doesn't reopen it.
- **Payment requires invoice (`0177`/`0178`):** confirming the **base** payment (online **and** walk-in) requires the **ERP service invoice + BIR pad serial** on file — recording them *is* the confirm.

Verify frontend **and** backend (the SECURITY DEFINER RPC + its gate) **and** side effects at each click.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Verified role → permission matrix (ground truth — `docs/diagrams/role-and-operation-flows.md`, live `role_permissions`, migrations through `0183`)

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
| **request_priority** (`0174`) | ✓ | ✓ |  |  | ✓ |
| **approve_priority** (`0174`) | ✓ |  |  |  |  |
| **request_rexray** (`0175`) | ✓ | ✓ |  | ✓ |  |
| **approve_rexray** (`0175`) | ✓ |  |  |  |  |
| **request_supplement** (`0176`) | ✓ | ✓ |  |  |  |
| **bill_supplement** (`0176`) | ✓ |  | ✓ |  |  |
| assess_rps | ✓ | ✓ |  |  |  |
| review_payments | ✓ |  | ✓ |  |  |
| record_invoice | ✓ |  | ✓ |  |  |
| verify_release_docs | ✓ |  |  |  | ✓ |
| review_consignee_requests | ✓ |  |  |  | ✓ |
| manage_vessel_schedule | ✓ | ✓ |  |  |  |
| manage_support | ✓ |  |  |  | ✓ |
| manage_approvals / manage_customers / manage_consignees / manage_pricing | ✓ |  |  |  |  |

**Deltas vs ST05's matrix (`0171`):** cashier **lost** `hold_reject_orders` + `complete_orders` (money lane only); the six **request/approve** gates are new. `confirm_xray` stays **checker-only** (admin/ops can view, not confirm).

**Landings (current):** owner/admin → `/admin` · **operations → `/app/operations`** · **cashier → `/app/cashier`** · **checker → `/app/checker`** · **csr → `/app/support`** · customer → `/`. Operational roles land on the **staff PWA**, full back office one tap away (`RoleLanding`, `src/App.tsx`). **Owner bypasses every gate** (failsafe). The server enforces the **live** matrix.

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; failsafe; bypasses every gate |
| Admin (secondary) | _create via Settings → Staff_ | `jla.ktcport@gmail.com` is **no longer admin** (now a rejected customer) — create a fresh staff admin (everything **except `confirm_xray`**; approves priority + re-X-ray; bills charges) |
| Operations | `st06ops` (create in Settings) | accept/process/RPS/vessels + **request** priority/re-X-ray/charge; **no money**; **monitors** X-ray |
| Cashier | `st06cash` | `review_payments` + `record_invoice` + **`bill_supplement`**; **no** accept/hold-reject/complete; **no** X-ray queue |
| Checker | `st06check` | `confirm_xray` + **`request_rexray`** only |
| CSR | `st06csr` | support + file-on-behalf + release-doc verify + consignee-request review + **`request_priority`**; **never** changes order status |
| Test customer | a throwaway email you control, **`approved`** | needs ≥1 `processing` JO (priority/charges) and ≥1 `completed` JO (re-X-ray) |

> **Preconditions before the lanes:**
> - Settings → **Service rates & fees** non-zero (X-ray rate + admin/print fees) + **RPS per-move rates** set, so the pay-page total computes.
> - Settings → **Payment details** (bank / GCash / QR) filled.
> - At least one **current vessel** on the schedule + one **approved consignee** (consignee must be approved before it can be used to file, `0167`/`0169`).
> - The test customer is **`approved`** and owns: a **`processing`** JO with multiple X-ray container lines (Lanes B/C/E/F/G) and a **`completed`** JO (Lane D re-X-ray). Stand these up via ST05 Lanes A–E if not already present.
> - Emails/bells: per [[emails-suspended-by-default]] customer emails may be **off**; when off, confirm the **in-app bell** is the surfaced side effect.
>
> **Go-live numbering note:** this run consumes `JO-0000xx` (+ `A` suffixes) and serving-lane numbers; reset sequences after teardown only at a true zero-real-rows state — see ST05 Cleanup.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npm run lint` (`tsc --noEmit`) | 0 errors | |
| P2 Build | `npm run build` | PASS | |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | |
| P5 SPA rewrite | `curl … /app/operations` · `… /app/cashier` · `… /app/checker` · `… /admin/job-orders` | `200` (not 404) for all | |
| P6 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | |
| P7 ADR-0035 RPCs resolve (latest defs) | over the Management API, confirm the new functions + gates exist | `request_priority(uuid)` / `review_priority(uuid,boolean)`; `request_rexray(uuid)→uuid` / `review_rexray(uuid,boolean,boolean)`; `request_supplement(uuid,text)→uuid` / `bill_supplement(uuid,numeric)`; `record_service_invoice(uuid,text,text)`; `serving_numbers_on_status()` trigger present; `restore_serving_number` **absent** (dropped `0182`) | |
| P8 Matrix server-side | read live `role_permissions where allowed` over the Management API | matches the verified matrix above — cashier has **no** `hold_reject_orders`/`complete_orders`; the six request/approve gates land on the rows above; 0 mismatch | |
| P9 Playwright Phase-1 | `BASE_URL=https://portal.ktcterminal.com npm run test:e2e -- e2e/smoke.spec.ts` | all unauth smoke pass (routing, AuthRail menu, protected-route redirects, SPA rewrite, Turnstile) | |

If any preflight check fails, pause and fix first.

---

## Lane A — Roles re-split: each role lands on its staff-PWA screen + the new matrix holds (server-side)

### Route A — `/app/*` landings, the six new gates, CSR-can't-approve, cashier-money-only

**Objective:** Each staff role lands on its **focused `/app/*` screen** (full portal one tap away); the Roles & Gates matrix matches the verified table including the six ADR-0035 gates; the **`0171`** separation-of-duties holds (CSR no order approval, cashier no hold-reject/complete) — enforced **server-side**, not just hidden.
**Start state:** Owner on `/admin/settings`; the st06* staff created (or create them here).

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | `/admin/settings` | Create `st06ops` / `st06cash` / `st06check` / `st06csr` with their roles | owner session | `create_staff` | each appears with a role badge | staff list refreshes | staff creation is owner-only (RPC denies a non-owner) | | |
| A-2 | `/login` → `/` | Sign in as each role; observe the landing | role users | `RoleLanding` | **operations → `/app/operations`** · **cashier → `/app/cashier`** · **checker → `/app/checker`** · **csr → `/app/support`** · admin/owner → `/admin` | a staff-PWA shell with an **"Open full portal"** affordance; bottom-tab/nav shows only that role's tabs | a role can't deep-link a tab it lacks (URL bounce / empty, no data flash) | | |
| A-3 | `/admin/settings` → Roles & Gates | Confirm the matrix matches the verified table, focusing the six new gates + the `0171` deltas | owner session | role-permission matrix | ops = `request_priority`/`request_rexray`/`request_supplement` (+ accept/process/complete/hold-reject/RPS/vessels/view_xray); cashier = `review_payments`/`record_invoice`/**`bill_supplement`** only (**no** hold-reject/complete); checker = `confirm_xray`+`request_rexray`; csr = +`request_priority`, **no** order status; admin = +`approve_priority`/`approve_rexray`, no `confirm_xray` | each column matches; the cashier column has **no** hold-reject/complete; CSR has **no** accept/hold-reject | the matrix is the source of truth; the server enforces the **live** matrix | | |
| A-4 | `/app/operations` (cashier login) | As `st06cash`, try to **accept** or **hold/reject** a `submitted` JO | cashier session | `staff_transition_order` | **no** accept/hold/reject control for the cashier; a forced RPC call **denies** | the cashier sees the money lane, not the order-status controls | `accept_orders`/`hold_reject_orders` deny the cashier (gate removed `0171`) | | |
| A-5 | `/app/support` (csr login) | As `st06csr`, try to **accept**/**approve** an order | csr session | `staff_transition_order` | **no** order-status control; forced accept **denies** | CSR can file-on-behalf + support + request priority, never approve | a CSR can file AND approve would be a maker-checker gap — `0171` closed it | | |

#### Route closure
- [ ] Every role lands on its **`/app/*`** focused screen (full portal one tap away); owner/admin → `/admin`
- [ ] The matrix matches the verified table incl. the six request/approve gates; cashier is money-only; CSR can't approve
- [ ] The `0171` removals are enforced **server-side** (forced RPC denies, not just hidden)

#### Lane closeout
- [ ] Roles re-split + `/app/*` landings + new matrix coherent end-to-end

---

## Lane B — Automatic serving-number lifecycle + lane sort

### Route B — Numbers assign on submitted, vacate on exit, new tail on re-entry; queue sorts priority → regular → re-X-ray

**Objective:** A serving number is **assigned automatically** when a JO hits `submitted`/`processing` and **vacated** when it leaves to `on_hold`/`rejected`/`cancelled`/`completed`; re-entering the line gets a **new tail number** (never the old one); the manual queue-jump (`restore_serving_number`) is gone; the checker/ops queue **sorts** priority lane first, then regular, then re-X-ray.
**Start state:** Signed in as `st06ops` (and `st06check` for the queue); a `submitted` JO and a 2nd JO to hold.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | (DB / `/app/operations`) | Confirm a freshly `submitted` JO has an active serving-number row | a `submitted` JO | `serving_numbers_on_status` trigger | a `serving_numbers` row exists, `service_line='queue'`, `vacated_at` NULL | the order sits in the queue/checker list | the number is assigned by the **trigger**, not a manual click | | |
| B-2 | `/app/operations` | **Hold** the JO (→ `on_hold`), then check the serving row | `hold_reject_orders` (ops) | `staff_transition_order` + trigger | the active number is **vacated** (`vacated_at` set) — off the board | the order leaves the active queue | a vacated number is **not** reused by the next order | | |
| B-3 | `/app/operations` + `/job-orders` | Customer responds to the hold (→ `submitted` again); check the serving row | on_hold JO | `resubmit_needs_info` + trigger | a **new** `serving_numbers` row at the **tail** (a fresh number; the old one stays vacated) | the order re-enters the queue at the back | re-entry never restores the old number (manual `restore_serving_number` **dropped**, `0182`) | | |
| B-4 | `/app/checker` (checker) | Open the X-ray Queue with a mix of regular + (Lane C) priority + (Lane D) re-X-ray orders | checker session | queue read + lane sort | the list sorts **priority lane first → regular → re-X-ray last**; each lane numbers independently | priority rows carry a **★ Priority** chip; re-X-ray rows a **Re-X-ray** chip | a regular order never sorts ahead of a granted-priority order | | |
| B-5 | `/job-orders` (customer) | Open My Job Orders | customer session | select own (RLS) | **no** "Now serving" strip and **no** priority/serving number shown to the customer (retired `0151`) | orders grouped by Batch; aging chip is staff-only | the lane bookkeeping is staff-side; the customer sees no serving number | | |

#### Route closure
- [ ] Serving numbers assign on `submitted`/`processing` and vacate on `on_hold`/`rejected`/`cancelled`/`completed` (trigger-driven)
- [ ] Re-entry gets a **new tail number**; the manual `restore_serving_number` queue-jump is gone (`0182`)
- [ ] The staff queue sorts **priority → regular → re-X-ray**; the customer sees no serving number

#### Lane closeout
- [ ] Automatic serving-number lifecycle + lane sort coherent end-to-end

---

## Lane C — Priority lane: request → admin approve → served ahead

### Route C — CS/ops request priority; admin approves (or denies); granted orders sort first

**Objective:** Operations or CSR **requests** priority on an open order (`request_priority`); an **admin approves** (`review_priority`), moving it to the **priority lane** (served ahead) — or **denies**, clearing the flag. The requester can't self-approve.
**Start state:** Signed in as `st06ops` (or `st06csr`), a `submitted`/`processing` JO; then the admin.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | `/app/operations` (ops) | On an open JO, click **Request priority** | `request_priority` (ops/csr/admin) | `request_priority(p_id)` | `priority_status='requested'` | a **"Priority requested"** chip on the row | only `request_priority` roles see it; an already-granted order can't be re-requested | | |
| C-2 | `/app/operations` (ops) | Look for an **Approve priority** control | ops session | — | **no** approve control for ops | ops can request, not approve | `review_priority` denies ops (forced call) — no self-approve | | |
| C-3 | `/admin/job-orders` (admin) | **Approve priority** on the requested JO | `approve_priority` (admin) | `review_priority(p_id,true)` | `priority_status='granted'`; the old queue number is vacated + a **priority-lane** number assigned | a **★ Priority** chip; the order jumps ahead in the checker/ops queue | approving a **non-requested** order raises "Priority request not found or already decided." (`0183`) | | |
| C-4 | `/admin/job-orders` (admin) | On a different requested JO, **Deny priority** | admin session | `review_priority(p_id,false)` | `priority_status` cleared (back to NULL); stays in the regular lane | the "Priority requested" chip clears | denying a non-requested order raises "Priority request not found." (`0183`) | | |
| C-5 | `/app/checker` (checker) | Confirm the granted-priority JO sorts ahead of regular orders | the C-3 grant | queue sort | the priority order is at the **top** of the lane sort | served-ahead behavior visible | a regular order with a lower JO number does **not** sort above it | | |

#### Route closure
- [ ] Ops/CSR can **request** priority; only an **admin** approves/denies (no self-approve)
- [ ] Approve moves the order to the **priority lane** (served ahead, ★ chip); deny clears it
- [ ] A decide on an already-decided/never-requested order raises (state guard, `0183`)

#### Lane closeout
- [ ] Priority lane request→approve coherent end-to-end

---

## Lane D — Re-X-ray lane: request on a completed JO → child JO-####A → admin approve, with guards

### Route D — Checker/ops request a re-X-ray; a suffixed internal child runs its own lifecycle

**Objective:** On a **completed** JO, a checker or ops **requests a re-X-ray** (`request_rexray`), creating a **child** order (`JO-000001A`, containers copied) that an **admin approves** (`review_rexray`) into the re-X-ray queue. The child is **internal**: no customer notifications, the customer can't see/cancel/edit it, and it can't be X-rayed before approval. Free by default (`rexray_billable=false`).
**Start state:** A **completed** JO from ST05 Lane E; signed in as `st06check` (or ops), then admin, then the test customer.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | `/app/checker` (checker) | On the completed JO, click **Request re-X-ray** → confirm | `request_rexray` (checker/ops/admin) | `request_rexray(p_parent)` | a **child** `job_orders` row: `is_rexray=true`, `parent_job_order_id` set, `rexray_status='requested'`, `jo_number='JO-000001A'`, containers copied from the parent, `status='submitted'` | confirm popup names the suffixed child; **staff** are pinged (`notify_staff('approve_rexray',…)`, `0183`) | request only on a **`completed`** non-re-X-ray order (else raises); an advisory lock prevents a concurrent-suffix collision (`0183`) | | |
| D-2 | `/job-orders` (customer) | Open My Job Orders as the parent's customer | customer session | select own (RLS) | the **child is NOT visible** to the customer; **no** notification fired for it | no `JO-000001A` row, no bell | the re-X-ray child emits **no** customer notifications (internal, `0178`/`0183`) | | |
| D-3 | `/app/checker` (checker) | Try to **confirm a van's X-ray** on the still-`requested` child | child unapproved | `record_van_xray` | **blocked** — raises "This re-X-ray hasn't been approved by an admin yet." | no van flips to CLEARED | can't X-ray a re-X-ray before admin approval (`0181`) | | |
| D-4 | `/admin/job-orders` (admin) | **Approve re-X-ray** (free; leave billable off) | `approve_rexray` (admin) | `review_rexray(p_id,true,false)` | child `rexray_status='approved'`, `status='processing'`, `rexray_billable=false`; enters the **re-X-ray lane** | a **Re-X-ray** chip; the child shows in the checker re-X-ray lane | approving via the generic `accept_orders` path is **blocked** — raises "Use Approve re-X-ray…" (`0178`) | | |
| D-5 | `/app/checker` (checker) | Confirm the child's X-ray vans | child approved | `record_van_xray` | last van rolls up X-ray done → **free re-X-ray auto-completes** (no payment gate) | child → `completed` | a **billable** re-X-ray (if set) would require payment before completing | | |
| D-6 | `/job-orders` (customer) | Attempt to cancel/edit the child (e.g. forced RPC) | customer session | `cancel_job_order` / `update_job_order` | **blocked** — "This is an internal KTC re-X-ray and can't be cancelled/edited here." | no customer controls on the child | the customer can't cancel or edit a re-X-ray child (`0181`/`0183`) | | |

#### Route closure
- [ ] Re-X-ray only on a **completed** order; builds a suffixed **child** (containers copied); staff pinged
- [ ] The child is **internal** — invisible to the customer, no customer notifications, customer can't cancel/edit it
- [ ] Can't X-ray before admin approval; can't be accepted via the generic path; free re-X-ray auto-completes on services-done

#### Lane closeout
- [ ] Re-X-ray lane + guards coherent end-to-end

---

## Lane E — Charges = ops-request → cashier-bill → pay → confirm

### Route E — Ops requests a charge (label only); cashier sets the amount; un-priced never blocks completion

**Objective:** Operations **requests** an additional charge with a **label only** (`request_supplement`, no amount); the **cashier bills** it by setting the amount (`bill_supplement`), creating the payable + notifying the customer; the customer pays; the cashier confirms. A **requested (un-priced)** charge does **not** block completion or show a phantom balance; billing on a completed order does **not** reopen it.
**Start state:** A `processing` JO; signed in as `st06ops`, then `st06cash`, then the test customer.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | `/app/operations` (ops) | **Request charge** — pick a charge type / label, **no amount** | `request_supplement` (ops/admin) | `request_supplement(p_jo,p_label)` | a `jo_supplements` row `JO-####-A`, `amount=NULL`, `bill_status='requested'` | the **cashier** is pinged ("Charge requested — set the amount to bill it", `0183`) | ops **can't** set the amount (the amount field is cashier-only); a requested charge isn't yet a payable | | |
| E-2 | `/app/operations` | Verify the un-priced request does **not** block completion / show a balance | E-1 done, JO otherwise ready | `jo_ready_to_complete` / `sync_open_supplement` | the JO is **not** held back by the requested charge; `has_open_supplement` stays false (only **billed**-unpaid sets it, `0182`) | no phantom "Balance" on the customer's order | a `requested` (un-priced) supplement never blocks the two-gate (`0181`) | | |
| E-3 | `/app/cashier` (cashier) | In **Additional charges**, **bill** the requested charge — enter the amount (> 0) | `bill_supplement` (cashier/admin) | `bill_supplement(p_id,p_amount)` | supplement `amount` set, `bill_status='billed'`; now a payable; customer **notified** | the charge appears as its own PaySection for the customer; `has_open_supplement=true` | a **zero/negative** amount is rejected; billing a non-`requested` supplement is rejected (no double-bill) | | |
| E-4 | `/job-order/:id/pay` (customer) | Pay the billed supplement (upload proof) | supplement billed | `submit_supplement_proof` | supplement `payment_status='submitted'` | the cashier's Additional-charges section lists it | proof scoped to this supplement only | | |
| E-5 | `/app/cashier` (cashier) | **Confirm** the supplement | proof submitted | `review_supplement_payment` / `record_supplement_office_payment` | supplement `confirmed`; if it was the last open gate the JO **auto-(re)completes** | the charge clears | completion needs every **billed** supplement confirmed | | |
| E-6 | `/app/cashier` (cashier) | Bill a charge on an **already-completed** JO | a completed JO | `bill_supplement` / `add_supplement` | the order **stays `completed`** (not reverted); flagged `has_open_supplement` until paid | the "Cleared for release" badge reflects the open balance, not a status flip | billing on a completed order does **not** reopen it (`0183`) | | |

#### Route closure
- [ ] Ops **requests** (label only); cashier **bills** (sets the amount > 0); ops can't price, cashier can't request
- [ ] A **requested** (un-priced) charge never blocks completion or shows a phantom balance
- [ ] Customer pays → cashier confirms → auto-(re)complete; billing on a completed order doesn't reopen it

#### Lane closeout
- [ ] Charges request→bill loop coherent end-to-end

---

## Lane F — Payment requires invoice (online + walk-in)

### Route F — Confirming the base payment requires the ERP invoice + BIR pad serial; recording them is the confirm

**Objective:** The cashier **cannot confirm a base payment** until the **ERP service invoice + BIR pad serial** are on file (`record_service_invoice`); the same gate applies to the **walk-in/office** payment path. RPS is unaffected (no invoice gate). Recording the numbers is the one-step confirm.
**Start state:** A `processing` JO with a submitted base-payment proof; signed in as `st06cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | `/app/cashier` (cashier) | Try to **Confirm** the base payment **before** recording the invoice | proof submitted, no invoice | `review_payment(p_id,true,…,'base')` | **blocked** — raises "Record the ERP service invoice + BIR pad serial before confirming the payment." | the confirm is gated until the invoice fields are filled | base confirm without an invoice is refused (`0177`) | | |
| F-2 | `/app/cashier` | **Record invoice #** — ERP control no. (`OR-INV-…` cash / `BI-INV-…` credit) + BIR pad / serial no. → Save | `record_invoice` (cashier) | `record_service_invoice(p_id,inv,pad)` | `service_invoice_no` normalized (e.g. `OR-INV-00135921`), `invoice_pad_no` set (digits, 4–8, non-zero), `invoice_recorded_at` stamped | live padded preview; helper "Cash: OR-INV-… · Credit: BI-INV-…" | all-zeros ERP rejected; bad pad serial rejected; `record_invoice`-gated | | |
| F-3 | `/app/cashier` | Now **Confirm** the base payment | invoice on file | `review_payment(p_id,true,…,'base')` | base `payment_status='confirmed'`; may auto-complete if services done | balance drops; customer pay page shows confirmed | confirm acts only on a `submitted` proof (idempotent) | | |
| F-4 | `/app/cashier` | On a **different** JO, try **Record office (walk-in) payment** for the base **without** an invoice | no invoice | `record_office_payment(p_id,'base',…)` | **blocked** — same invoice gate raises | the walk-in path can't bypass the invoice gate (`0178`) | the office/walk-in side-door is closed | | |
| F-5 | `/job-order/:id/pay` + `/app/cashier` | Confirm an **RPS** payment (no invoice) | RPS assessed + proof | `review_payment(p_id,true,…,'rps')` | RPS confirms **without** an invoice (RPS has no invoice gate) | RPS section clears | the invoice gate is **base-only**; RPS is unaffected | | |

#### Route closure
- [ ] Confirming a **base** payment is blocked until the ERP invoice + BIR pad serial are recorded (`0177`)
- [ ] The **walk-in/office** payment path is gated the same way (`0178` — no side-door)
- [ ] RPS confirms without an invoice (gate is base-only); recording the numbers is the one-step confirm

#### Lane closeout
- [ ] Payment-requires-invoice coherent end-to-end (online + walk-in)

---

## Lane G — Automatic completion (no manual button)

### Route G — The order self-completes from whichever side finishes last

**Objective:** A JO reaches **`completed`** **automatically** when the last gate (services *or* payment) lands — there is **no "Mark completed" button**. Verified from both directions: services-last and payment-last.
**Start state:** A `processing` JO with X-ray vans confirmable + a base payment to confirm (and Lane F's invoice path available).

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | `/app/operations` / `/app/cashier` | Look for a **Mark completed** button on a ready JO | services + payment both done | — | **no** manual complete button anywhere | completion is implicit | the manual complete path is retired (ADR-0035); `staff_transition_order→completed` only as an admin override | | |
| G-2 | `/app/cashier` (payment-last) | With all services done, **confirm the base payment** (after recording the invoice, Lane F) | services done, payment open | `complete_on_payment_confirmed` trigger | the JO **auto-completes** the instant the payment confirms; `completed_at` stamped | "Cleared for release" badge; completed bell | completion auto-fires on the **last** gate — no click | | |
| G-3 | `/app/checker` (services-last) | On a 2nd JO already **paid**, confirm the **final X-ray van** | payment confirmed, last service pending | `complete_on_service_done` trigger | the JO **auto-completes** when the last service lands; `completed_at` stamped | completed from the services side | services-last completes too (the symmetric trigger, `0172`) | | |
| G-4 | `/verify/:id` | Open the public verify page on the completed JO | order completed + paid | anon `verify_job_order` | shows **✓ PAID** + **Completed** | matches the auto-complete state | a not-fully-paid order shows **⚠ NOT PAID** | | |

#### Route closure
- [ ] There is **no manual complete button** — completion is automatic
- [ ] The order auto-completes from **both** the payment-last and services-last directions
- [ ] The verify page reflects PAID + Completed only when both gates are met

#### Lane closeout
- [ ] Automatic completion coherent end-to-end

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| A — Roles re-split + `/app/*` landings + matrix | | | |
| B — Auto serving-number lifecycle + lane sort | | | |
| C — Priority lane (request→approve) | | | |
| D — Re-X-ray lane + guards | | | |
| E — Charges request→bill | | | |
| F — Payment requires invoice | | | |
| G — Automatic completion | | | |

## Reuse rule

Keep the canonical Route/Click/Backend-Contract structure (`docs/smoke-test-template-canonical.md`). ST06 is the **ADR-0035 deltas** pass; for the broad onboarding / X-ray / payments / release walkthrough see **ST05** (`docs/smoke-test-05-portal.md`), and for the release/pull-out deep dive **ST04**. See `docs/agent/testing-and-release.md`.
