# KTC Online Portal — Go-Live Smoke Test

**All roles · all lanes · positive + negative.** This is the owner's authoritative walk-through before go-live. Work it top to bottom. Every row has an **Expected** result and a blank **Result** box — write PASS / FAIL / note. A lane is "green" only when every row passes.

- **Version under test:** v2.0.11 - latest migration 0232 (prod applied 2026-06-30).
- **Android app build under test:** sandbox internal debug APK `KTC-Test-sandbox-debug.apk` (staff-only, sideloaded, app label **KTC Test**). Latest local SHA256: `FEE72FD96A2D505E2F7B340F65E51D14552BC4B154DAC7F3B716B2DD978B4158`; record the actual APK SHA256 beside the Result when you run Part 15.
- **Site:** for internal testing, use the e2e sandbox Supabase ref `zwvzadkgeyhkhyshkwhc`, not prod ref `mdlnfhyylvapzdubhyic`. Sandbox builds show a yellow **SANDBOX DB** badge.
- **How to record:** print this file or copy it; fill the Result column. Anything that is not exactly the Expected result is a FAIL — log what you actually saw.

### Sandbox build commands

Run these from the repo root when preparing internal testing:

```powershell
npm run target:status
npm run seed:e2e:owner
npm run seed:e2e:consignees
npm run dev:test
npm run preview:test
npm run build:android:test
```

Use `dev:test` for live local testing, `preview:test` for a production-like local web bundle, and `build:android:test` for the sideload APK. The test scripts refuse to run if the sandbox Supabase ref resolves to production. `seed:e2e:owner` makes `jlawrenceang@gmail.com` the e2e root owner too, so the owner account stays the same across live and test.

---

## Legend

- 🟢 **Positive test** — the role/lane should be able to do this.
- 🔴 **Negative test** — the role should be *blocked*; a "PASS" means it was correctly refused.
- ⚠️ **SHIPPED v2.0.7+** — a gap fixed **and deployed** this session (migrations 0228-0232 applied; frontend live). The **Expected** shown is the live behavior — test it as a normal row; if you instead see the old behavior, the Vercel build may still be propagating (give it a few minutes).
- 💰 **Money/contract invariant** — billing-integrity check; treat a FAIL here as a go-live blocker.

---

# PART 0 — Pre-flight (do this first; it's the real blocker)

You cannot test "all roles" without one account per role. Staff are **invite-only** (no self-signup). Use Gmail **plus-addressing** so every test inbox lands in your own `jlawrenceang@gmail.com` — e.g. `jlawrenceang+admin@gmail.com`. Gmail delivers all `+anything` aliases to you.

### 0.1 Provision the role accounts

