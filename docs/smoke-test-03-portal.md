# Smoke Test ST03 — Pre-launch Blind Walkthrough (current build: queue · per-van X-ray · two-gate completion · supplements · verify-QR · roles)

**Smoke Test ID:** ST03
**Date:** 2026-06-16
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — DB migrations through **0104**, Vercel commit **1b2e824**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Supersedes:** the unexecuted contract lanes of **ST02** (see ST02 Closeout, 2026-06-16). ST01 (auth/onboarding/consignees/job-orders/staff) and the ST02 security inventory still stand as references.

## Purpose

The pre-launch **blind walkthrough**: a human walks the live portal end-to-end on the **current** build and proves the order spine works front-to-back — customer files → Priority number → operations accepts + assesses RPS → checker confirms each van's X-ray entry (with e-signature) → payments (online proof + cashier confirm + walk-in) → **two-gate completion** → additional-charge supplements (under review → pay → re-complete) → staff edit + comment escalation + CSR support → printed slip + public verify-QR → roles & gates land correctly → owner/security basics. Verify frontend **and** backend **and** side effects at each click.

> **Out of scope / future:** the **GUARD gate-in / gate-out (gate-scan) module is NOT built** — deferred. Do not test it here; it is noted as future in Lane C. Vessel-schedule authoring (free-days, CSV import, calendar, Viber snapshot) and the housekeeping crons (archive, Monday carry-over, ID retention) carry forward from ST02 as standing ops checks, not blind-walk lanes — only the customer-facing vessel **dropdown** is exercised here (Lane A).

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; failsafe; never lockable |
| Admin (fallback) | `jla.ktcport@gmail.com` | plain admin |
| Test customer | a throwaway email you control (e.g. `you+st03@gmail.com`) | created in Lane A |
| Operations | created in Lane J via Settings | e.g. `st03ops` — accept/complete/hold-reject + assess RPS; monitors X-ray (no confirm) |
| Cashier | created in Lane J via Settings | e.g. `st03cash` — confirm payments + walk-in; complete/hold-reject |
| Checker | created in Lane J via Settings | e.g. `st03check` — per-van X-ray confirm ONLY |
| CSR | created in Lane J via Settings | e.g. `st03csr` — file + support inbox; never changes order status |

