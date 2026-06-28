# Smoke Test ST04 — Release / Pull-out blind walkthrough (customer-filed online release spine + no-zero number rules)

**Smoke Test ID:** ST04
**Date:** 2026-06-21
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — DB migrations through **0130**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Scope source:** ADR-0024 (+ its 2026-06-21 Addendum), `src/pages/Releases.tsx`, `src/admin/Releases.tsx`, migrations `0124`–`0130`.

## Purpose

The **release / pull-out blind walkthrough**: a human walks the live portal end-to-end and proves the **customer-filed container release** spine works front-to-back, plus the **no-zero number rules**. Flow (ADR-0024): customer files a release (consignee + BL no. + DO/BL upload) → CSR documents desk **verifies** → release desk **sets the charges once** (additional charges added as supplements) → customer **pays online** (proof to `payment-slips` + QRPH) → cashier **confirms** → cashier **records the BIR OR number + ERP control no.** in one action → **released** (claim OR at office for pull-out). Then the number rules: BIR OR (≤6 digits, zero-padded to 6, non-zero), ERP control no. (`OR-INV-` + ≤8 digits, padded to `OR-INV-00000000`, cash/OR only, non-zero), and the **rate/fee placeholders are empty (NULL), never ₱0**. Verify frontend **and** backend (the SECURITY DEFINER RPC) **and** side effects at each click.

> **Out of scope / future:** the JO "cleared for release" cross-link and container/EIR grain (ADR-0024 P3, deferred) — v1 stands alone keyed by consignee + BL + uploaded docs. The release module is **separate from the Job Order** (ADR-0022 — most containers have no JO); the JO spine itself is exercised by ST03, not here. BI / credit ERP control numbers are deferred for the release path (cash / `OR-INV-` only); the JO path still accepts both. The configurable ERP series window (`pricing_settings.erp_series_min`/`erp_series_max`) is intentionally **left unset/open** — do not enforce a narrow series here.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; failsafe; bypasses every gate (both `verify_release_docs` + `review_payments`) |
| Admin (secondary) | _create via Settings → Staff_ | `jla.ktcport@gmail.com` is **no longer admin** (now a rejected customer) — create a fresh staff admin (grant `verify_release_docs`) for non-owner checks |
| Test customer | a throwaway email you control (e.g. `you+st04@gmail.com`) | **must be fully approved** before filing — releases reject `pending` (unlike JOs) |
| CSR (documents desk) | created via Settings → Staff | e.g. `st04csr` — `verify_release_docs` only (no money, no OR) |
| Cashier | created via Settings → Staff | e.g. `st04cash` — `review_payments` only (confirm pay + record OR; no doc verify) |
| Checker / Operations (negative) | reuse an `st03check` / `st03ops`-style staff, or create `st04neg` | a role with **neither** release gate — used to prove the desk is hidden + the RPCs deny |