| # | Account | How to create | Email to use |
|---|---|---|---|
| 0.1.1 | **Owner** | already exists (failsafe) | `jlawrenceang@gmail.com` |
| 0.1.2 | **Admin** | Owner → `/admin/account` (staff accounts → invite) → invite, role = admin | `jlawrenceang+admin@gmail.com` |
| 0.1.3 | **Operations** | same invite flow, role = operations | `jlawrenceang+ops@gmail.com` |
| 0.1.4 | **Cashier** | same, role = cashier | `jlawrenceang+cash@gmail.com` |
| 0.1.5 | **Checker** | same, role = checker | `jlawrenceang+check@gmail.com` |
| 0.1.6 | **CSR** | same, role = csr | `jlawrenceang+csr@gmail.com` |
| 0.1.7 | **Customer A** | self-signup at `/register` → then Owner approves at `/admin/approvals` | `jlawrenceang+custa@gmail.com` |
| 0.1.8 | **Customer B** | self-signup at `/register` (leave *pending*, don't approve — used for negative tests) | `jlawrenceang+custb@gmail.com` |

> **purchaser** role (fuel module) is **not invitable from the UI and has no front-end** — skip it (see Part 9).

**Invite mechanics to verify as you go:**
- Each invite sends an email with a set-password link → opens `/reset-password` → set a password → first login.
- Staff log in with the **email** you invited (the address with `@`). A staff *username* without `@` maps to `<user>@ktc-staff.local` internally — for these tests just use the email addresses above.
- If MFA enrolment is forced, complete it; note the recovery codes.

| ID | Test | Expected | Result |
|---|---|---|---|
| PF-01 | 🟢 Invite each of the 5 staff roles | Invite email arrives for each; set-password link works; first login lands on the role's home (admin→`/admin`, ops→`/app/operations`, cashier→`/app/payment-orders`, checker→`/app/checker`, csr→`/app/support`) | |
| PF-02 | 🟢 Customer A signup → approve | After Owner approval, Customer A can reach `/job-order` and file (no "pending" banner) | |
| PF-03 | 🔴 Customer B left pending | Customer B sees the pending/awaiting-approval banner and **cannot** file a job order | |

### 0.2 Seed the data a lane needs

| ID | Test | Expected | Result |
|---|---|---|---|
| PF-10 | 🟢 At least one **consignee** exists for Customer A | Owner/admin can add via `/admin/consignees`, or Customer A requests one and CSR/admin approves; the consignee shows in Customer A's filing dropdown | |
| PF-11 | 🟢 At least one **vessel visit** exists | `/admin/vessel-schedule` has a visit (or the Google-Sheet sync ran); it appears in the filing vessel picker | |
| PF-12 | 💰 A **service / DEA rate** is configured so charges compute | When a job order is filed, a base charge is seeded with a non-zero amount (not ₱0). If amounts are ₱0, fix pricing in `/admin/settings` before continuing | |

---

# PART 1 — Public / unauthenticated lane (no login)

Open these in a **private/incognito window** with no session.

| ID | Test | Expected | Result |
|---|---|---|---|
| PUB-01 | 🟢 Open `/login` | Login screen renders; no console crash | |
| PUB-02 | 🟢 Open `/register` | Signup form renders; consent/agreement shown | |
| PUB-03 | 🟢 Open `/agreement`, `/terms`, `/privacy`, `/irr` | Each renders the legal copy | |
| PUB-04 | 🟢 Scan/open a **Verify QR** `/verify/<job-order-id>` for a real order | Shows order status, containers, and PAID / NOT-PAID + a charges table | |
| PUB-05 | 💰⚠️ SHIPPED v2.0.7 — Verify a job order that is paid on the base charge **but has an unpaid add-on** | The headline does **NOT** say PAID while any billed charge is unpaid — it reflects *all* charges (add-ons included). | |
| PUB-06 | 🔴 Try a protected URL with no session, e.g. `/admin`, `/job-orders`, `/account` | Redirected to login / `/` — never renders the protected screen | |
| PUB-07 | 🔴 Try `/verify/<random-non-existent-id>` | Graceful "not found" — no crash, no data leak | |

---

# PART 2 — Customer lane (the primary money path)

Login as **Customer A** (`+custa`).

### 2A. Filing

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-01 | 🟢 `/job-order` — file with valid consignee, entry number, vessel visit, 1–3 containers | Order created with status **submitted**; appears in `/job-orders`; a base charge is seeded | |
| CUST-02 | 🔴 File with a duplicate entry number / missing required field | Rejected with a clear message; no order created | |
| CUST-03 | 🟢⚠️ SHIPPED v2.0.7 — paste/add **150 containers** in one order | Accepts up to the raised cap (200); a 150-van C-entry files successfully (backend now caps at 200, not 100). | |
| CUST-04 | 🔴 Try to exceed the max container cap (e.g. 250 rows) | Blocked with a clear "at most N containers" message before/at submit — not a silent truncation | |
| CUST-05 | 🟢 Print the slip `/job-order/<id>/print` | Slip renders with the Verify QR; QR resolves to `/verify/<id>` | |
| CUST-06 | 🟢 Cancel a submitted order (if allowed pre-processing) | Status → cancelled; reflected in `/job-orders` | |

### 2B. Charges & payment (💰 the spine)

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-10 | 🟢 Open a billed charge in `/job-orders` → upload payment proof | Proof uploads; charge `payment_status` → **submitted**; awaiting cashier confirmation | |
| CUST-11 | 💰 Pay-before-final-invoice is **intentional** here | Customer **can** submit proof before the final ERP/BIR invoice — this is by design (the final invoice is released only after payment, so it acts as the gate pass). This should work, not be blocked. | |
| CUST-12 | 🔴 Try to "pay" a charge that is not yet billed (proposed) or already confirmed | No uploader offered / rejected — only billed + unpaid/rejected charges are payable | |
| CUST-13 | 🟢 After cashier confirms (Part 6), re-open the order | Charge shows **confirmed/paid**; balance reflects it | |
| CUST-14 | 💰 Order does **not** auto-complete while any billed charge is unpaid | Order stays processing until every billed charge is confirmed AND all services (X-ray) done — then it auto-completes | |

### 2C. Release / gate pass (customer side)

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-20 | 🟢 File a **release order** at `/releases` | Release created with status submitted; visible to CSR for doc verification | |
| CUST-21 | 🟢 After CSR verifies + charges set, upload release payment | `payment_status` → submitted; awaiting cashier | |
| CUST-22 | 🟢 After cashier records the OR | Release → released; reflected in `/releases` | |

### 2D. Customer self-service

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-30 | 🟢 `/support` — open a ticket | Ticket created; visible to staff in `/admin/support` | |
| CUST-31 | 🟢 `/requests` — request a consignee | Request created; visible to CSR/admin for review | |
| CUST-32 | 🟢 `/vessels` | Vessel schedule renders (read-only for customer) | |
| CUST-33 | 🟢 `/notifications` + enable push | Push permission prompt; a later staff action delivers a push | |
| CUST-34 | 🔴 Direct-URL any `/admin/*` route as the customer | Bounced to `/` — never renders admin | |

---

# PART 3 — Owner / Root owner (super-admin failsafe)

Login as **Owner** (`jlawrenceang@gmail.com`).

| ID | Test | Expected | Result |
|---|---|---|---|
| OWN-01 | 🟢 Reach **every** `/admin/*` route | All render; owner passes every gate (`*`) | |
| OWN-02 | 🟢 `/admin/settings` → Roles & Gates → toggle a permission, save | Change persists; the affected role's access changes (re-test with that role) | |
| OWN-03 | 🟢 Invite a staff member (any role) | Invite email sends; account created pending password set | |
| OWN-04 | 💰 Reverse a confirmed charge (credit-note path) | Reversal recorded with an audit row in `/admin/charge-audit`; never a silent delete | |
| OWN-05 | 🟢 Grant/revoke owner via `set_owner_access` (root-owner only) | Only the root owner can; a non-root owner cannot mint owners | |
| OWN-06 | 🔴 Confirm owner **cannot be locked out** | Even with role rows removed, `jlawrenceang@gmail.com` still resolves as owner (email failsafe) | |
| OWN-07 | 🟢 MFA crown-jewel gate | Owner-only sensitive RPCs require MFA (aal2) satisfied | |

---

# PART 4 — Admin (full back office, except owner-only)

Login as **Admin** (`+admin`).

| ID | Test | Expected | Result |
|---|---|---|---|
| ADM-01 | 🟢 `/admin` dashboard loads with counts | Renders; counts reflect approved data only | |
| ADM-02 | 🟢 `/admin/approvals` — approve/reject a pending customer | Customer status changes; they gain/lose filing access | |
| ADM-03 | 🟢 `/admin/customers` + `/admin/consignees` — manage | CRUD works; protected fields (role/owner) cannot be self-assigned | |
| ADM-04 | 🟢 `/admin/job-orders` — accept a submitted order → processing | Status → processing via `staff_transition_order` | |
| ADM-05 | 🟢 Record a **final invoice** (ERP + BIR) on a billed charge | `invoice_state` → final; ERP/BIR numbers validated by format | |
| ADM-06 | 💰 Approve an **add-on** charge created by someone else | Allowed; **maker-checker** holds — admin cannot approve an add-on they themselves created (CUST/ADM-07) | |
| ADM-07 | 🔴 Try to approve an add-on **you created** | Rejected (approver ≠ creator) | |
| ADM-08 | 🟢 `/admin/new-job-order` — file on behalf of a customer | Order created; `admin_file_job_order` | |
| ADM-09 | 🟢 `/admin/vessel-schedule` — add/edit + "Sync sheet" | Edits save; sync pulls from the Google Sheet | |
| ADM-10 | 🟢 `/admin/reconciliation`, `/admin/charge-audit`, `/admin/logs` | All render with data; audit trail present | |

---

# PART 5 — Operations (orders + X-ray + vessels; NO money)

Login as **Operations** (`+ops`). Home (post-login landing): `/app/operations` — the full back-office order list is at `/admin/job-orders`.

| ID | Test | Expected | Result |
|---|---|---|---|
| OPS-01 | 🟢 `/admin/job-orders` — accept / hold / reject orders | Transitions work (gate `accept_orders` / `hold_reject_orders`) | |
| OPS-02 | 🟢 Assess RPS on an order | Allowed (gate `assess_rps`) | |
| OPS-03 | 🟢 X-ray queue monitor only | Operations can view order/X-ray state, but cannot confirm vans; confirmation belongs to Checker (`confirm_xray`) | |
| OPS-04 | 🟢 `/admin/vessel-schedule` | Can manage (gate `manage_vessel_schedule`) | |
| OPS-05 | 🔴 Reach money screens: `/admin/payment-orders`, `/admin/charges`, record invoice, confirm payment | **Screen body refuses** — operations has no `review_payments` / `record_invoice`. Nav should not show them; direct URL must also refuse | |
| OPS-06 | 🔴 `/admin/approvals`, `/admin/customers`, `/admin/settings` direct URL | Refused (no `manage_approvals` / `manage_customers` / owner) | |

---

# PART 6 — Cashier (money lane only)

Login as **Cashier** (`+cash`). Home: `/app/payment-orders`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CASH-01 | 🟢 `/app/payment-orders` — review a submitted payment | Proof visible; can confirm/reject (gate `review_payments`) | |
| CASH-02 | 💰 Confirm a charge payment | Only confirms against a **final ERP+BIR invoice**; charge → confirmed; order auto-completes if it was the last gate | |
| CASH-03 | 💰 Reject a payment with a note | Charge → rejected; customer can re-submit (CUST-10 again) | |
| CASH-04 | 🟢 Create a **Payment Order** bundling several billed charges for one customer | `create_payment_order` — only billed, unbundled, same-customer charges; ⚠️ SHIPPED v2.0.7: **release** charges now appear and can be bundled too | |
| CASH-05 | 💰 Confirm a Payment Order with one collection OR number | `confirm_payment_order` records the OR, confirms each bundled charge | |
| CASH-06 | 🟢 Record a final invoice (cashier has `record_invoice`) | invoice_state → final | |
| CASH-07 | 🔴 Try to accept / hold / reject an **order** | Refused — cashier lost `accept_orders` / `hold_reject_orders` (separation of duties) | |
| CASH-08 | 🔴 Direct-URL `/admin/approvals`, `/admin/settings` | Refused | |

---

# PART 7 — Checker (X-ray confirmation; tablet)

Login as **Checker** (`+check`). Home: `/app/checker`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CHK-01 | 🟢 `/app/checker` opens the scanner | Camera/QR scanner loads (native ML-Kit if using the Capacitor app; web camera otherwise) | |
| CHK-02 | 🟢 Scan a container's Verify QR `/verify/<id>` | Resolves the order; checker can confirm the van's X-ray (e-signature) | |
| CHK-03 | 🟢 Confirm the **last** van's X-ray on an order | X-ray service marked done; contributes the X-ray gate toward completion | |
| CHK-04 | 🟢 Request a **re-X-ray** | Allowed (gate `request_rexray`); creates the re-X-ray sub-flow | |
| CHK-05 | 🔴 Try to confirm a **payment** or reach `/app/payment-orders` | Refused — checker has no `review_payments` | |
| CHK-06 | 🔴 Direct-URL `/admin/customers`, `/admin/settings` | Refused | |

---

# PART 8 — CSR (intake + comms + release docs)

Login as **CSR** (`+csr`). Home: `/app/support`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CSR-01 | 🟢 `/app/support` / `/admin/support` — answer a ticket | Works (gate `manage_support`) | |
| CSR-02 | 🟢 File a job order on behalf of a customer | Works (gate `file_job_orders`) | |
| CSR-03 | 🟢 Review/approve a **consignee request** | Works (gate `review_consignee_requests`) | |
| CSR-04 | 🟢 Verify **release docs** on a release order | Works (gate `verify_release_docs`); release → docs_verified | |
| CSR-05 | 🔴 Try to **accept / hold / reject** a job order | **Refused** — CSR's accept/hold was revoked (maker-checker SoD, migration 0171). This is a key negative test | |
| CSR-06 | 🔴 Try to confirm a payment / record an invoice | Refused (no `review_payments` / `record_invoice`) | |
| CSR-07 | 🔴 Direct-URL `/admin/settings` | Refused | |

---

# PART 9 — Purchaser / Fuel module (DORMANT — skip)

| ID | Test | Expected | Result |
|---|---|---|---|
| FUEL-01 | ℹ️ No action | The fuel module has **no front-end** and `purchaser` is not invitable. Confirm there is **no** `/fuel` route and no fuel nav tile. Out of scope for go-live | |

---

# PART 10 — Cross-cutting RBAC negative sweep (highest-value security test)

The `/admin/*` routes historically admitted **any** staff at the route level, relying on each screen + the backend to refuse. ⚠️ SHIPPED v2.0.7 adds a **per-route permission guard** (now live). Run this matrix: for each restricted role, type each URL directly in the address bar and confirm the **screen body** refuses (not just a hidden nav tile).

For **each** of Operations, Cashier, Checker, CSR, and Customer A, visit each URL:

| ID | URL | Roles that should be REFUSED | Expected | Result |
|---|---|---|---|---|
| RBAC-01 | `/admin/settings` | ops, cashier, checker, csr, customer | Refused (owner/admin only) | |
| RBAC-02 | `/admin/approvals` | ops, cashier, checker, csr, customer | Refused unless `manage_approvals` | |
| RBAC-03 | `/admin/customers` | ops, cashier, checker, csr, customer | Refused unless `manage_customers` | |
| RBAC-04 | `/admin/payment-orders` | ops, checker, csr, customer | Refused unless `review_payments` | |
| RBAC-05 | `/admin/charges` | ops, checker, csr, customer | Refused unless charge perms | |
| RBAC-06 | `/admin/reconciliation` | ops, checker, csr, customer | Refused unless `manage_approvals` | |
| RBAC-07 | `/admin/vessel-schedule` | cashier, checker, csr, customer | Refused unless `manage_vessel_schedule` | |
| RBAC-08 | `/admin/logs` / `/admin/security` | ops, cashier, checker, csr, customer | Refused unless owner/admin | |
| RBAC-09 | `/admin/job-orders` | customer | Refused (staff-only) | |

> Record any URL where the **screen content** actually renders for a role that shouldn't see it — that is a go-live blocker.

---

# PART 11 — Money / billing-integrity invariants (💰 blockers)

These are the contract invariants. A FAIL here blocks go-live regardless of UI polish.

| ID | Invariant | How to test | Expected | Result |
|---|---|---|---|---|
| MON-01 | **No completion with unpaid billed charges** | Add a billed charge, leave it unpaid, complete X-ray, try to finish the order | Order will **not** complete until the charge is confirmed | |
| MON-02 | **Payment confirms only against a final invoice** | Try to confirm a payment whose charge has no final ERP+BIR invoice | Cashier confirm is blocked until invoice_state=final | |
| MON-03 | **Maker-checker on add-ons** | Same person creates + approves an add-on | Blocked (ADM-07) | |
| MON-04 | **Reversal, never delete** | Reverse a confirmed charge | Credit-note + audit row, original preserved | |
| MON-05 | **Auto-complete on last gate** | Confirm the final outstanding charge on an order whose X-ray is done | Order auto-completes immediately | |
| MON-06 | **Release charges flow through the spine** ⚠️ SHIPPED v2.0.7 | Bill a release charge → customer pays → cashier confirms | Release charge is payable through the same Payment Order / charge path as JO charges | |
| MON-07 | **Verify QR reflects true paid state** ⚠️ SHIPPED v2.0.7 | PUB-05 | Headline never says PAID while any billed charge (add-on/release) is unpaid | |
| MON-08 | **Payment Order = one customer** | Try to bundle charges from two different customers | Rejected | |
| MON-09 | **Payment Order = one consignee** ⚠️ SHIPPED v2.0.8 | Try to bundle charges from two different consignees of the same customer | Rejected — the desk groups by consignee and the RPC enforces it | |
| MON-10 | **No bundling a charge with proof submitted** 💰⚠️ SHIPPED v2.0.8 | Customer uploads payment proof on a billed charge (→ submitted), then a cashier opens the Payment Order desk | The submitted charge is **visible** (for confirm/reject) but its bundle checkbox is **disabled**; the RPC also refuses it. It can't be settled twice (once by the customer's proof, once by a walk-in OR) | |