> **Preconditions to set before the lanes (clears the data gate):** Settings → **Service rates & fees** non-zero (X-ray rate + admin + print fees); **Payment details** (bank / GCash / QR image) filled; at least one **current vessel** on the schedule (for the filing dropdown); **RPS per-move rates** set; a **shipping line + free-days** row. Emails consume the Resend free tier (~100/day) — this run sends a handful. Per [[emails-suspended-by-default]] customer emails may be **off** by the `0074` switch; when off, confirm the **in-app bell** fires instead (the email is the side effect that is intentionally suppressed).
>
> **Go-live numbering note:** prod is meant to start the first *real* order at `JO-000001`. This run consumes `JO-0000xx` / `BR-0000xx`; after teardown, delete the test orders/customer and reset the sequences (only safe at zero real orders) — see Teardown.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npx tsc --noEmit` | 0 errors | |
| P2 Build | `npm run build` | PASS | |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | |
| P5 Turnstile inlined | grep bundle for site key | `0x4AAAAAADf_oKtFqQwj9HoP` present | |
| P6 SPA rewrite | `curl … /admin/job-orders` then `… /verify/test` | `200` (not 404) for both | |
| P7 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | |
| P8 Commit deployed | footer hover tooltip / `/` HTML | reflects commit `1b2e824` | |

If any preflight check fails, pause and fix first.

---

## Lane A — Customer: file → queue → Priority number

### Route A — Register / file a Job Order and get one Priority number

**Objective:** A customer registers, gets onboarded, files a JO against a master-list consignee with a required Entry number + vessel/voyage, and the order receives **one generalized Priority #N** (weekly reset) on reaching a live status.
**Start state:** Logged out.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | `/login` | (optional) pick 🌐 EN/FIL, then Register: name + contact + email + pw; scroll-agree + consent tick; CAPTCHA; Sign up | logged out | `auth.signUp` + `handle_new_user` | auth user + customer row `status='pending'`; confirmation email/branded | Tick disabled until scrolled; Sign up disabled until ticked; "1 email = 1 account" blocks a re-used email | a duplicate email is refused at signup | | |
| A-2 | email → `/verify-id` | Confirm email → sign in → first-run **language chooser** → **Quick tour** → upload valid ID (or Skip) | confirmed session | storage `valid-ids/{uid}/…` + `valid_id_path` | lands signed-in; tour runs in chosen language once per browser; ID stored | language gate fires before the tour; tour does not re-fire on reload | unconfirmed session is blocked at `ProtectedRoute` | | |
| A-3 | `/job-order` | File a JO: typeahead-pick a consignee, enter **Entry (C-) number** (required, UPPERCASE), pick **Vessel & Voyage** from the dropdown (or "not listed" → manual), add X-ray line(s) | pending customer | insert `job_orders` + `job_order_lines` | saved as **held** ("Draft — no number yet"); cap = 10 held | Entry gates Next/submit; vessel dropdown lists only **current** vessels; manual escape hatch raises a pending-vessel request | held order is hidden from the admin queue | | |
| A-4 | `/admin/approvals` (owner) | Approve the test customer | owner session | update `status='approved'`; `release_held_job_orders` trigger | held order flips to **submitted** + gets `JO-######` | account-approved bell + email (or bell only if emails off) | only admin/owner can approve | | |
| A-5 | `/job-orders` (customer) | Open My Job Orders | approved | select own orders (RLS) | the order shows **Priority #N** (one number per JO, not per service) | "Now serving" / priority strip; Active default; Needs-action / Completed / Closed filters switch server-side | customer sees only own orders | | |
| A-6 | `/job-orders` | File a 2nd JO via **Bulk paste** (3+ containers), then **cancel** it (confirm prompt) | approved | insert lines / update `cancelled` | one line per container (dups skipped); cancel vacates its Priority number (burned, not reused) | cancelled order leaves Active; its number is not handed to another JO | cap = 10 open enforced | | |

#### Route closure
- [ ] Onboarding (register → confirm → verify-id → tour) coherent on the current build
- [ ] Filing requires a consignee **and** an Entry number; vessel dropdown works with an escape hatch
- [ ] Approval releases the held order with `JO-######` + **one** Priority #N

#### Lane closeout
- [ ] Customer file → queue → Priority number coherent end-to-end

---

## Lane B — Operations: accept order + assess RPS

### Route B — Stage-gated acceptance and RPS assessment

**Objective:** Operations (lands on `/admin/job-orders`) can **accept** an order and **assess RPS** (none / per-move), which feeds the release gate — but operations cannot confirm X-ray.
**Start state:** Signed in as `st03ops` (created in Lane J), an approved customer JO in `submitted`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | `/admin/job-orders` | Sign in as operations → observe landing + queue | ops user | `RoleLanding` | lands on **Job Orders**; queue visible | nav shows ONLY the ops-permitted tabs (no Approvals/Customers/Consignees/Settings/2FA) | ops cannot reach owner-only routes (URL bounce) | | |
| B-2 | `/admin/job-orders` | **Accept** the submitted JO | `accept_orders` gate | `staff_transition_order` | status → **processing**; History logs the actor | chip + History entry; queue refreshes | a role without `accept_orders` cannot accept (RPC denies) | | |
| B-3 | `/admin/job-orders` (or Checker monitor) | **Assess RPS → "No RPS needed"** on one JO | `assess_rps` gate | RPS RPC | **No RPS** chip; customer total unchanged | chip on admin + customer rows | non-ops cannot assess RPS | | |
| B-4 | `/admin/job-orders` | **Assess RPS → enter moves** (e.g. Trucking 6) + optional doc → Save | rates set | RPS RPC (per-move) | **RPS needed** chip; per-move charge computed; `rps` bell fires | customer pay page later shows a separate RPS section + balance | RPS amount uses the configured per-move rates | | |
| B-5 | `/admin/job-orders` | Confirm operations has **no X-ray confirm** control on a van | ops user | — | no per-van confirm button for ops (monitor only) | X-ray confirm is checker-only (Lane C) | `record_van_xray` is `confirm_xray`-gated; ops lacks it | | |