> **Preconditions to set before the lanes (clears the data gate):**
> - The **test customer is `approved`** (owner approves at `/admin/approvals`) — the release form is gated on `broker?.status === 'approved'` and `file_release_order` raises otherwise.
> - **Payment details** (Settings → Payment details: bank / GCash / account / QR image to the `payment-qr` bucket) filled, so the "How to pay" block + QRPH render on the pay step. If unset, the page shows the "Payment details will be posted here soon" fallback — note it but it does not block paying at the cashier.
> - For **Lane F** specifically: a fresh look at Settings → **Service rates & fees** with at least one rate/fee **left unset** (or cleared), to prove "not set" / "—" rendering (no ₱0 / ₱NaN). The release amount itself is **staff-entered** (no in-app rate calc), so rates/fees do not feed the release total — Lane F checks the no-zero placeholder behaviour app-wide, not the release amount.
> - Emails/bells: per [[emails-suspended-by-default]] customer emails may be off (`0074` switch); when off, confirm the **in-app bell** is the surfaced side effect.
>
> **Go-live numbering note:** this run consumes `RO-0000xx` from `release_no_seq`. After teardown, delete the test releases + supplements and (only safe at zero real releases) reset `release_no_seq` so the first real release is `RO-000001` — see Cleanup.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npx tsc --noEmit` | 0 errors | ✅ **PASS** — 0 errors |
| P2 Build | `npm run build` | PASS | ✅ **PASS** — built clean |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | ✅ **PASS** — 200 |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | ✅ **PASS** — only `mdlnfhyylvapzdubhyic.supabase.co` (no jta-sys) |
| P5 SPA rewrite | `curl … /releases` then `… /admin/releases` | `200` (not 404) for both | ✅ **PASS** — both 200 |
| P6 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | ✅ **PASS** — `"error_code":"captcha_failed"` |
| P7 Migrations applied | release RPCs resolve to the latest defs | `record_release_or(uuid,text,text)` exists; OR validation = "up to 6 digits, non-zero"; `normalize_erp_invoice_no` = OR-INV cash only | ✅ **PASS** — 3-arg sig + 6-digit OR rule + ERP cash-only all confirmed |
| P8 Buckets present | `release-docs` (private) + `payment-slips` + `payment-qr` exist | release-docs RLS is per-user folder | ✅ **PASS** — `release-docs` + `payment-slips` private, `payment-qr` public (QR image) |

> **Preflight run 2026-06-21 — all P1–P8 PASS** (v1.5.0, commit `2af1f3e`; migrations through `0131`). The Lane tables below are the manual blind walkthrough, still to be executed.

If any preflight check fails, pause and fix first.

---

## Lane A — Customer files a release

### Route A — Approval gate → file (consignee + BL + DO/BL) → submitted → customer cancel

**Objective:** A **non-approved** account is blocked (sees `BrokerStatusBanner` + warning, no form — and `file_release_order` raises server-side); an **approved** customer files a release (consignee picker + BL no. + DO/BL upload to `release-docs`) → status **submitted** with an `RO-######` number; the customer can **cancel** while pre-payment.
**Start state:** Logged in as the test customer at `/releases`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | `/releases` (pending account) | Open Release / Pull-out **before** the account is approved | account `pending`/unapproved | client gate `broker?.status === 'approved'` | **no "File a release" form**; `BrokerStatusBanner` + a warning "Your account must be approved before you can file a release / pull-out request." | existing releases (if any) still list below; only the file form is suppressed | even if the form is forced, `file_release_order` raises "Your account must be approved to file a release." | | |
| A-2 | `/admin/approvals` (owner) | Approve the test customer, then return to `/releases` | owner session | approval RPC | form now renders | banner clears; "File a release" card appears | only admin/owner can approve | | |
| A-3 | `/releases` | Pick a consignee (typeahead), enter a **BL number**, attach a DO/BL (image/PDF), click **File release** | approved customer | upload to `release-docs/{uid}/…` → `file_release_order(p_consignee, p_bl, p_doc_path)` | a `release_orders` row: `release_number='RO-000001'`, `status='submitted'`, `bl_number` UPPERCASE, `doc_path` set | row appears in **My releases** with the "Awaiting document check" chip; BL forced uppercase as you type | **File release** with a blank BL is blocked ("Enter the Bill of Lading (BL) number."); BL > 60 chars raises server-side | | |
| A-4 | `/releases` | File a 2nd release **without** a document (doc is optional at filing) | approved customer | `file_release_order(p_doc_path = null)` | a second row `RO-000002`, `status='submitted'`, `doc_path` null | helper text "Optional now — KTC verifies the document before assessing the charges." | the DO/BL upload lands in a per-user folder (storage RLS: `(foldername)[1] = uid`) | | |
| A-5 | `/releases` | Open the `RO-000002` detail → **Cancel this request** → confirm "Yes, cancel it" | release is `submitted` | `cancel_release_order(p_id)` | status → **cancelled**; the "This release was cancelled." notice shows | row chip flips to cancelled; modal closes | the cancel control is offered only while `submitted | docs_verified | payable | on_hold` (the RPC enforces the same window) | | |
| A-6 | `/releases` (RLS read) | Confirm the list shows **only this customer's** releases | approved customer | `release_orders` SELECT (RLS `customer_id = current_broker_id()`) | no other customer's releases appear | direct read via RLS, not an RPC | a customer cannot read another customer's release (RLS) | | |

#### Route closure
- [ ] Non-approved account is blocked client-side **and** by `file_release_order` (approval is mandatory for a release)
- [ ] Filing writes `RO-######` + `submitted` + UPPERCASE BL; DO/BL is optional at filing and lands in a per-user `release-docs` folder
- [ ] Customer can cancel a pre-payment release (`cancel_release_order`) within the allowed window

#### Lane closeout
- [ ] Customer file → submitted → cancel coherent end-to-end

---

## Lane B — CSR documents desk: verify / hold → re-upload

### Route B — Verify the DO/BL (gate `verify_release_docs`) → docs_verified, or hold → on_hold → customer re-uploads