---

# PART 12 — Release / two-gate convergence

"Cleared for release" is **derived**, never stored: Payment gate (cashier) **AND** X-ray gate (checker) must both clear.

| ID | Test | Expected | Result |
|---|---|---|---|
| REL-01 | 🟢 Order with X-ray done but payment unpaid | Shows **not** cleared (payment gate open) | |
| REL-02 | 🟢 Order paid but X-ray not done | Shows **not** cleared (X-ray gate open) | |
| REL-03 | 🟢 Both gates cleared | Shows **cleared for release**; Verify QR reflects it | |
| REL-04 | 🟢 Standalone release-order lifecycle | submitted → docs_verified (CSR) → payable → paid (cashier OR) → released | |

---

# PART 13 — Secondary lanes

| ID | Test | Expected | Result |
|---|---|---|---|
| SEC-01 | 🟢 Vessel schedule sync ("Sync sheet") | Pulls latest from the Google Sheet without error | |
| SEC-02 | 🟢 Support ticket open → staff reply → close → reopen locked rules | Lifecycle works; closed/locked behave per 0112 | |
| SEC-03 | 🟢 Bulletin board: admin posts (with attachment) → customer sees it | Post + attachment visible to customers | |
| SEC-04 | 🟢 Web push: staff action → customer/staff bell + push | Notification delivered (check the bell and the device) | |
| SEC-05 | ℹ️ SMS / BOC mirror | **Dormant** — out of scope unless activated this session (see the SMS activation guide) | |