#### Route closure
- [ ] Operations lands on `/admin/job-orders` and sees only its actions
- [ ] Accept moves the order to processing via the stage-gated RPC
- [ ] RPS assessment (none / per-move) computes and feeds the release gate

#### Lane closeout
- [ ] Operations accept + RPS assessment coherent end-to-end

---

## Lane C — Checker: per-van X-ray confirmation + e-signature

### Route C — Confirm each container van's X-ray entry

**Objective:** The checker (lands on `/admin/checker`) confirms **each container van** entered the X-ray division (one button + confirm modal), recording an **e-signature** (name + time). BOC performs the actual X-ray. When the last van is confirmed it rolls up to the X-ray service completion.
**Start state:** Signed in as `st03check`, a `processing` JO with multiple X-ray container lines.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | `/admin/checker` | Sign in as checker → observe landing | checker user | `RoleLanding` | lands on **X-ray Checker**; queue sorted by Priority; Now-serving strip | nav shows ONLY checker tabs (read-only Job Orders · Checker · Manual) | checker cannot accept/hold/reject/edit (URL + control gating) | | |
| C-2 | `/admin/checker` | Look up / open a JO; observe its container vans | open X-ray JO | select lines | each van shows **NOT CLEARED · X-ray pending** | per-van list renders all containers | — | | |
| C-3 | `/admin/checker` | Tap **Confirm X-ray entry** on van #1 → confirm modal → confirm | `confirm_xray` gate | `record_van_xray` | van #1 stamped `xray_done_at/by`; **e-signature** = the checker's snapshot name + time | row flips to CLEARED · timestamp; signature shown | only `confirm_xray` (checker) may confirm; modal prevents accidental taps | | |
| C-4 | `/admin/checker` | Confirm the remaining vans | other vans pending | `record_van_xray` | last van → X-ray service rolls up to **done** | service-done event in History; JO leaves the checker queue | partial confirm leaves the JO in queue until all vans done | | |
| C-5 | `/admin/checker` | (Future / out of scope) GUARD gate-scan on entry | — | — | **N/A — gate-in/gate-out module not built (deferred)** | — | mark future; do not block this lane | **N/A — future** | gate-scan module deferred |

#### Route closure
- [ ] Checker lands on `/admin/checker` and is confirm-only (no accept/edit)
- [ ] Each van is confirmed individually with an e-signature (name + time)
- [ ] Last van rolls up to the X-ray service completion

#### Lane closeout
- [ ] Per-van X-ray + e-signature coherent end-to-end

---

## Lane D — Payments: online proof + cashier confirm + walk-in

### Route D — Customer uploads proof; cashier confirms or records a walk-in

