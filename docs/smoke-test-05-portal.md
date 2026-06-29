# Smoke Test ST05 — Go-live Blind Walkthrough (current build: onboarding · Job Orders · Releases · roles · security)

**Smoke Test ID:** ST05
**Date:** 2026-06-21
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public) — **v1.5.0 / commit `2af1f3e` / DB migrations through `0131`**
**Format:** Canonical (see `docs/smoke-test-template-canonical.md`)
**Supersedes:** **ST03** (it was written at migration `0104`, before the serving-number retirement, the operations/checker X-ray split, and the entire Release / Pull-out module). ST05 is the single end-to-end go-live blind walkthrough on the current build. **ST04** stands alongside as the deep-dive on the Release / Pull-out spine + the no-zero number rules — Lane I here condenses it and points back to ST04 for the per-action detail.

> **Superseded in part by ST06 (2026-06-27).** ST05's *serving-number-retired* premise (daily Batch, no priority number) and its role matrix/landings predate **ADR-0035** (`0170`–`0177`), which **reintroduced an automatic serving-number queue** with **priority** + **re-X-ray** lanes, made completion **automatic**, split **charges** into request→bill, **gated payment** on the ERP invoice, **re-split the roles** (`0171` — cashier money-only, CSR no approval), and **moved staff landings to `/app/*`**. Run **ST06** (`docs/smoke-test-06-portal.md`) for those deltas; ST05 still owns the broad onboarding / X-ray / payments / release walk. Where this doc and ST06 disagree, **ST06 + runtime win.**

> **⚠️ SUPERSEDED IN PART by the v2.0.0 X-ray billing cutover (ADR-0037, migrations `0203`–`0222`).** The old **base / RPS / supplement / service-invoice** billing this doc walks (Lanes **D** payments, **E** two-gate completion, **F** supplements) is **DELETED**, along with the customer **Payment page** (`/job-order/:id/pay`) and the **CashierStation** (`/admin/cashier`, `/app/cashier`). Billing is now the uniform **`charges`** table — the customer pays **per charge, inline** in My Job Orders (`JobOrderCharges` → *Pay this charge*); the cashier collects on the **Payment Order desk** (`/admin/payment-orders`, PWA `/app/payment-orders`) and adds/approves charges via **`/admin/charges`**; a charge confirms only against a **FINAL ERP+BIR invoice**; completion is **one rule** (all services done AND every billed charge confirmed); the **serving number** resets **monthly** as **`YYMM-XXXX`**. **For the current billing / payment / cashier / serving script, run [ST06](smoke-test-06-portal.md).** The **non-billing** lanes here (onboarding, X-ray confirm, roles, release-doc verify, RLS / caps) still apply — but read `/admin/cashier` → `/admin/payment-orders`, `/app/cashier` → `/app/payment-orders`, and `/job-order/:id/pay` → the per-charge *Pay this charge* action.

## Purpose

The pre-go-live **blind walkthrough**: a human walks the live portal end-to-end on the **current** build and proves both operational spines work front-to-back, plus the access controls. Flow:

- **Onboarding → Job Order:** customer registers → confirms email → verify-ID (upload/skip) → pending vs approved → files a JO (held vs submitted) → the order is grouped by **daily Batch** (today / yesterday) with an **admin-only working-hours aging** chip — **no serving / priority number**.
- **Job Order spine:** operations accepts + assesses RPS + monitors the X-ray queue (no confirm) → **checker** confirms each van's X-ray entry (e-signature) → payments (online proof + cashier confirm + walk-in) → **two-gate completion** → additional-charge supplements → staff edit + internal notes/flag + CSR support → printed slip + public verify-QR.
- **Release / Pull-out spine (new, 0124–0131):** customer files (consignee + BL + DO/BL) → CSR verifies docs → release desk sets the charge **once** (additional charges as supplements) → customer pays → cashier confirms → cashier records **BIR OR + ERP control no.** → released; with the no-zero number rules.
- **Roles & gates / owner & security:** each staff role lands right and sees only its actions; the verified permission matrix holds and is server-enforced; invite-only staff, single-session, idle logout, owner failsafe, RLS on admin routes.

Verify frontend **and** backend (the SECURITY DEFINER RPC + its gate) **and** side effects at each click.