---

# PART 14 — Device / PWA / Checker scan

| ID | Test | Expected | Result |
|---|---|---|---|
| DEV-01 | 🟢 Install the staff PWA on a phone/tablet | Installs; role-aware home loads | |
| DEV-02 | 🟢 Checker scans a real container QR on a tablet | Native/Web camera opens; QR resolves to the order; X-ray confirm works | |
| DEV-03 | 🟢 Mobile layout on the customer filing + payment screens | Usable on a phone; no overflow/clipping; Tagalog copy renders if locale = tl | |
| DEV-04 | 🟢 Single-session enforcement | Logging in on a 2nd device prompts terminate/cancel on the first | |

---

# PART 15 — Android internal app lane (staff APK only)

Use a real Android phone/tablet. Sideload the current internal sandbox debug APK (`KTC-Test-sandbox-debug.apk`) and record its SHA256. This lane is **not** for customers: customer accounts use the web portal only.

Preconditions:
- Android 7+ device, camera available, network toggle available (Wi-Fi or mobile data off/on).
- Current debug APK installed fresh, or app data cleared before the run.
- Test the app in both light/dark and en/fil if you are doing the full lifecycle matrix.
- Native push requires Firebase `google-services.json` + Supabase native-push secrets; until those are armed, treat cloud push registration as **configuration-pending**, not a smoke FAIL. Local notifications must still work.