**Objective:** A customer pays the **base** charge by uploading a proof on `/job-order/:id/pay`; the cashier (lands on `/admin/cashier`) reviews/confirms or rejects, and can record a **walk-in / office** payment directly.
**Start state:** A processing JO with a computed total; signed in as the test customer, then as `st03cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | `/job-order/:id/pay` (customer) | Open the pay page; review computed total + bank/GCash + QR | rates + payment details set | compute from `service_rates` | Total = X-ray (rate×vans + 12% VAT) + flat admin + print fees; RPS shown as a separate section if assessed | QR image + bank/GCash render; balance due shown | amounts match Settings; flat fees not VATed | | |
| D-2 | `/job-order/:id/pay` | Upload a payment slip (try a >5 MB image) | pay page open | storage `payment-slips/{uid}/…` + `payment_status='submitted'` | slip stored (auto-compressed <5 MB); status → **submitted** | cashier queue shows "Payment proof to review"; `review_payments` staff bell fires | per-user storage RLS on the slip | | |
| D-3 | `/admin/cashier` (cashier) | Sign in as cashier → observe landing + payment queue | cashier user | `RoleLanding` | lands on **Cashier**; the submitted proof is listed | nav shows ONLY cashier tabs | cashier cannot approve/accept beyond its gates | | |
| D-4 | `/admin/cashier` | Open the slip modal → **Reject** with a note | proof submitted | `review_payment` RPC | status → rejected; customer can re-upload | payment-rejected bell/email links to the pay page | only `review_payments` may decide | | |
| D-5 | `/admin/cashier` | Re-uploaded proof → **Confirm** | proof re-submitted | `review_payment` RPC | base `payment_status='confirmed'` | customer pay page shows confirmed; balance drops | confirm is idempotent (no double-credit) | | |
| D-6 | `/admin/cashier` | On a **different** JO, **record a walk-in / office payment** directly | cashier user | walk-in payment RPC | base payment confirmed without a customer upload | History notes the cashier as the recorder | walk-in path is cashier-gated | | |

#### Route closure
- [ ] Pay page computes the correct total (X-ray + VAT + flat fees, + RPS section if assessed)
- [ ] Online proof → cashier reject (note) → re-upload → confirm works
- [ ] Cashier can record a walk-in / office payment directly

#### Lane closeout
- [ ] Payments (online proof + cashier confirm + walk-in) coherent end-to-end

---

## Lane E — Two-gate completion

### Route E — An order completes only when every gate is met

**Objective:** A JO reaches **completed** only when **all services done AND base payment confirmed AND (RPS not needed OR RPS paid) AND every additional charge paid** — verified by withholding one gate at a time.
**Start state:** A processing JO with X-ray vans + base payment + (from Lane B) an RPS-needed assessment.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | `/admin/checker` | Finish all X-ray vans but leave base payment unpaid | services not all paid | `record_service_done` / `jo_ready_to_complete` | JO stays **processing** (services done, payment not) | no "completed" stamp; not "Cleared for release" | completion is blocked while a gate is open | | |
| E-2 | `/admin/cashier` | Confirm the **base** payment but leave RPS unpaid | RPS = needed | `complete_on_payment_confirmed` trigger | still **processing** — RPS gate open | balance shows the RPS remainder | base-paid alone does not complete an RPS order | | |
| E-3 | `/job-order/:id/pay` + `/admin/cashier` | Customer uploads the **RPS** slip → cashier **Confirm RPS** | RPS slip submitted | RPS payment RPC | last gate closes → JO auto-**completed**; `completed_at` set | "Cleared for release" badge; completed bell/email | the trigger completes only when the final gate lands | | |
| E-4 | `/verify/:id` | Open the public verify page | order completed + paid | `verify` read | shows **✓ PAID** + status **Completed** | matches the two-gate state (PAID requires base + RPS-if-needed) | a not-fully-paid order shows **⚠ NOT PAID · not cleared for release** | | |

#### Route closure
- [ ] Withholding any single gate (service / base pay / RPS pay) blocks completion
- [ ] Closing the final gate auto-completes the order and stamps `completed_at`
- [ ] Verify page reflects PAID + completed only when all gates are met

#### Lane closeout
- [ ] Two-gate completion coherent end-to-end

---

## Lane F — Additional-charge supplement → under review → pay → re-complete

### Route F — Operations adds a charge on a completed order; it re-completes after payment

**Objective:** Operations adds a charge (`JO-####-A/B/C`) → the order reverts to **under review** → the customer pays it on the Payment page → the cashier confirms it → the order **auto-re-completes**. It surfaces to the customer via the bell + ⏳ chip + the Needs-action filter.
**Start state:** A **completed** JO from Lane E; signed in as `st03ops`, then the test customer, then `st03cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | `/admin/job-orders` (ops) | On the completed JO, **＋ Add charge** (label + amount) | `process_job_orders` (ops/admin/owner) | `add_supplement` | a `jo_supplements` row `JO-####-A` (unpaid); order reverts to **processing**, `completed_at` cleared | "Under review" chip on the admin row | only process-gated roles can add a charge | | |
| F-2 | `/job-orders` + `/job-order/:id/pay` (customer) | Customer sees the supplement via bell + **⏳** chip + **Needs-action** filter; opens the pay page | supplement added | `jo_timeline` / notifications | the supplement appears as its own PaySection with its amount | "Under review" banner on the Payment page; ⏳ on the order row | customer can pay the supplement separately | | |
| F-3 | `/job-order/:id/pay` | Upload the supplement payment proof | supplement unpaid | `submit_supplement_proof` | supplement `payment_status='submitted'` | cashier "Additional charges" section lists it | proof scoped to this supplement only | | |
| F-4 | `/admin/cashier` (cashier) | In the **Additional charges** section, **Confirm** the supplement | proof submitted | `review_supplement_payment` / `record_supplement_office_payment` | supplement confirmed; last open gate closes → order **auto-re-completes** | "Under review" chip clears; completed stamp returns | release now needs base + RPS + **every** supplement paid | | |