> **Current-state corrections vs ST03 (ST03 predates these — do not re-test ST03's retired content):**
> - The **serving / priority number is RETIRED.** Orders are grouped by **daily Batch** (filing day — *today* / *yesterday*) plus an **admin-only working-hours aging** chip (09:00–19:00 Manila). There is **no "Now serving" strip** and no per-JO priority number.
> - The **X-ray Queue is an OPERATIONS view** (`/admin/checker`, retitled "X-ray Queue"), gated by **`view_xray_queue`** (admin / operations / checker / csr = true; **cashier = false**). **`confirm_xray` is CHECKER-only** — the checker is the spotter who confirms each van; operations/CSR/admin can **monitor** but cannot confirm.
> - **Two-gate completion:** a JO is `completed` only when **all services done AND base payment confirmed AND (RPS not needed OR RPS paid+confirmed) AND every supplement confirmed.**
> - **No-zero rules:** all amounts must be **> 0**; unconfigured rates/fees render **"not set" / "—"** (NULL), never **₱0** or **₱NaN**. Copy is now Taglish / plainer English.

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Verified role → permission matrix (ground truth — `docs/diagrams/role-and-operation-flows.md`, live `role_permissions` 2026-06-21)

| Permission | admin | operations | cashier | checker | csr |
|---|:--:|:--:|:--:|:--:|:--:|
| view_job_orders | ✓ | ✓ | ✓ | ✓ | ✓ |
| view_xray_queue | ✓ | ✓ |  | ✓ | ✓ |
| file_job_orders | ✓ |  |  |  | ✓ |
| accept_orders | ✓ | ✓ |  |  |  |
| process_job_orders | ✓ | ✓ |  |  |  |
| complete_orders | ✓ | ✓ | ✓ |  |  |
| hold_reject_orders | ✓ | ✓ | ✓ |  |  |
| confirm_xray |  |  |  | ✓ |  |
| assess_rps | ✓ | ✓ |  |  |  |
| review_payments | ✓ |  | ✓ |  |  |
| record_invoice | ✓ |  | ✓ |  |  |
| verify_release_docs | ✓ |  |  |  | ✓ |
| manage_vessel_schedule | ✓ | ✓ |  |  |  |
| manage_support | ✓ |  |  |  | ✓ |
| manage_approvals / manage_customers / manage_consignees / manage_pricing | ✓ |  |  |  |  |

**Landings:** owner/admin → `/admin` · operations → `/admin/job-orders` · cashier → `/admin/cashier` · checker → `/admin/checker` · csr → `/admin/support` · customer → `/`. **Owner bypasses every gate** (failsafe). The server enforces the **live** matrix — if a gate is re-toggled in Settings → Roles & Gates, the matrix and these lanes change with it.

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | server-only `is_owner`; failsafe; bypasses every gate; never lockable |
| Admin (secondary) | _create via Settings → Staff_ | `jla.ktcport@gmail.com` is **no longer admin** (now a rejected customer) — create a fresh staff admin (everything **except `confirm_xray`**) |
| Test customer | a throwaway email you control (e.g. `you+st05@gmail.com`) | created in Lane A; **must be `approved`** before Lane I (releases reject `pending`) |
| Operations | created in Lane J via Settings | e.g. `st05ops` — accept/process/complete/hold-reject + assess_rps + vessels; **monitors** X-ray (no confirm); no money |
| Cashier | created in Lane J via Settings | e.g. `st05cash` — review_payments + record_invoice + complete/hold-reject; **no X-ray queue**, no release-doc verify |
| Checker | created in Lane J via Settings | e.g. `st05check` — `confirm_xray` ONLY (the X-ray spotter) |
| CSR | created in Lane J via Settings | e.g. `st05csr` — manage_support + file_job_orders + `verify_release_docs` + view X-ray queue (read); never changes JO status, no money |
| Negative role | reuse a checker/cashier, or create `st05neg` | a role with **neither** release gate — proves the release desk is hidden + the RPCs deny |

> **Preconditions to set before the lanes (clears the data gate):**
> - Settings → **Service rates & fees**: X-ray rate + admin + print fees **non-zero**, and **RPS per-move rates** set (so the pay-page total computes). For **Lane F's** no-zero check, leave (or clear) at least **one** rate/fee **unset** to prove "not set" / "—" rendering.
> - Settings → **Payment details**: bank / GCash / account / QR image (to the `payment-qr` bucket) filled — feeds the JO pay page **and** the release "How to pay" / QRPH block.
> - At least one **current vessel** on the schedule (for the JO filing dropdown); a **shipping line + free-days** row.
> - The **test customer must be `approved`** (owner at `/admin/approvals`) before Lane I — the release form is gated on `broker?.status === 'approved'` and `file_release_order` raises otherwise. (Lane A exercises the held-vs-submitted JO path while still pending, then approves.)
> - Emails/bells: per [[emails-suspended-by-default]] customer emails may be **off** (the `0074` switch); when off, confirm the **in-app bell** is the surfaced side effect (the email is the intentionally-suppressed effect, not a defect).
>
> **Go-live numbering note:** prod is meant to start the first *real* JO at `JO-000001` and the first *real* release at `RO-000001`. This run consumes `JO-0000xx` / `BR-0000xx` / `RO-0000xx`; after teardown, delete the test orders/releases/customer and reset the sequences (only safe at zero real rows) — see Cleanup.

---

## Preflight gate (automated — run first)

| Check | Command | Expected | Result |
|---|---|---|---|
| P1 TypeScript | `npx tsc --noEmit` | 0 errors | ✅ **PASS** — 0 errors |
| P2 Build | `npm run build` | PASS | ✅ **PASS** — built clean |
| P3 Deploy health | `curl -s -o /dev/null -w "%{http_code}\n" https://portal.ktcterminal.com` | `200` | ✅ **PASS** — 200 |
| P4 Bundle target | fetch `/assets/index-*.js`, grep | contains `mdlnfhyylvapzdubhyic.supabase.co`; jta-sys ref absent | ✅ **PASS** — only `mdlnfhyylvapzdubhyic.supabase.co` (no jta-sys) |
| P5 SPA rewrite | `curl … /admin/job-orders` · `… /releases` · `… /admin/releases` · `… /verify/test` | `200` (not 404) for all | ✅ **PASS** — all 200 |
| P6 CAPTCHA enforced | tokenless `POST /auth/v1/token?grant_type=password` (anon apikey) | `captcha_failed` | ✅ **PASS** — `"error_code":"captcha_failed"` |
| P7 Migrations applied | release + JO RPCs resolve to the latest defs | `record_release_or(uuid,text,text)` exists; OR validation = "up to 6 digits, non-zero"; `normalize_erp_invoice_no` = OR-INV cash-only; `cancel_release_order` blocks a submitted/confirmed supplement (0131) | ✅ **PASS** — 3-arg sig + 6-digit OR rule + ERP cash-only + 0131 supplement-cancel guard all confirmed. **Re-run 2026-06-23:** `_migrations` now applied **through 0150** (rate matrix `0141` adds `fill`/`kind` to `terminal_rates`; fuel `0135` tables present; `purchaser` role w/ 3 perms `0150`) — all forward of ST05's 0131 baseline |
| P8 Buckets present | `release-docs` (private) + `payment-slips` (private) + `payment-qr` (public) + `valid-ids` (private) exist | per-user folder RLS on the private buckets | ✅ **PASS** — release-docs / payment-slips / valid-ids private (per-user folder), payment-qr public (QR image) |

> **Preflight run 2026-06-21 — all P1–P8 PASS** (v1.5.0, commit `2af1f3e`; migrations through `0131`). The Lane tables below are the manual blind walkthrough, still to be executed. (Adapted from ST04's preflight, which passed on the same build; P5 widened to cover the JO + verify routes too.)
>
> **Preflight RE-RUN 2026-06-23 — all P1–P8 PASS** on the current build (commit `542cc89`; migrations now applied **through 0150** — the build advanced past ST05's 0131 baseline with the container rate matrix `0141`, fuel Phase 0 `0135`/`0140`/`0150`, and the consignee/vessel request loop `0132`/`0137`–`0139`). P3–P6 verified over HTTPS against the live deploy; P7/P8 verified read-only via the Supabase Management API against the KTC project. The frontend bundle is byte-identical to the 06-21 run (`index-BrOMFaiS.js`) because the intervening commits touch only DB + docs, not `src/`. **Lanes A–K still to be executed.** New **Lane L** (below) covers the `0141` rate-matrix calculator/tariff redesign that postdates the original draft.

If any preflight check fails, pause and fix first.

---

## Lane A — Customer onboarding + file a Job Order (Batch + aging, NOT a serving number)

### Route A — Register → confirm → verify-ID → pending (held) → approved (submitted) → Batch/aging + caps

**Objective:** A customer registers, is onboarded (confirm email → verify-ID or skip), files a JO **while pending** (saved as **held**, queue-hidden), is approved (held flips to **submitted** with `JO-######`), and the order is grouped by **daily Batch** (today/yesterday) with an **admin-only working-hours aging** chip — **no serving / priority number anywhere**. Order caps hold.
**Start state:** Logged out.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| A-1 | `/login` | (optional) pick 🌐 EN/FIL, then Register: name + contact + email + pw; scroll-to-agree + 2 consent ticks; CAPTCHA; Sign up | logged out | `auth.signUp` + `handle_new_user` | auth user + `customers` row `status='pending'`; branded confirmation email queued | consent tick disabled until scrolled; Sign up disabled until both ticked; "1 email = 1 account" blocks a re-used email | a duplicate email is refused at signup; tokenless signup hits `captcha_failed` | | |
| A-2 | email → `/verify-id` | Confirm email → sign in → first-run **language chooser** → **Quick tour** → upload valid ID (or **Skip to portal**) | confirmed session | storage `valid-ids/{uid}/…` + `valid_id_path` | lands signed-in; tour runs once per browser in the chosen language; ID stored (or skipped) | language gate fires before the tour; tour does not re-fire on reload; Skip still lands in the portal | an **unconfirmed** session is blocked at `ProtectedRoute` ("Awaiting email confirmation") | | |
| A-3 | `/job-order` (pending) | File a JO: typeahead-pick a consignee, enter **Entry (C-) number** (required, UPPERCASE), pick **Vessel & Voyage** from the dropdown (or "not listed" → manual), add X-ray container line(s) | pending customer | insert `job_orders` + `job_order_lines` | saved as **held** ("Draft — no number yet"); **no number, no batch shown yet** | Entry gates Next/submit; vessel dropdown lists only **current** vessels; manual escape hatch raises a pending-vessel request | held order is **hidden from the admin queue**; pending-broker held cap = **10** (11th blocked "contact admin") | | |
| A-4 | `/admin/approvals` (owner) | Approve the test customer | owner session | `status='approved'`; `release_held_job_orders` trigger | the held order flips to **submitted** + gets `JO-######` | account-approved bell + email (or bell only if emails off) | only `manage_approvals` (admin/owner) can approve | | |
| A-5 | `/job-orders` (customer) | Open My Job Orders | approved | select own orders (RLS) | the order shows its `JO-######` and is grouped under its **Batch** (e.g. "Today") — **no priority/serving number** | Active default; Needs-action / Completed / Closed filters switch server-side; **no "Now serving" strip anywhere** | customer sees only own orders (RLS) | | |
| A-6 | `/admin/job-orders` (owner/ops) | Open the admin queue and inspect the same order | staff session | queue read | the order sits in its **Batch** group (Today / Yesterday) with an **admin-only aging chip** (working-hours, 09:00–19:00 Manila) | the aging chip is **staff-only** (never shown to the customer); batch grouping, not a serving number | the **customer** view shows no aging chip and no serving number | | |
| A-7 | `/job-orders` | File a 2nd JO via **Bulk paste** (3+ containers), then **cancel** it (confirm prompt) | approved | insert lines / `cancel_job_order` | one line per container (dups skipped); cancel → **cancelled** | cancelled order leaves Active; **no number is "burned/recycled"** (no serving-number bookkeeping anymore) | approved-broker open cap = **10** (`submitted`+`processing`); 11th blocked | | |

#### Route closure
- [ ] Onboarding (register → confirm → verify-ID/skip → tour) coherent on the current build
- [ ] Pending customer files a **held** (queue-hidden) JO; approval releases it to **submitted** with `JO-######`
- [ ] Orders are grouped by **daily Batch** + an **admin-only working-hours aging** chip — **no serving / priority number**; caps (10 held / 10 open) hold

#### Lane closeout
- [ ] Customer onboarding + file JO (Batch/aging, not serving number) coherent end-to-end

---

## Lane B — Operations: accept order + assess RPS + monitor X-ray (no confirm)

### Route B — Stage-gated acceptance, RPS assessment, and X-ray monitor-only

**Objective:** Operations (lands on `/admin/job-orders`) can **accept** a JO (→ processing) and **assess RPS** (none / per-move), which feeds the release gate; operations can **view the X-ray queue** (`view_xray_queue`) but has **no confirm button** (`confirm_xray` is checker-only).
**Start state:** Signed in as `st05ops` (created in Lane J), an approved customer JO in `submitted`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| B-1 | `/admin/job-orders` | Sign in as operations → observe landing + queue | ops user | `RoleLanding` | lands on **Job Orders**; queue visible, grouped by Batch + aging | nav shows ONLY ops tabs (Job Orders · X-ray Queue · Vessels · Manual — no Approvals/Customers/Consignees/Settings/Cashier) | ops cannot reach owner-only routes (URL bounce, no data flash) | | |
| B-2 | `/admin/job-orders` | **Accept** the submitted JO | `accept_orders` | `staff_transition_order` / accept RPC | status → **processing**; History logs the actor | chip + History entry; queue refreshes | a role without `accept_orders` (cashier/checker/csr) cannot accept (RPC denies) | | |
| B-3 | `/admin/job-orders` | **Assess RPS → "No RPS needed"** on one JO | `assess_rps` | RPS RPC | **No RPS** chip; customer total unchanged | chip on admin + customer rows | non-`assess_rps` roles (cashier/checker/csr) cannot assess RPS | | |
| B-4 | `/admin/job-orders` | **Assess RPS → enter moves** (e.g. Trucking 6) + optional doc → Save on a 2nd JO | RPS per-move rates set | RPS RPC (per-move) | **RPS needed** chip; per-move charge computed from the configured rates; `rps` bell fires | the customer pay page later shows a separate RPS section + balance | the RPS amount uses the configured per-move rates (no ₱0 if a rate is unset → "—") | | |
| B-5 | `/admin/checker` (ops monitor) | Open the **X-ray Queue** as operations; open a JO's vans | `view_xray_queue` (ops=true) | queue read | the queue renders (read/monitor); each van shows **NOT CLEARED · X-ray pending** | **no per-van Confirm button** for ops (monitor only) | `record_van_xray` is `confirm_xray`-gated; ops lacks it → forced call denies | | |

#### Route closure
- [ ] Operations lands on `/admin/job-orders` and sees only its actions
- [ ] Accept moves the order to processing via the stage-gated RPC (gate-denied for non-`accept_orders`)
- [ ] RPS assessment (none / per-move) computes and feeds the release gate
- [ ] Operations can **monitor** the X-ray queue (`view_xray_queue`) but has **no confirm** (no `confirm_xray`)

#### Lane closeout
- [ ] Operations accept + RPS + X-ray monitor (no confirm) coherent end-to-end

---

## Lane C — Checker: per-van X-ray confirmation + e-signature

### Route C — Confirm each container van's X-ray entry (checker-only spotter)

**Objective:** The checker (lands on `/admin/checker`) confirms **each container van** entered the X-ray division (one button + confirm modal), recording an **e-signature** (snapshot name + time). BOC performs the actual X-ray; the checker is the spotter. When the last van is confirmed the X-ray service rolls up to done (and may auto-complete if paid).
**Start state:** Signed in as `st05check`, a `processing` JO with multiple X-ray container lines.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | `/admin/checker` | Sign in as checker → observe landing | checker user | `RoleLanding` | lands on **X-ray Queue**; vans grouped by JO no. / age | nav shows ONLY checker tabs (read-only Job Orders · X-ray Queue · Manual) | checker cannot accept/hold/reject/edit/complete (control gating + URL bounce) | | |
| C-2 | `/admin/checker` | Open a JO; observe its container vans | open X-ray JO | select lines | each van shows **NOT CLEARED · X-ray pending** | per-van list renders all containers | — | | |
| C-3 | `/admin/checker` | Tap **Confirm X-ray entry** on van #1 → confirm modal → confirm | `confirm_xray` (checker) | `record_van_xray` | van #1 stamped `xray_done_at/by`; **e-signature** = checker's snapshot name + time | row flips to CLEARED · timestamp; signature shown | only `confirm_xray` (checker) may confirm — admin/ops/csr cannot, even though they can view the queue; modal prevents accidental taps | | |
| C-4 | `/admin/checker` | Confirm the remaining vans | other vans pending | `record_van_xray` | last van → X-ray service rolls up to **done** | service-done event in History; JO leaves the checker queue | a **partial** confirm leaves the JO in the queue until all vans are done | | |
| C-5 | `/admin/checker` | (Future / out of scope) GUARD gate-scan on entry | — | — | **N/A — gate-in/gate-out (gate-scan) module not built (deferred)** | — | mark future; do not block this lane | **N/A — future** | gate-scan module deferred (ADR-0022) |

#### Route closure
- [ ] Checker lands on `/admin/checker` and is confirm-only (no accept/edit/complete)
- [ ] Each van is confirmed individually with an e-signature (name + time); only `confirm_xray` may confirm (view ≠ confirm)
- [ ] Last van rolls up to the X-ray service completion

#### Lane closeout
- [ ] Per-van X-ray + e-signature coherent end-to-end

---

## Lane D — Payments: online proof + cashier confirm/reject + walk-in (base + RPS)

### Route D — Customer uploads proof; cashier confirms/rejects or records a walk-in

**Objective:** A customer pays the **base** charge by uploading a proof on `/job-order/:id/pay`; the cashier (lands on `/admin/cashier`) reviews/confirms or rejects (note → re-upload), and can record a **walk-in / office** payment directly (`record_office_payment`). RPS is paid as its own section.
**Start state:** A processing JO with a computed total (and from Lane B an RPS-needed assessment on a 2nd JO); signed in as the test customer, then as `st05cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| D-1 | `/job-order/:id/pay` (customer) | Open the pay page; review computed total + bank/GCash + QR | rates + payment details set | compute from `service_rates` (`src/lib/pricing.ts`) | Total = X-ray (rate×vans + 12% VAT) + flat admin + print fees; RPS shown as a **separate section** if assessed | QR image + bank/GCash render; balance due shown; flat fees are **not** VATed | amounts match Settings; an **unset** rate renders **"—"** (never ₱0 / ₱NaN) and is excluded from the total | | |
| D-2 | `/job-order/:id/pay` | Upload a payment slip (try a >5 MB image) | pay page open | storage `payment-slips/{uid}/…` + `payment_status='submitted'` | slip stored (auto-compressed < 5 MB); base `payment_status='submitted'` | cashier queue shows "Payment proof to review"; `review_payments` staff bell fires | proof scoped to the customer's own folder (storage RLS `(foldername)[1]=uid`) | | |
| D-3 | `/admin/cashier` (cashier) | Sign in as cashier → observe landing + payment queue | cashier user | `RoleLanding` | lands on **Cashier**; the submitted proof is listed | nav shows ONLY cashier tabs; **no X-ray Queue tab** (cashier lacks `view_xray_queue`) | cashier cannot accept/assess-RPS/confirm-X-ray (gates absent) | | |
| D-4 | `/admin/cashier` | Open the slip modal → **Reject** with a note | proof submitted | `review_payment` RPC (`review_payments`) | base `payment_status='rejected'`; customer can re-upload | payment-rejected bell/email links back to the pay page; reject requires a non-empty note | only `review_payments` may decide (ops/checker/csr denied) | | |
| D-5 | `/admin/cashier` | Re-uploaded proof → **Confirm** | proof re-submitted | `review_payment` RPC | base `payment_status='confirmed'` | customer pay page shows confirmed; balance drops | confirm is idempotent (no double-credit); fires only on a `submitted` proof | | |
| D-6 | `/admin/cashier` | On a **different** JO, **record a walk-in / office payment** directly | cashier user | `record_office_payment` | base payment confirmed without a customer upload | History notes the cashier as the recorder | the walk-in path is `review_payments`-gated | | |
| D-7 | `/job-order/:id/pay` + `/admin/cashier` | On the RPS-needed JO, customer uploads the **RPS** slip → cashier **Confirm RPS** | RPS assessed (Lane B-4) | RPS payment RPC + `review_payment` | RPS `payment_status='confirmed'`; the RPS section clears | the RPS balance drops to zero; this feeds the two-gate (Lane E) | RPS is paid/confirmed as its own section, separate from the base | | |

#### Route closure
- [ ] Pay page computes the correct total (X-ray + VAT + flat fees, + RPS section if assessed); unset rates render "—", never ₱0
- [ ] Online proof → cashier reject (note) → re-upload → confirm works; confirm is idempotent and `review_payments`-gated
- [ ] Cashier can record a walk-in / office payment (`record_office_payment`); RPS is paid + confirmed as its own section

#### Lane closeout
- [ ] Payments (online proof + cashier confirm/reject + walk-in, base + RPS) coherent end-to-end

---

## Lane E — Two-gate completion

### Route E — A JO completes only when every gate is met

**Objective:** A JO reaches **completed** only when **all services done AND base payment confirmed AND (RPS not needed OR RPS paid+confirmed) AND every supplement confirmed** — verified by withholding one gate at a time; closing the last gate **auto-completes**.
**Start state:** The RPS-needed JO from Lanes B/D, with X-ray vans confirmable in Lane C.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| E-1 | `/admin/checker` | Finish all X-ray vans but leave the base payment unpaid | services not all paid | `record_van_xray` / `jo_ready_to_complete` | JO stays **processing** (services done, payment open) | no "completed" stamp; not "Cleared for release" | completion is blocked while any gate is open | | |
| E-2 | `/admin/cashier` | Confirm the **base** payment but leave RPS unpaid | RPS = needed | `complete_on_payment_confirmed` trigger | still **processing** — RPS gate open | balance shows the RPS remainder | base-paid alone does not complete an RPS order | | |
| E-3 | `/job-order/:id/pay` + `/admin/cashier` | Customer uploads the **RPS** slip → cashier **Confirm RPS** (closes the last gate) | RPS slip submitted | RPS payment RPC + trigger | last gate closes → JO **auto-completed**; `completed_at` stamped | "Cleared for release" badge; completed bell/email | the `enforce_two_gate_complete` backstop completes only when the final gate lands | | |
| E-4 | `/verify/:id` | Open the public verify page | order completed + paid | `verify` read | shows **✓ PAID** + status **Completed** | matches the two-gate state (PAID requires base + RPS-if-needed + every supplement) | a not-fully-paid order shows **⚠ NOT PAID · not cleared for release** | | |

#### Route closure
- [ ] Withholding any single gate (service / base pay / RPS pay) blocks completion
- [ ] Closing the final gate auto-completes the order and stamps `completed_at`
- [ ] Verify page reflects PAID + completed only when **all** gates are met

#### Lane closeout
- [ ] Two-gate completion coherent end-to-end

---

## Lane F — JO additional-charge supplement → under review → pay → re-complete

### Route F — Operations adds a charge (>0) on a completed JO; it re-completes after payment

**Objective:** Operations adds a charge (`JO-####-A/B/C`, amount **> 0**) → the completed JO reverts to **processing** (under review), `completed_at` cleared → the customer pays it on the Payment page → the cashier confirms it → the JO **auto-re-completes**. It surfaces to the customer via the bell + ⏳ chip + the Needs-action filter.
**Start state:** A **completed** JO from Lane E; signed in as `st05ops`, then the test customer, then `st05cash`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| F-1 | `/admin/job-orders` (ops) | On the completed JO, **＋ Add charge** (label + amount, e.g. "Demurrage" / 1500) | `process_job_orders` (ops/admin/owner) | `add_supplement` | a `jo_supplements` row `JO-####-A` (unpaid); order reverts to **processing**, `completed_at` cleared | "Under review" chip on the admin row | only process-gated roles can add a charge; a **zero/negative** amount is rejected | | |
| F-2 | `/job-orders` + `/job-order/:id/pay` (customer) | Customer sees the supplement via bell + **⏳** chip + **Needs-action** filter; opens the pay page | supplement added | `jo_timeline` / notifications | the supplement appears as its own PaySection with its amount | "Under review" banner on the Payment page; ⏳ on the order row | the customer can pay the supplement separately | | |
| F-3 | `/job-order/:id/pay` | Upload the supplement payment proof | supplement unpaid | `submit_supplement_proof` | supplement `payment_status='submitted'` | the cashier "Additional charges" section lists it | proof scoped to this supplement only | | |
| F-4 | `/admin/cashier` (cashier) | In the **Additional charges** section, **Confirm** the supplement | proof submitted | `review_supplement_payment` / `record_supplement_office_payment` | supplement confirmed; the last open gate closes → JO **auto-re-completes** | "Under review" chip clears; the completed stamp returns | completion now needs base + RPS + **every** supplement confirmed | | |

#### Route closure
- [ ] Adding a charge (> 0) reverts a completed JO to under review and clears `completed_at`
- [ ] Customer pays the supplement as its own section; it surfaces via bell + ⏳ + Needs-action
- [ ] Confirming the last supplement auto-re-completes the JO

#### Lane closeout
- [ ] JO additional-charge supplement loop coherent end-to-end

---

## Lane G — Staff edit (header-only) + internal notes/flag + CSR support

### Route G — Header-only staff edit; staff-only notes/flags; CSR-handled support ticket

**Objective:** Operations / cashier / CSR can correct a JO header (entry / vessel / voyage) via **Edit details** (header-only; the checker cannot); staff can post an **internal (staff-only)** note and **flag** a comment as a complaint (never visible to the customer); a customer raises a **support ticket** that the **CSR** (lands on `/admin/support`) answers — without any order-status power.
**Start state:** An existing JO with a customer comment; signed in as `st05cash` (or ops/CSR), then `st05check`, then the customer, then `st05csr`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| G-1 | `/admin/job-orders` (cashier/ops/CSR) | Click **✎ Edit details**; change entry / vessel / voyage; save | `process_job_orders OR review_payments OR manage_support` | `staff_edit_job_order` | header fields updated (UPPERCASE), lines + status untouched; History notes the edit + actor | inline edit form; row refreshes | edit is **header-only** (cannot change status / lines) | | |
| G-2 | `/admin/checker` (checker) | Look for an Edit-details control | checker user | — | **no Edit-details control** for the checker | confirm absence in the UI | `staff_edit_job_order` denies the checker role (forced call) | | |
| G-3 | `/admin/job-orders` (staff) | On the JO timeline, post an **internal note** (staff-only) | staff session | `add_jo_staff_note` | `job_order_events` row `visibility='staff_only'` | the note shows to staff with a staff-only marker | `jo_timeline` hides staff-only rows from the customer | | |
| G-4 | `/admin/job-orders` (staff) | **Flag** a customer comment as a complaint | a comment exists | `flag_jo_comment` | the row is `flagged`; surfaces to staff | flag indicator visible to staff only | flag is staff-only metadata | | |
| G-5 | `/job-orders` (customer) | Open the same JO timeline | customer session | `jo_timeline` (customer) | the internal note + flag are **absent**; public comments visible | no staff-only leakage | the customer never sees `staff_only` rows | | |
| G-6 | `/support` (customer) | Open a **support ticket** (subject + message) | customer session | `open_ticket` / `post_ticket_message` | a `support_tickets` thread (open cap enforced); "talk to an agent" deep links carry the ticket ref | `manage_support` staff bell fires | the open-ticket cap blocks an over-cap ticket | | |
| G-7 | `/admin/support` (CSR) | Sign in as CSR → observe landing → reply to the ticket → close it | csr user (`manage_support`) | `post_ticket_message` / close | lands on **Support**; reply posts; closing **locks** the ticket; customer gets a bell | nav shows ONLY CSR tabs (Support · file-on-behalf · Releases-docs · read X-ray queue — **no status controls**) | CSR cannot change order status anywhere (no accept/hold/reject/complete) | | |

#### Route closure
- [ ] Operations/cashier/CSR can edit entry/vessel/voyage (header-only); the checker cannot (control + RPC denial)
- [ ] Internal staff notes + complaint flags stay staff-only (no customer leakage)
- [ ] Customer can open a (capped) support ticket; CSR answers from `/admin/support` with **no** order-status power

#### Lane closeout
- [ ] Staff edit + internal notes/flag + CSR support coherent end-to-end

---

## Lane H — Print slip + public verify-QR (PENDING then COMPLETED, container cross-check)

### Route H — Printable slip watermark + login-free public verify page

**Objective:** The printed slip shows a **PENDING** watermark before completion and **COMPLETED** after, plus a **QR** to the public `/verify/:id` page that confirms PAID / NOT-PAID + status + a **container cross-check**, with no login.
**Start state:** A JO that is pre-completion, and (later) the same JO once completed + paid (Lane E).

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| H-1 | `/job-order/:id/print` | Open the printable slip on a **pre-completion** JO | order not completed | render | slip shows the **PENDING** watermark; QR encodes `/verify/:id` | print dialog opens; JO number + containers printed | printing is owner/admin-gated where applicable | | |
| H-2 | `/verify/:id` | Open the QR target while the order is unpaid (logged out) | logged out | `verify` read | shows **⚠ NOT PAID** + status + "not cleared for release" | no login required; containers listed for cross-check | the public read exposes only the verify fields (no PII dump) | | |
| H-3 | `/verify/:id` | Cross-check the listed container numbers against the slip / physical vans | — | — | the page lists the JO's container numbers to match | "Check this against the paper" guidance; genuine only at portal.ktcterminal.com | a wrong/unknown id shows **⚠ NOT FOUND** | | |
| H-4 | `/job-order/:id/print` + `/verify/:id` | After Lane E completes + pays the JO, reprint + re-open verify | order completed + paid | render / `verify` read | slip now shows **COMPLETED**; verify shows **✓ PAID** + Completed | watermark + verify flip together | PAID requires base + RPS-if-needed + every supplement (matches the two-gate) | | |

#### Route closure
- [ ] Slip watermark is PENDING pre-completion and COMPLETED after
- [ ] Public verify page confirms PAID/NOT-PAID + status with no login; unknown id → NOT FOUND
- [ ] Container cross-check is present and matches the two-gate PAID state

#### Lane closeout
- [ ] Print slip + verify-QR coherent end-to-end

---

## Lane I — Release / Pull-out spine (file → verify → charge → pay → confirm → OR → released)

### Route I — The customer-filed release end-to-end + supplements + cancel + number rules

**Objective:** Walk the **Release / Pull-out** module front-to-back (separate from the JO, ADR-0024): an **approved** customer files (consignee + BL + DO/BL) → CSR **verifies** docs (or holds → re-upload) → release desk **sets the charge once** (extras as supplements) → customer **pays** → cashier **confirms** → cashier **records BIR OR + ERP control no.** → **released**; with the no-zero number rules and the cancel guards. This lane is the condensed end-to-end — **see `docs/smoke-test-04-portal.md` (ST04 Lanes A–F) for the per-action deep dive**, including every guardrail string.
**Start state:** The test customer is **`approved`** (Lane A-4); signed in as the customer, then `st05csr` (documents desk), then `st05cash`, then `st05neg` (negative role).

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| I-1 | `/releases` (pending, then approved) | Open Release / Pull-out **before** approval (blocked), then file after approval: consignee + **BL no.** + DO/BL upload → **File release** | A: account `pending` · B: `approved` | client gate `broker?.status==='approved'` → `file_release_order(p_consignee,p_bl,p_doc_path)` | pending: **no form** (banner + warning); approved: a `release_orders` row `RO-000001`, `status='submitted'`, **BL UPPERCASE**, doc → `release-docs/{uid}/…` | banner clears on approval; BL forces uppercase; doc optional ("KTC verifies before assessing the charges") | forced filing while pending → `file_release_order` raises "Your account must be approved to file a release."; blank BL blocked; BL > 60 chars raises | | |
| I-2 | `/admin/releases` (CSR) | Sign in as CSR → **Documents desk** → **View DO/BL** → **Hold for a corrected doc** (note) → customer re-uploads → CSR **Verify** | `verify_release_docs` (csr) | `verify_release_order(p_id,false,note)` then customer `resubmit_release_doc`, then `verify_release_order(p_id,true,null)` | hold → **on_hold** (`staff_note` set); re-upload → **submitted**; verify → **docs_verified** (`verified_at/by` stamped, note cleared) | Cashier section hidden for the CSR (no `review_payments`); the in-app `FileViewerModal` reads the private `release-docs` bucket via staff RLS | a role with **neither** release gate hits "No access to the release desk." **(Server note: `verify_release_order` now RAISES on a blank hold note — "Add a note telling the customer what needs correcting" — fixed in `0159`; Defect D-01 CLOSED.)** | | |
| I-3 | `/admin/releases` (CSR → Set charges) | Enter a base amount (e.g. 5000) + note → **Set charges**; try to revise; then **Add charge** (e.g. "Storage overrun" / 750) | release `docs_verified` | `set_release_charges(p_id,amt,note)`; `add_release_charge(p_release,label,amt)` | `amount=5000`, `charges_set_at` stamped, status → **payable**; supplement row (`unpaid`) added | the release leaves the Set-charges bucket; the supplement lists with an "Unpaid" chip | **set once** — a revise on a `payable` release is rejected; a **zero/negative** base or supplement amount is rejected; a supplement before the base charge is rejected | | |
| I-4 | `/releases` + `/admin/releases` (Cashier) | Customer pays the base (proof → `payment-slips` + QRPH) → cashier **Reject** (note) → re-upload → **Confirm**; then pay + **Confirm** the supplement | release `payable` | `submit_release_payment` → `confirm_release_payment(p_id,bool,note)`; `submit_release_supplement_payment` → `confirm_release_supplement_payment` | base `payment_status='confirmed'`, status → **paid**; supplement → **confirmed** | "Paid — claim your OR at the KTC office for pull-out."; Documents desk hidden for the cashier (no `verify_release_docs`) | both confirm RPCs are `review_payments`-gated and act only on a `submitted` proof (idempotent); **the reject note is now server-enforced (blank → RAISE "Add a note telling the customer why the payment was rejected") — fixed in `0159`; Defect D-01 CLOSED** | | |
| I-5 | `/admin/releases` (Cashier → Record OR) | On the **paid** release with **all** supplements confirmed, **Record OR**: BIR OR (e.g. 1234) + ERP control no. (e.g. 12345; fixed `OR-INV-` prefix) → **Record OR** | release `paid`, all supplements `confirmed` | `record_release_or(p_id,or,'OR-INV-'+inv)` | status → **released**; `or_number='001234'` (padded to 6), `service_invoice_no='OR-INV-00012345'` (padded to 8), `released_at` + `invoice_recorded_at` stamped | live padded previews ("= 001234" / "= OR-INV-00012345"); customer detail shows "Released — OR No. 001234" + the ERP invoice | **no-zero / format rules:** all-zeros OR rejected ("up to 6 digits, non-zero"); all-zeros ERP rejected (OR-INV cash-only, non-zero); **plus the ERP control no. must fall within the accredited series — `record_release_or` raises "below/above the accredited series"**; **OR blocked** while any supplement is unconfirmed; OR only recordable on a `paid` release | | |
| I-6 | `/admin/releases` (cancel) | On a fresh pre-payment release, **Cancel** (staff, with reason); then prove a **paid/released** release and one with a **paid/pending supplement** cannot be cancelled | release `submitted | docs_verified | payable | on_hold` | `cancel_release_order(p_id,reason)` | pre-payment → **cancelled** (`staff_note`=reason, shown to the customer) | a paid/released release shows **no** Cancel control; `st05neg` sees "No access to the release desk." | the RPC rejects a `paid`/`released` release; **0131** blocks cancel when a supplement is `submitted`/`confirmed` ("settle or refund it before cancelling"); `st05neg` (no gates) denied | | |
| I-7 | `/admin/settings` → Service rates & fees + `/calculator` + `/job-order/:id/pay` | (No-zero app-wide) View an **unset** rate/fee; clear one + Save; open the Calculator + a JO Payment page with an unset rate | a rate/fee NULL (0128) | `service_rates`/`pricing_settings`; `src/lib/pricing.ts` | the field shows **"not set"** (not ₱0); an empty save stores **NULL**; the Calculator / Payment render **"—"** for the unset line and exclude it from the total | reload shows "not set"; a "rates not set" hint where applicable | a stored NULL is **never** coerced to 0; no ₱0 / ₱NaN leak; the release **amount** is staff-entered and unaffected by rate config | | |

#### Route closure
- [ ] Release files only for an **approved** customer; CSR verify/hold/re-upload works; charge is **set once** + extras as supplements (all amounts > 0)
- [ ] Customer pays base + each supplement; cashier confirms; **Record OR** writes both numbers zero-padded (OR→6, ERP→8), cash/`OR-INV-` only, non-zero, **OR blocked** while a supplement is unconfirmed
- [ ] Cancel works only pre-payment + for gated staff, is rejected once paid/released, and is **blocked by a paid/pending supplement** (0131); no-zero placeholders hold app-wide
- [ ] (Deep dive: ST04 Lanes A–F)

#### Lane closeout
- [ ] Release / Pull-out spine coherent end-to-end (condensed; ST04 is the full per-action run)

---

## Lane J — Roles & gates: each role lands right and sees only its actions

### Route J — Create staff, verify landings, the verified matrix, and server-side gate enforcement

**Objective:** The owner creates each staff role; each lands on its correct page and sees only its permitted actions per the **verified matrix**; the Roles & Gates editor toggles access **server-side** (not just hidden).
**Start state:** Owner on `/admin/settings`.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| J-1 | `/admin/settings` | Create `st05ops` / `st05cash` / `st05check` / `st05csr` (+ `st05neg`) with their roles | owner session | `create_staff` | each appears with a role badge | staff list refreshes | staff creation is owner-only (RPC denies a non-owner) | | |
| J-2 | `/login` → `/` | Sign in as each role; observe the landing | role users | `RoleLanding` | **operations → `/admin/job-orders`** · **cashier → `/admin/cashier`** · **checker → `/admin/checker`** · **csr → `/admin/support`** · admin/owner → `/admin` | bottom-tab nav shows only that role's tabs | a role can't deep-link a tab it lacks (URL bounce / empty, no data flash) | | |
| J-3 | `/admin/settings` → Roles & Gates | Confirm the matrix matches the verified table: ops = accept/process/complete/hold-reject + assess_rps + vessels + **view_xray_queue** (no confirm_xray, no money); checker = **confirm_xray only**; cashier = review_payments + record_invoice + complete/hold-reject (**no view_xray_queue**); csr = file + manage_support + **verify_release_docs** + view_xray_queue (no status changes); admin = everything **except confirm_xray** | owner session | role-permission matrix | each column matches the verified matrix | the CSR column has no status powers; the cashier column has no X-ray queue; admin has no confirm_xray | the matrix is the source of truth; the server enforces the **live** matrix | ✅ **PASS (server-side, 2026-06-23)** | Live `role_permissions` (filtered `allowed=true`) read via the Management API **matches this matrix exactly — 0 mismatch** on all 18 documented permissions (admin has no `confirm_xray` ✓; cashier no `view_xray_queue`/`confirm_xray` ✓; checker confirm-only ✓; csr no status powers ✓). Plus 4 correctly-scoped newer gates: `log_fuel`/`manage_fuel`/`view_fuel_reports` (admin + `purchaser` role only) and `review_consignee_requests` (admin + csr). **UI landing / toggle-enforcement steps (J-1/2/4/5) still need the manual run.** |
| J-4 | `/admin/settings` | Toggle a gate OFF (e.g. cashier `review_payments`) → cashier reloads | owner session | update matrix | the cashier's payment actions disappear **server-side** (RPC denies, queue empty) — then toggle back | not just hidden in the UI | the server enforces the revoked gate (a forced RPC call denies) | | |
| J-5 | `/admin/settings` | Owner: reset a staff password from Settings | owner session | reset RPC / admin link | the new password works on next login | a copyable set-password link (no email) on `/admin/customers/:id` | the reset path refuses the owner account | | |

#### Route closure
- [ ] Each role lands on its correct page and sees only its tabs/actions
- [ ] The Roles & Gates matrix matches the **verified** split (CSR no status / cashier no X-ray queue / checker confirm-only / admin no confirm_xray / ops no money)
- [ ] Toggling a gate enforces server-side, not just in the UI

#### Lane closeout
- [ ] Roles & gates coherent end-to-end

---

## Lane K — Owner / security basics

### Route K — Invite-only staff, single session, idle logout, owner failsafe, RLS on admin routes

**Objective:** Confirm the launch-critical access controls still hold: invite-only staff, single-session-per-account, idle auto-logout, the non-revocable owner failsafe, and RLS on admin routes for non-staff.
**Start state:** Owner signed in; a second browser / private window available.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| K-1 | `/login` | Confirm there is **no admin self-signup** (registration creates only a `pending` customer) | logged out | `handle_new_user` | a new signup is a customer, never staff | staff exist only via owner `create_staff` | invite-only staff enforced | | |
| K-2 | two browsers | Sign the test customer in on browser 1, then browser 2 (single-session) | session A live | `claim_session` / realtime | browser 1 signs out ≤ 1 min (instant on focus) with "signed in on another device"; the 2FA owner needs the **6-digit verify** to evict | the second device unaffected; eviction logged to security events | a password alone (no aal2) does not kick the 2FA session | | |
| K-3 | customer portal | Idle the customer portal ~14 min | session live | `useIdleLogout` | **"Are you still there?"** prompt; ignore 1 more min → signed out ("after 15 minutes") | any activity resets the timer | the staff portal = 60-min window | | |
| K-4 | `/admin/settings` | As owner, look at the owner row | owner session | — | **no Revoke** on the owner; owner overrides everything (incl. `confirm_xray`) | the owner cannot be demoted/locked out | the server-only `is_owner` failsafe holds | | |
| K-5 | API / `/admin/*` | Logged out, deep-link `/admin`; as the customer, deep-link `/admin/job-orders` + `/admin/releases` | — | RLS + `AdminRoute` | logged out → `/login`; customer at `/admin/*` → bounced to `/` (no admin data flash) | no PII flash on either route | RLS denies the customer admin data even if a route renders | | |

#### Route closure
- [ ] Staff are invite-only; no admin self-signup
- [ ] Single session evicts the old device; idle auto-logout fires per window
- [ ] Owner failsafe is non-revocable; admin routes (JO + release) are gated for non-staff

#### Lane closeout
- [ ] Owner / security basics coherent end-to-end

---

## Lane L — Container rate matrix: calculator + admin tariff (migration `0141`; calculator-only, live billing unchanged)

### Route L — Empty/full × dry/reefer tariff in the calculator + admin editor; no-zero on unset cells; live JO billing still on `service_rates`

**Objective:** The redesigned **Calculator** (`/calculator`) quotes from the re-keyed `terminal_rates` by the **full six-key cell** (service · trade · origin · size · **fill** empty/full · **kind** dry/reefer; 160 combos — the 120 new cells start **NULL** and render **"—" / "not configured"**, never ₱0); the **admin tariff editor** (`/admin/settings` → "Terminal tariff…", gated by **`manage_pricing`**) edits the empty/full × dry/reefer grid; and **live JO/payment billing is UNCHANGED** — it still computes from `service_rates` (`src/lib/pricing.ts`), independent of `terminal_rates`. (This lane covers the `0141` redesign that postdates ST05's original 0131 draft.)
**Start state:** Signed in as the test customer (for the calculator), then the owner (for the tariff editor).

> **Scope note:** the **X-ray JO filing form does not collect size/fill/kind** — that filing UI was intentionally reverted ("the X-ray JO is operational, not priced", commit `086a989`). The `size`/`fill`/`kind` columns exist on `job_order_lines` (nullable) but are **not** entered on the X-ray filing form; dimensions live only in the **calculator/quote** path here.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| L-1 | `/calculator` (customer) | Open the calculator; pick a service + a **shipping line** (sets trade/origin) + **size** + **fill (empty/full)** + **kind (dry/reefer)** + qty | some `terminal_rates` set, some NULL | read `terminal_rates(service,trade,origin,size,fill,kind,rate)` | the quote uses the cell matching **all six** keys | the four fill×kind options render; trade/origin auto-fill from the line | a combo with a **NULL** rate shows **"—"** + **"not configured"** (never ₱0) and is **excluded from the subtotal**; the "rates not set / unconfigured" warning surfaces | | |
| L-2 | `/calculator` | Switch the same line across **Full·Dry / Full·Reefer / Empty·Dry / Empty·Reefer** | several cells set, ≥1 NULL | read | the quoted amount changes per cell (reefer ≠ dry, empty ≠ full where configured) | a configured cell shows **₱**; an unconfigured one shows **"—"** | **no ₱NaN / ₱0 leak** when toggling into an unset cell | | |
| L-3 | `/admin/settings` (owner) → **Terminal tariff** | Open **"Terminal tariff (arrastre · wharfage · LoLo · weighing · storage)"**; set one **Empty·Reefer / 40ft** cell to a **> 0** value + Save; **clear** a different cell + Save | `manage_pricing` | upsert `terminal_rates` | the edited cell stores the value; the **cleared cell stores NULL** | grid shows all **160** cells (5 services × 4 trade/origin × 2 sizes × 4 fill/kind), ₱ prefix; reload persists | a blank input saves **NULL** (not 0); a non-`manage_pricing` role can't reach the editor (URL bounce) and the upsert is RLS-denied (write = admin only) | | |
| L-4 | `/calculator` (re-check) | Re-open the calculator for the cells edited in L-3 | L-3 saved | read | the previously-"—" cell now quotes the new **> 0** amount; the cell **cleared** in L-3 now shows **"—"** | the calculator reflects the admin edit on reload | the NULL cell is still **excluded** from the subtotal | | |
| L-5 | `/job-order/:id/pay` | On a JO with X-ray lines, confirm the **payment total** is unaffected by `terminal_rates` | a JO with a computed total | `src/lib/pricing.ts` reads `service_rates` | JO pay total = X-ray (`service_rates`) + 12% VAT + flat admin/print fees — **independent of `terminal_rates`** | editing a `terminal_rates` cell (L-3) does **not** change any JO pay amount | `terminal_rates` is the **calculator/quote tariff ONLY**; live billing stays on `service_rates` (no crossover) | | |

#### Route closure
- [ ] Calculator quotes by the full six-key cell; the four **fill × kind** options work and auto-fill trade/origin from the line
- [ ] Unset cells render **"—" / "not configured"** and are excluded from the total — never ₱0 / ₱NaN
- [ ] Admin tariff editor edits the **empty/full × dry/reefer** grid (160 cells); a blank input saves **NULL**; gated by `manage_pricing` (write = admin only)
- [ ] **Live JO/payment billing is unchanged** (`service_rates`), independent of `terminal_rates`
- [ ] (Note: the X-ray JO filing form does **not** collect size/fill/kind — reverted; columns nullable/unused)

#### Lane closeout
- [ ] Container rate matrix (calculator + admin tariff, calculator-only) coherent end-to-end

---

## Lane M — Google sign-in onboarding + pending verify-only lockdown + consent gate (postdates the original ST05 draft)

### Route M — Continue with Google → Finish registration → pending; verify-only lockdown; consent-gated filing/ticketing

**Objective:** A customer can onboard through **Google OAuth**: from `/login`, **Continue with Google** → choose a Google account → land on a **Finish registration** step (contact number + Customer Agreement consent) → complete → enter as a **pending** customer (never staff, never auto-approved) — equivalent to the email/password pending state. A **pending** account is confined to the **verify-only** screen (vessel schedule / rates / consignees / filing all return nothing). **Filing and ticketing stay blocked until the agreement consent is recorded.**
**Start state:** Logged out, on `/login`.

> **Backstops (set before the lane):** the **Google provider is enabled** in Supabase Auth → Providers, and the **OAuth callback / redirect URL is allow-listed** in Supabase Auth → URL Configuration (and the Google Cloud OAuth client). A disabled provider or an un-allow-listed redirect must **fail closed** (clean error / no session), never half-create an account.
> **Scope note:** this lane covers the Google-OAuth onboarding + verify-only pending lockdown that **postdate ST05's original draft** (as Lane L covers the `0141` redesign). The **verify-only lockdown is the current pending model** — it tightens **Lane A-3**'s earlier "pending files a held JO" step; reconcile against runtime at execution.

| Action ID | Screen / Route | UI Action | Preconditions | Backend Owner | Expected State / Data | UI / Side Effects to Check | Guardrail Test | Result | Evidence / Notes |
|---|---|---|---|---|---|---|---|---|---|
| M-1 | `/login` | Click **Continue with Google** | logged out; Google provider enabled | `supabase.auth.signInWithOAuth({ provider: 'google' })` | browser redirects to Google's account chooser | the login/password form yields to the OAuth redirect; no password/CAPTCHA on this path | a **disabled** provider or an **un-allow-listed** redirect fails closed (clean error, no session) | | |
| M-2 | Google → app callback | Choose a Google account | provider enabled; redirect allow-listed | Google OAuth → Supabase callback; `handle_new_user` | returns signed-in; a `customers` row is created **pending**, with **no** contact number / agreement consent yet | lands on **Finish registration**, not the portal | a brand-new Google identity (no consent/contact) is routed to Finish registration, never straight into the portal | | |
| M-3 | Finish registration | Enter **contact number**; scroll-to-agree + tick the **Customer Agreement** consent; submit | first OAuth login, profile incomplete | update `customers.contact_number` + record agreement consent (version + timestamp) | contact number + consent stored on the customer row | **Finish** disabled until the contact number is valid **and** the consent is ticked (mirrors the email-register 2-tick gate) | the gate cannot be skipped — consent + contact are required to finish | | |
| M-4 | `/` (verify-only) | Complete → land in the portal | consent recorded | — | enters as **`status='pending'`** — identical to the email/password pending state; never staff, never auto-approved | the verify-only screen + valid-ID upload prompt show | the Google path produces a **pending customer only** (no privilege escalation) | | |
| M-5 | `/` (verify-only) · `/job-order` · vessel / rates / consignee views | As the pending account, try to reach the vessel schedule / rates / consignees / file a JO | pending customer | RLS + route guards | each returns **nothing** — only the verify-only screen renders; vessel schedule, rates, consignees, and filing all come back empty/blocked | no data flash on any route | the pending account is **confined to verify-only**; the data routes return empty under **RLS** (server-enforced, not just UI-hidden) | | |
| M-6 | `/job-order` · `/support` | With consent **not yet** recorded (pre-Finish, or a wiped consent), attempt to **file a JO** and **open a support ticket** | consent not recorded | `file_job_orders` / `open_ticket` (+ guards) | both are **blocked** until the agreement consent is recorded | a "finish registration / agree to continue" prompt, not a silent failure | filing and ticketing are **consent-gated** — refused without a recorded consent | | |

#### Route closure
- [ ] Continue with Google → choose account → **Finish registration** (contact + consent) → enters as a **pending** customer (never staff / auto-approved)
- [ ] Backstops hold: provider enabled + redirect allow-listed; a missing one **fails closed**
- [ ] Pending account is confined to the **verify-only** screen — vessel schedule / rates / consignees / filing all return nothing (RLS-enforced)
- [ ] Filing + ticketing are **blocked until consent is recorded**

#### Lane closeout
- [ ] Google sign-in onboarding + pending verify-only lockdown + consent gate coherent end-to-end

---

## Server-side backbone verification (read-only, 2026-06-23)

Ahead of the manual UI run, the **SECURITY DEFINER RPC bodies** behind lanes A · C · D · E · F · I were inspected read-only via the Supabase Management API against the KTC project (no prod data created). This confirms the *server-enforced* half of each lane's guardrails so the manual run can focus on the UI/side-effect half. All 24 target functions were found; key confirmations:

- **Permission gates present on every mutating RPC** (`has_permission('…')` → RAISE): `record_van_xray`=`confirm_xray`; `review_payment`/`record_office_payment`/`confirm_release_payment`/`confirm_release_supplement_payment`/`record_supplement_office_payment`/`review_supplement_payment`=`review_payments`; `set_release_charges`/`add_release_charge`/`verify_release_order`=`verify_release_docs`; `add_supplement`=`process_job_orders`; `record_release_or`=`review_payments OR record_invoice`; `cancel_release_order` staff = `verify_release_docs OR review_payments`.
- **No-zero / amount guards:** `set_release_charges`, `add_release_charge`, `add_supplement` all reject `null`/`<= 0` ("…greater than zero"). `set_release_charges` is **set-once** ("Charges are set once… can't be revised"); `add_release_charge` requires the **base first** ("…only be added once the base charge is set").
- **OR / ERP rules (`record_release_or`):** OR `!~ '^[0-9]{1,6}$' or = 0` → "up to 6 digits, non-zero", stored `lpad(…,6)`; ERP via `normalize_erp_invoice_no` (`^OR-?INV-?0*([0-9]{1,8})$`, non-zero, `lpad(…,8)`); **OR blocked while a supplement is unpaid** + **only on a `paid` release**. **➕ Stronger than first documented:** the ERP control no. must also fall **within the accredited series (min/max)** — raises "below/above the accredited series."
- **Two-gate completion (`enforce_two_gate_complete`):** "services, base payment, RPS, and all additional charges must be cleared" (matches Lane E).
- **Caps (`enforce_order_caps`):** 10 held (pending) / 10 open — both RAISE with `check_violation` (Lane A).
- **Release filing (`file_release_order`):** approval gate "Your account must be approved to file a release."; BL required + `> 60` rejected; `RO-` `lpad(nextval,6)` (Lane I-1).
- **Cancel (`cancel_release_order`):** rejects paid/released ("…already paid or released"); **0131** supplement guard ("…paid or pending additional charge — settle or refund it before cancelling") (Lane I-6).
- **Idempotency:** every confirm/review RPC acts only on a `submitted` proof (`where … payment_status='submitted'` / "no payment to review"), so re-confirm is a no-op (no double-credit).

**✅ One finding — now CLOSED (Defect D-01, fixed `0159` / v1.6.13, 2026-06-25):** the **release-desk hold/reject reason note is now server-enforced** — `verify_release_order`, `confirm_release_payment`, and `confirm_release_supplement_payment` RAISE on a blank reason on the reject/hold branch (`p_ok = false`), mirroring the JO side. The asymmetry that ST05 originally flagged is resolved; the I-2/I-4 guardrail cells above reflect the enforced behavior.

---

## Defects tracker

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| D-01 | I / I-2, I-4 (release desk) | Low | Release-desk **hold/reject reason note is not server-enforced** | A blank hold/reject reason is rejected so the customer always gets a reason — as on the JO side (`review_payment` raises "Add a note telling the customer why") | ~~`verify_release_order`, `confirm_release_payment`, `confirm_release_supplement_payment` accept a blank note (store NULL) — no RAISE.~~ **Fixed `0159` (v1.6.13, 2026-06-25):** all three RAISE on a blank reason on the reject/hold branch, mirroring the JO side. | ✅ CLOSED | Live function-body probe confirms the guard (2026-06-25) |

## Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| Preflight (P1–P8) | ✅ PASS | All 8 gates pass (2026-06-21, v1.5.0 / `2af1f3e`; migrations through `0131`). **Re-run 2026-06-23 (`542cc89`; migrations through `0150`) — all PASS** | Go |
| A — Onboarding + file JO (Batch/aging, not serving #) | | | |
| B — Operations accept + RPS + X-ray monitor | | | |
| C — Per-van X-ray + e-signature (checker-only) | | | |
| D — Payments (online + cashier + walk-in, base + RPS) | | | |
| E — Two-gate completion | | | |
| F — JO additional-charge supplement loop | | | |
| G — Staff edit + internal notes/flag + CSR support | | | |
| H — Print slip + verify-QR | | | |
| I — Release / Pull-out spine (+ number rules, cancel, no-zero) | | | |
| J — Roles & gates | | | |
| K — Owner / security basics | | | |
| L — Container rate matrix (calculator + admin tariff, 0141) | | | |
| M — Google sign-in + pending verify-only lockdown + consent gate | | | |

**Overall go / no-go:** ____

## Cleanup after run

- Suspend/reject the throwaway customer; revoke `st05ops` / `st05cash` / `st05check` / `st05csr` / `st05neg`.
- Cancel/clear the test JOs + supplements and the test releases (`RO-0000xx`) + `release_supplements`; remove the test uploads in `valid-ids` / `payment-slips` / `release-docs` (storage objects can't be deleted via SQL — use the Storage API; the 3-day purge clears them regardless). Test IDs uploaded during the run can't be manually deleted for 24h (`0053` window).
- Re-toggle any Roles & Gates flag changed in Lane J back to its launch default.
- Re-fill any Settings → Service rates & fees field cleared in Lane I-7 back to its launch value (or leave it intentionally "not set" per the no-zero policy).
- **Go-live numbering reset (only safe at zero real rows):** delete the test orders/releases/customer and reset `jo_number_seq` / `broker_code_seq` / `release_no_seq` so the first *real* JO is `JO-000001` and the first *real* release is `RO-000001`.