| ID | Test | Expected | Result |
|---|---|---|---|
| APK-01 | 🟢 Install / open the internal APK | App installs as **KTC Portal**, launches without a browser address bar, and shows the normal login flow | |
| APK-02 | 🔴 Log in as **Customer A** inside the APK | Customer is blocked by the **Internal staff app** screen; app explains customers should use the web portal and the **Open customer web portal** button opens `https://portal.ktcterminal.com` outside the app | |
| APK-03 | 🟢 Log in as **Checker** | Lands on `/app/checker`; bottom/footer shows **Device** and **Open full portal**; scanner screen uses large touch targets | |
| APK-04 | 🟢 Native QR scan | Camera permission prompt appears; granting it opens the ML-Kit QR scanner; a real `/verify/<id>` QR opens the matching order | |
| APK-05 | 🟢 Native haptics on scanner outcome | Successful scan / confirmed X-ray gives a success vibration; invalid QR or scan error gives error feedback. If the device has no haptic motor, note N/A | |
| APK-06 | 🟢 Confirm X-ray while online | `record_van_xray` succeeds; the order refreshes; van row changes to confirmed; no duplicate confirmation is created on refresh | |
| APK-07 | 🟢 Yard offline outbox | Turn network off, open a processing X-ray order already loaded, confirm a van. The app does **not** attempt money/payment work offline; it queues only the yard X-ray confirmation and shows the offline saved message | |
| APK-08 | 🟢 Reconnect / background sync | Turn network back on or reopen/resume the app. Queued X-ray confirmation syncs through the normal server RPC, moves to **Synced**, and local alert says sync finished | |
| APK-09 | 🔴 Offline money guard | While offline in the APK, try to reach cashier/payment lanes by role or direct URL as checker/ops/customer | Wrong roles are refused by route permission; no payment proof, invoice, Payment Order, OR, or money action is queued locally | |
| APK-10 | 🟢 `/app/device` native-only screen | Shows platform/model/Android version/network/OTA bundle, push toggle, local yard note, and yard outbox; screen is reachable only for staff in the APK | |
| APK-11 | 🟢 Local device storage workflow | Save a **Yard note**; it persists after app close/reopen; **Clear local** removes local notes/outbox rows after confirmation | |
| APK-12 | 🟢 Local notifications | Tap **Test local alert** on `/app/device`; Android notification permission appears if needed; local alert fires on the device | |
| APK-13 | 🟢 Share sheet | Tap **Share device status**; Android share sheet opens with platform/network/outbox/OTA status text and can send to SMS/Viber/Messenger manually | |
| APK-14 | 🟢 OTA readiness | `/app/device` shows an OTA bundle status (built-in/current bundle or a readable updater error). The app does not crash if Capgo is not yet activated | |
| APK-15 | 🟢 Role-aware APK homes | Operations → `/app/operations`; Cashier → `/app/payment-orders`; CSR → `/app/support`; Admin/Owner → `/admin`; each still obeys Part 10 RBAC direct-URL refusals | |
| APK-16 | 🟢 Lock / shared tablet behavior | Tap **Lock** or wait for idle timeout; app signs out and returns to login. Next user does not see the prior user's role/outbox state except device-local unsynced yard items | |
| APK-17 | 🟢 Android permissions audit | App requests only expected permissions: internet, camera, notification, network state, vibration, FCM/wake/boot support for notifications. No contacts/location/storage permission prompt appears | |
| APK-18 | 🟢 App lifecycle matrix | Repeat APK-03 to APK-13 in light/dark and en/fil at least once; no clipped text, broken Tagalog strings, or role leak in either mode | |