#### Route closure
- [ ] Adding a charge reverts a completed order to under review and clears `completed_at`
- [ ] Customer pays the supplement as its own section; it surfaces via bell + ⏳ + Needs-action
- [ ] Confirming the last supplement auto-re-completes the order

#### Lane closeout
- [ ] Additional-charge supplement loop coherent end-to-end

---

## Lane G — Staff edit details

### Route G — Cashier / operations / CSR can correct a JO header; checker cannot

**Objective:** Cashier, operations, and CSR can correct a JO's entry / vessel / voyage via **Edit details** (header-only); the checker has no such control.
**Start state:** An existing JO; signed in as `st03cash` (or ops/CSR), then `st03check`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | `/admin/job-orders` (cashier/ops/CSR) | Click **✎ Edit details**; change entry / vessel / voyage; save | `process_job_orders OR review_payments OR manage_support` | `staff_edit_job_order` | header fields updated (UPPERCASE), lines untouched; History notes the edit + actor | inline edit form; row refreshes | edit is header-only (cannot change status / lines) | | |
| G-2 | `/admin/checker` (checker) | Look for an Edit-details control | checker user | — | **no Edit-details control** for checker | confirm absence in the UI | `staff_edit_job_order` denies the checker role | | |

#### Route closure
- [ ] Cashier/operations/CSR can edit entry/vessel/voyage (header-only)
- [ ] Checker cannot edit details (no control + RPC denial)

#### Lane closeout
- [ ] Staff edit details coherent end-to-end

---

## Lane H — Comment escalation + CSR support ticket

### Route H — Internal staff note, complaint flag, and a CSR-handled support ticket

**Objective:** Staff can post an **internal (staff-only)** note and **flag** a comment as a complaint; customers never see staff-only rows. Separately, a customer raises a **support ticket** that the CSR (lands on `/admin/support`) answers.
**Start state:** An existing JO with a customer comment; signed in as staff, then the test customer, then `st03csr`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| H-1 | `/admin/job-orders` (staff) | On the JO timeline, post an **internal note** (staff-only checkbox) | staff session | `add_jo_staff_note` | `job_order_events` row `visibility='staff_only'` | the note shows to staff with a staff-only marker | `jo_timeline` hides staff_only rows from the customer | | |
| H-2 | `/admin/job-orders` (staff) | **Flag** a customer comment as a complaint | a comment exists | `flag_jo_comment` | the row is `flagged`; surfaces in the timeline for staff | flag indicator visible to staff | flag is staff-only metadata | | |
| H-3 | `/job-orders` (customer) | Open the same JO timeline | customer session | `jo_timeline` (customer) | the internal note is **absent**; public comments visible | no staff-only leakage | customer never sees `staff_only` rows | | |
| H-4 | `/support` (customer) | Open a **support ticket** (subject + message) | customer session | `open_ticket` / `post_ticket_message` | a `support_tickets` thread (5-open cap); "talk to an agent" deep links carry the ticket ref | `manage_support` staff bell fires | cap blocks a 6th open ticket | | |
| H-5 | `/admin/support` (CSR) | Sign in as CSR → observe landing → reply to the ticket | csr user (`manage_support`) | `post_ticket_message` | lands on **Support**; reply posts; customer gets a bell on the reply | nav shows ONLY CSR tabs (support + file, no status controls) | CSR cannot change order status anywhere | | |