**Objective:** The CSR (lands on `/admin/releases`, **Documents desk**) opens the DO/BL, then **verifies** (→ `docs_verified`) or **holds for a corrected doc** (→ `on_hold` with a customer-visible note); the customer **re-uploads** via `resubmit_release_doc` (→ back to `submitted`). A role without `verify_release_docs` cannot reach the desk or call the RPC.
**Start state:** Signed in as `st04csr`; a `submitted` release from Lane A.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | `/admin/releases` (CSR) | Sign in as CSR → observe the **Documents desk** with the "To verify" bucket | `verify_release_docs` | RLS `staff reads releases` | the submitted release is listed under "To verify · N"; **Cashier** section is hidden (no `review_payments`) | nav shows the Releases tab; only the docs desk renders | a role with neither gate hits "No access to the release desk." | | |
| B-2 | `/admin/releases` | Click **View DO/BL** on the submitted release | release has `doc_path` | `openFromStorage('release-docs', …)` | the uploaded doc opens in the in-app `FileViewerModal` | viewer reads from the private `release-docs` bucket via staff RLS | View is disabled when `doc_path` is null (A-4's no-doc release) | | |
| B-3 | `/admin/releases` | Click **Hold for a corrected doc** → type a note → **Put on hold** | `verify_release_docs` | `verify_release_order(p_id, false, p_note)` | status → **on_hold**; `staff_note` = the note; surfaces in the To-verify card | "Note to customer" chip on the card; hold requires a non-empty note (button disabled until typed) | a role without `verify_release_docs` cannot verify/hold ("You don't have permission to verify release documents.") | | |
| B-4 | `/releases` (customer) | Open the on-hold release → read the note → re-upload a corrected DO/BL → **Resubmit document** | release is `on_hold` | upload → `resubmit_release_doc(p_id, p_doc_path)` | status → **submitted**; `staff_note` cleared; new `doc_path` | the warning "A corrected document is needed" shows the staff note | resubmit only fires on an `on_hold` release owned by the customer ("This release can't be resubmitted." otherwise) | | |
| B-5 | `/admin/releases` (CSR) | On the resubmitted release, **Verify** | release is `submitted`/`on_hold` | `verify_release_order(p_id, true, null)` | status → **docs_verified**; `verified_at`/`verified_by` stamped; `staff_note` cleared | the release moves from "To verify" to the "Set charges" bucket | verify only fires while `status in ('submitted','on_hold')` | | |

#### Route closure
- [ ] CSR can view the DO/BL, verify (→ docs_verified) or hold (→ on_hold with a note)
- [ ] Customer re-uploads a corrected doc (`resubmit_release_doc`) → back to submitted
- [ ] A non-CSR / non-admin role cannot reach the desk or call `verify_release_order`

#### Lane closeout
- [ ] CSR documents desk coherent end-to-end

---

## Lane C — Charges (set once) + additional charge

### Route C — set_release_charges → payable; revise blocked; add_release_charge → supplement

**Objective:** The release desk sets the **base charge once** (`set_release_charges` only on a `docs_verified` release) → **payable**; a second attempt to revise is **rejected** ("set once"); a zero/negative amount is rejected; an extra charge is added as a `release_supplements` line via `add_release_charge`.
**Start state:** Signed in as `st04csr` (or admin/owner); a `docs_verified` release from Lane B.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | `/admin/releases` (Documents desk → Set charges) | Enter an amount (e.g. `5000`) + optional note → **Set charges** | release `docs_verified` | `set_release_charges(p_id, p_amount, p_note)` | `amount=5000`, `charges_note` set, `charges_set_at` stamped; status → **payable** | the release leaves "Set charges" and becomes payable for the customer | a **zero or negative** amount is rejected ("Enter a charge amount greater than zero.") | | |
| C-2 | `/admin/releases` | Try to set charges again on the same (now `payable`) release | release `payable` | `set_release_charges` | **rejected** — "Charges are set once, on a verified release — they can't be revised. Add an additional charge instead." | the Set-charges bucket no longer lists this release (it's `payable`) | the update's `where status = 'docs_verified'` blocks any revise once payable | | |
| C-3 | `/admin/releases` (Documents desk → Additional charges) | On the payable release, **Add charge**: label + amount (e.g. "Storage overrun" / `750`) → **Add charge** | release `payable` or `paid` | `add_release_charge(p_release, p_label, p_amount)` | a `release_supplements` row (`unpaid`, label, amount); appears under the release's supplement list | the card lists the new supplement with its "Unpaid" chip | a blank label or an amount **≤ 0** is rejected ("Enter a valid amount." / "Describe the additional charge.") | | |
| C-4 | `/admin/releases` | Confirm a supplement can't be added before the base charge is set | a still-`docs_verified` release | `add_release_charge` | **rejected** — "Additional charges can only be added once the base charge is set." | the add-charge bucket lists only `payable`/`paid` releases | the RPC's status guard (`payable`/`paid`) holds | | |

#### Route closure
- [ ] `set_release_charges` fires once on a `docs_verified` release → payable; a revise on a `payable` release is rejected ("set once")
- [ ] The base amount must be **> 0**
- [ ] `add_release_charge` creates a `release_supplements` line (amount > 0, label required) only on a priced release

#### Lane closeout
- [ ] Charges (set once) + additional charge coherent end-to-end

---

## Lane D — Customer pays + cashier confirms (base + supplement)

### Route D — submit_release_payment → cashier confirm/reject → paid; pay + confirm each supplement

**Objective:** The customer uploads the base payment proof (`payment-slips` + QRPH) → **submitted**; the cashier (lands on `/admin/releases`, **Cashier** section) **rejects** (note → customer re-uploads) then **confirms** → **paid**; the customer pays each **additional charge** separately (`submit_release_supplement_payment`) and the cashier confirms each (`confirm_release_supplement_payment`).
**Start state:** A `payable` release with one supplement (Lane C); signed in as the test customer, then `st04cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | `/releases` (detail, customer) | Open the payable release → review **Amount due** + "How to pay" (bank / GCash / QRPH) → upload the deposit slip → **Submit to KTC** | release `payable` | upload to `payment-slips/{uid}/release-{id}.ext` → `submit_release_payment(p_id, p_proof_path)` | `payment_status='submitted'`, `payment_submitted_at` set | "Payment proof under review." notice; the QR enlarges/downloads via `FileViewerModal` | the proof is scoped to the customer's own folder (storage RLS); submit only fires while `status='payable'` and `payment_status in ('unpaid','rejected')` | | |
| D-2 | `/admin/releases` (Cashier → Payments to review) | Sign in as cashier → observe the submitted proof; **View payment proof**, then **Reject** with a note | `review_payments` | `confirm_release_payment(p_id, false, p_note)` | `payment_status='rejected'`, `payment_note` set; status stays `payable` | the **Documents desk** section is hidden for the cashier (no `verify_release_docs`) | reject requires a non-empty note; a role without `review_payments` can't decide | | |
| D-3 | `/releases` (customer) | See the rejection reason → re-upload a corrected slip → **Submit to KTC** | `payment_status='rejected'` | `submit_release_payment` (re-upload) | back to `payment_status='submitted'` | "Your payment proof wasn't accepted: <note>" error notice with the cashier's reason | re-submit allowed from `rejected` (the RPC's `payment_status in ('unpaid','rejected')`) | | |
| D-4 | `/admin/releases` (Cashier) | **Confirm payment** on the resubmitted proof | proof `submitted` | `confirm_release_payment(p_id, true, null)` | `payment_status='confirmed'`, `payment_confirmed_at` set; status → **paid** | the customer detail shows "Paid — claim your Official Receipt (OR) at the KTC office for pull-out." | confirm only fires while `payment_status='submitted'` (idempotent — no double-credit) | | |
| D-5 | `/releases` (customer) | In the same detail, pay the **additional charge** (supplement): upload a slip → **Submit to KTC** | release `paid`, supplement `unpaid` | upload to `payment-slips/{uid}/release-supp-{id}.ext` → `submit_release_supplement_payment(p_id, p_proof_path)` | the supplement → `payment_status='submitted'` ("Under review" chip) | each supplement has its own proof upload; "Pay to the same account / QR above" | supplement proof is scoped per-line; submit only from `unpaid`/`rejected` | | |
| D-6 | `/admin/releases` (Cashier → Additional-charge payments to review) | **Confirm** the supplement payment | supplement `submitted` | `confirm_release_supplement_payment(p_id, true, null)` | supplement → `confirmed` ("Paid") | the supplement leaves the review bucket; the release now has all charges confirmed | reject path (with note) → `rejected`, customer re-uploads; a non-`review_payments` role is denied | | |

#### Route closure
- [ ] Customer pays base online (proof to `payment-slips` + QRPH); cashier reject (note) → re-upload → confirm → **paid**
- [ ] Each additional charge is paid + confirmed separately (`submit`/`confirm_release_supplement_payment`)
- [ ] Both confirm RPCs are `review_payments`-gated and only act on a `submitted` proof

#### Lane closeout
- [ ] Customer pay + cashier confirm (base + supplement) coherent end-to-end

---

## Lane E — Record OR / released + number rules

### Route E — record_release_or: OR (≤6, padded to 6) + ERP control no. (OR-INV-, padded to 8, cash) → released; guardrails

**Objective:** The cashier records the **BIR OR number** + **ERP control no.** in one action (`record_release_or`) → **released**; the number rules hold: OR ≤6 digits zero-padded to 6, non-zero; ERP `OR-INV-` + ≤8 digits padded to 8, cash only, non-zero; the OR is blocked while any supplement is unconfirmed; the OR is only recordable on a `paid` release.
**Start state:** A `paid` release with **all** supplements confirmed (Lane D); signed in as `st04cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | `/admin/releases` (Cashier → Record OR) | On the paid release, **Record OR** → type a BIR OR (e.g. `1234`) + ERP control no. (e.g. `12345`, the `OR-INV-` prefix is fixed) → **Record OR** | release `paid`, all supplements `confirmed` | `record_release_or(p_id, p_or, 'OR-INV-'+invNo)` | status → **released**; `or_number='001234'` (padded to 6), `service_invoice_no='OR-INV-00012345'` (padded to 8), `released_at` + `invoice_recorded_at` stamped | live padded previews ("= 001234" / "= OR-INV-00012345") update as you type; the customer detail shows "Released — Official Receipt No. 001234" + "ERP invoice: OR-INV-00012345" | OR input is digits-only capped at 6; ERP input digits-only capped at 8 (UI), padding is server-side | | |
| E-2 | `/admin/releases` (Record OR) | Try to record with the OR field **all zeros** (e.g. `000`) | release `paid` | `record_release_or` | **rejected** — "Enter a valid BIR OR number — up to 6 digits, non-zero." | no status change; error banner | the `v_or::bigint = 0` check rejects all-zeros | | |
| E-3 | `/admin/releases` (Record OR) | Try to record with an **ERP control no. of all zeros** (e.g. `00000000`) | release `paid` | `normalize_erp_invoice_no` | **rejected** — "Enter a valid ERP control no. — OR-INV-00000000 (cash), non-zero. (BI / credit handled later.)" | no status change | the normalizer's `m[1]::bigint = 0` check rejects all-zeros | | |
| E-4 | (RPC) | Attempt to record a **BI-INV** ERP control no. on a release (forced call, since the UI fixes the `OR-INV-` prefix) | release `paid` | `normalize_erp_invoice_no` | **rejected** — release path is cash / `OR-INV-` only (the regex anchors `^OR-?INV-?…`) | UI never offers `BI-` for releases (prefix is hard-fixed) | the JO path still accepts BI; the release path does not | | |
| E-5 | `/admin/releases` (Record OR) | On a **paid release with an unconfirmed supplement**, try **Record OR** | a supplement still `unpaid`/`submitted`/`rejected` | `record_release_or` | **rejected** — "An additional charge is still unpaid — it must be settled before the OR." | the card shows "Additional charge unpaid — OR blocked until the cashier confirms every charge." | the OR is blocked until **every** supplement is `confirmed` | | |
| E-6 | `/admin/releases` (Record OR) | Try **Record OR** on a release that is **not paid** (e.g. still `payable`) | release `payable` | `record_release_or` | **rejected** — "The OR can only be recorded on a paid release." | such a release is not in the "Record OR" bucket (only `status='paid' && !or_number`) | the update's `where status='paid'` enforces it server-side | | |

#### Route closure
- [ ] Recording OR + ERP control no. in one action → released, with both numbers zero-padded server-side (OR→6, ERP→8)
- [ ] All-zeros OR and all-zeros ERP are rejected; release path is cash / `OR-INV-` only (BI rejected)
- [ ] OR is blocked while any supplement is unconfirmed and only recordable on a `paid` release

#### Lane closeout
- [ ] Record OR / released + number rules coherent end-to-end

---

## Lane F — Staff cancel + no-zero rate/fee placeholders

### Route F — Staff cancel a pre-payment release; rates/fees show "not set" (NULL, never ₱0); Calculator/Payment show "—" / "rates not set"

**Objective:** A staff member cancels a pre-payment release (`cancel_release_order`); and the **no-zero** placeholders hold app-wide: Settings → Service rates & fees show empty "not set" (not ₱0) and saving empty stores **NULL**; the Calculator / Payment pages render **"—"** / a "rates not set" notice for unconfigured rates — never ₱0 or ₱NaN.
**Start state:** A fresh `submitted`/`payable` release (Lane A/C); signed in as a release-desk staff (CSR or cashier), then the owner for the rates view.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | `/admin/releases` (CSR/cashier) | On a pre-payment release, **Cancel release** → enter an optional reason → **Confirm cancel** | release `submitted | docs_verified | payable | on_hold` | `cancel_release_order(p_id, p_reason)` | status → **cancelled**; `staff_note` = the reason (shown to the customer) | the customer detail shows "This release was cancelled." + the reason | a `paid`/`released` release shows **no** Cancel control; the RPC rejects ("it's already paid or released.") | | |
| F-2 | `/admin/releases` | Confirm a staff member with **neither** release gate cannot cancel | `st04neg` (no gates) | `cancel_release_order` | the Cancel control is absent (CANCELLABLE + gate check); the RPC denies ("You can't cancel this release.") | the whole desk shows "No access to the release desk." for `st04neg` | only the owner, `verify_release_docs`, or `review_payments` may staff-cancel | | |
| F-3 | `/admin/settings` → Service rates & fees (owner) | View an **unconfigured** rate / fee (e.g. admin fee or print fee left blank) | a rate/fee is NULL (0128) | `service_rates` / `pricing_settings` read | the field shows **empty "not set"**, not "₱0.00" | placeholder text "not set"; no ₱0 leak | a stored NULL is never coerced to 0 for display | | |
| F-4 | `/admin/settings` → Service rates & fees | **Clear** a rate (leave it empty) → Save | owner session | save → NULL (0128 made the columns nullable) | the cleared rate persists as **NULL**, not 0 | reload shows "not set" again | an empty save stores NULL (no silent ₱0 placeholder) | | |
| F-5 | `/calculator` (or the customer Calculator) | Open the rate calculator with an **unconfigured** rate | a service rate is NULL | `src/lib/pricing.ts` (frontend compute) | the unconfigured line shows **"—"** (not ₱0 / ₱NaN); the total excludes it | a "rates not set" notice / "—" for unpriced lines | NULL or ≤0 rate is treated as "not configured" (never summed) | | |
| F-6 | `/job-order/:id/pay` (Payment) | Open a JO Payment page where a fee/rate is unconfigured | a fee/rate is NULL | `src/lib/pricing.ts` | unconfigured fees render **"—"** and don't add to the total; no ₱NaN | a "rates not set" hint where applicable | the release **amount** is staff-entered and unaffected by this — Lane F is the app-wide placeholder check, not the release total | | |

#### Route closure
- [ ] Staff cancel works only on a pre-payment release and only for gated staff (`cancel_release_order`)
- [ ] Settings rates/fees show "not set" (NULL) and save empty → NULL — never ₱0
- [ ] Calculator / Payment render "—" / "rates not set" for unconfigured rates (never ₱0 / ₱NaN)

#### Lane closeout
- [ ] Staff cancel + no-zero rate/fee placeholders coherent end-to-end

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | OPEN | |

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| Preflight (P1–P8) | ✅ PASS | All 8 gates pass (2026-06-21, v1.5.0 / `2af1f3e`) | Go |
| A — Customer files a release (approval gate + cancel) | | | |
| B — CSR documents desk (verify / hold / re-upload) | | | |
| C — Charges (set once) + additional charge | | | |
| D — Customer pays + cashier confirms (base + supplement) | | | |
| E — Record OR / released + number rules | | | |
| F — Staff cancel + no-zero rate/fee placeholders | | | |

**Overall go / no-go:** ____

## Cleanup after run

- Cancel/clear the test releases (`RO-0000xx`) + their `release_supplements`; suspend/reject the throwaway customer; revoke `st04csr` / `st04cash` / `st04neg`.
- Remove the test `release-docs` + `payment-slips` uploads created during the run (storage objects can't be deleted via SQL — use the Storage API; the 3-day purge clears them regardless).
- **Go-live numbering:** delete the test releases and reset `release_no_seq` so the first *real* release is `RO-000001` (only safe at zero real releases).
- Re-fill any Settings → Service rates & fees field cleared in Lane F back to its launch value (or leave intentionally "not set" per the no-zero policy).