> Android go-live note: this debug APK is acceptable for internal sideload testing. For a wider internal rollout, create a release-signed APK/AAB and document the signing key custody. OTA can update web assets only; adding/changing native plugins still requires a new APK.

---

# Sign-off

| Lane | Owner verdict (date / initials) |
|---|---|
| Pre-flight (accounts + seed) | |
| Public | |
| Customer | |
| Owner / Root owner | |
| Admin | |
| Operations | |
| Cashier | |
| Checker | |
| CSR | |
| RBAC negative sweep | |
| Money invariants | |
| Release / two-gate | |
| Secondary lanes | |
| Device / PWA | |
| Android internal app | |

**Go-live decision:** all lanes green + zero open 💰 invariant FAILs + zero RBAC content-leaks → cleared. Any FAIL → fix → re-run the affected lane before clearing.

---

## Fixes shipped this session — v2.0.7 + migration 0228 (deployed to prod 2026-06-30)

These were the ⚠️ rows. All are **live** (frontend pushed `850b46f`; migration `0228` applied + verified on prod):

1. **Container cap** — backend raised 100→200 to match the 150–200 editor (`0228`). → CUST-03/04.
2. **Verify-QR PAID headline** — now reflects *all* billed charges incl. add-ons/release, not just base/RPS. → PUB-05, MON-07.
3. **Release charges parent-aware** — Payment Order desk + `submit_charge_payment` authorize through both job_orders and release_orders (`0228`). → CASH-04, MON-06.
4. **Per-route `/admin/*` guards** — restricted roles bounced from direct URLs, not just hidden nav. → Part 10.
5. **Stale type defs** — charge contract centralized (`service | rps | addon | release`, nullable `job_order_id`, `release_order_id`); stale `'xray'` literal removed.

If a ⚠️ row still shows the *old* behavior, the Vercel build may not have propagated yet (give it a few minutes) — it's not a FAIL.