#### Route closure
- [ ] Internal staff notes + complaint flags stay staff-only (no customer leakage)
- [ ] Customer can open a support ticket (capped); CSR answers it from `/admin/support`
- [ ] CSR has no order-status powers

#### Lane closeout
- [ ] Comment escalation + CSR support coherent end-to-end

---

## Lane I — Print slip + verify-QR (PENDING then COMPLETED, container cross-check)

### Route I — Printable slip watermark + public verify page

**Objective:** The printed slip shows a **PENDING** watermark before completion and **COMPLETED** after, plus a **QR** to the public `/verify/:id` page that confirms PAID / NOT-PAID + status + a **container cross-check** with no login.
**Start state:** A JO that is pre-completion, and (later) the same JO once completed + paid.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| I-1 | `/job-order/:id/print` | Open the printable slip on a **pre-completion** JO | order not completed | render | slip shows the **PENDING** watermark; QR encodes `/verify/:id` | print dialog opens; JO number + containers printed | printing is owner/admin-gated where applicable | | |
| I-2 | `/verify/:id` | Scan/open the QR while the order is unpaid | logged out | `verify` read | shows **⚠ NOT PAID** + status + "not cleared for release" | no login required; containers listed for cross-check | the public read exposes only the verify fields (no PII dump) | | |
| I-3 | `/verify/:id` | Cross-check the listed container numbers against the slip / physical vans | — | — | the page lists the JO's container numbers to match against the paper | "Check this against the paper" guidance; genuine only at portal.ktcterminal.com | a wrong/unknown id shows **⚠ NOT FOUND** | | |
| I-4 | `/job-order/:id/print` + `/verify/:id` | After Lane E completes + pays the JO, reprint + re-open verify | order completed + paid | render / `verify` read | slip now shows **COMPLETED**; verify shows **✓ PAID** + Completed | watermark + verify flip together | PAID requires base + RPS-if-needed (matches the gate) | | |

#### Route closure
- [ ] Slip watermark is PENDING pre-completion and COMPLETED after
- [ ] Public verify page confirms PAID/NOT-PAID + status with no login
- [ ] Container cross-check is present; unknown id → NOT FOUND

#### Lane closeout
- [ ] Print slip + verify-QR coherent end-to-end

---

## Lane J — Roles & gates: each role lands right and sees only its actions

### Route J — Create staff, verify landings, and the permission matrix

**Objective:** The owner creates each staff role; each lands on its correct page and sees only its permitted actions; the Roles & Gates editor toggles access **server-side** (not just hidden).
**Start state:** Owner on `/admin/settings`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| J-1 | `/admin/settings` | Create `st03ops` / `st03cash` / `st03check` / `st03csr` with their roles | owner session | `create_staff` | each appears with a role badge | staff list refreshes | staff creation is owner-only (RPC denies non-owner) | | |
| J-2 | `/login` → `/` | Sign in as each role; observe the landing | role users | `RoleLanding` | **operations → `/admin/job-orders`** · **cashier → `/admin/cashier`** · **checker → `/admin/checker`** · **csr → `/admin/support`** · admin/owner → `/admin` | bottom-tab nav shows only that role's tabs | a role can't deep-link into a tab it lacks (URL bounce / empty) | | |
| J-3 | `/admin/settings` → Roles & Gates | Confirm the matrix: ops = accept/complete/hold-reject + assess_rps (no confirm_xray, no money); checker = confirm_xray only; cashier = review_payments + complete/hold-reject; csr = file + manage_support only | owner session | role-permission matrix | columns match the intended gates | the CSR column has no status powers; checker has no edit | matrix is the source of truth | | |
| J-4 | `/admin/settings` | Toggle a gate OFF (e.g. cashier `review_payments`) → cashier reloads | owner session | update matrix | the cashier's payment actions disappear **server-side** (RPC denies, queue empty) — then toggle back | not just hidden in the UI | server enforces the revoked gate | | |
| J-5 | `/admin/settings` | Owner: reset a staff password from Settings | owner session | reset RPC / admin link | the new password works on next login | copyable set-password link (no email) available on `/admin/customers/:id` | reset path refuses the owner account | | |

#### Route closure
- [ ] Each role lands on its correct page and sees only its tabs/actions
- [ ] The Roles & Gates matrix matches the intended split (CSR no status, checker confirm-only, ops no money)
- [ ] Toggling a gate enforces server-side, not just in the UI

#### Lane closeout
- [ ] Roles & gates coherent end-to-end

---

## Lane K — Owner / security basics

### Route K — Invite-only staff, single session, idle logout, owner failsafe

**Objective:** Confirm the launch-critical access controls still hold: invite-only staff, single-session-per-account, idle auto-logout, and the non-revocable owner failsafe.
**Start state:** Owner signed in; a second browser / private window available.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| K-1 | `/login` | Confirm there is **no admin self-signup** (registration creates only a `pending` customer) | logged out | `handle_new_user` | a new signup is a customer, never staff | staff exist only via owner `create_staff` | invite-only staff enforced | | |
| K-2 | two browsers | Sign the test customer in on browser 1, then browser 2 (single-session) | session A live | `claim_session` / realtime | browser 1 signs out ≤1 min (instant on focus) with "signed in on another device"; the 2FA owner needs the **6-digit verify** to evict | second device unaffected; eviction logged to security events | a password alone (no aal2) does not kick the 2FA session | | |
| K-3 | customer portal | Idle the customer portal ~14 min | session live | `useIdleLogout` | **"Are you still there?"** prompt; ignore 1 more min → signed out ("after 15 minutes") | any activity resets the timer | staff portal = 60-min window | | |
| K-4 | `/admin/settings` | As owner, look at the owner row | owner session | — | **no Revoke** on the owner; owner overrides everything | owner cannot be demoted/locked out | server-only `is_owner` failsafe holds | | |
| K-5 | API / `/admin/*` | Logged out, deep-link `/admin`; as the customer, deep-link `/admin/job-orders` | — | RLS + `AdminRoute` | logged out → `/login`; customer at `/admin/*` → bounced to `/` (no admin data flash) | no PII flash | RLS denies the customer admin data even if the route renders | | |

#### Route closure
- [ ] Staff are invite-only; no admin self-signup
- [ ] Single session evicts the old device; idle auto-logout fires per window
- [ ] Owner failsafe is non-revocable; admin routes are gated for non-staff

#### Lane closeout
- [ ] Owner / security basics coherent end-to-end

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | OPEN | |

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| Preflight (P1–P8) | | | |
| A — Customer file → queue → Priority # | | | |
| B — Operations accept + RPS | | | |
| C — Per-van X-ray + e-signature | | | |
| D — Payments (online + cashier + walk-in) | | | |
| E — Two-gate completion | | | |
| F — Additional-charge supplement loop | | | |
| G — Staff edit details | | | |
| H — Comment escalation + CSR support | | | |
| I — Print slip + verify-QR | | | |
| J — Roles & gates | | | |
| K — Owner / security basics | | | |

**Overall go / no-go:** ____

## Cleanup after run

- Suspend/reject the throwaway customer; revoke `st03ops` / `st03cash` / `st03check` / `st03csr`.
- Remove (or archive) the test JOs and supplements created during the run.
- **Go-live numbering:** delete the test orders/customer and reset `jo_number_seq` / `broker_code_seq` so the first *real* order is `JO-000001` (only safe at zero real orders). Test IDs uploaded during the run can't be manually deleted for 24h (`0053` window) — the 3-day purge clears them regardless.
- Re-toggle any Roles & Gates flag changed in Lane J back to its launch default.
