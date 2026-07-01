# Smoke Test ST08 - Go-Live Smoke Test (ACTIVE / CURRENT)

**Smoke Test ID:** ST08
**Status:** ACTIVE / CURRENT
**Owner:** Go-live execution

**All roles / all lanes / positive + negative.** This is the owner's authoritative walk-through before go-live. Work it top to bottom. Every row has an **Expected** result and a blank **Result** box - write PASS / FAIL / note. A lane is "green" only when every row passes.

- **Active-smoke rule:** this is the only active manual smoke test. ST05/ST06/ST07 are closed legacy/reference stubs. If a newer smoke replaces this file, mark ST08 closed/legacy/inactive in this header and update `docs/go-live-smoke-test.md` plus `docs/agent/testing-and-release.md`.
- **Version under test:** v2.0.11+ go-live hardening - latest migration 0236 (prod and sandbox applied 2026-07-01). Latest frontend checkpoint: commit `830bd2a`, deployment `ktc-joborderform-6bbtfhqfl`.
- **Android app build under test:** sandbox internal debug APK `KTC-Test-sandbox-debug.apk` (staff-only, sideloaded, app label **KTC Test**). Latest local SHA256: `FEE72FD96A2D505E2F7B340F65E51D14552BC4B154DAC7F3B716B2DD978B4158`; record the actual APK SHA256 beside the Result when you run Part 15.
- **Site:** for internal testing, use the e2e sandbox Supabase ref `zwvzadkgeyhkhyshkwhc`, not prod ref `mdlnfhyylvapzdubhyic`. Sandbox builds show a yellow **SANDBOX DB** badge.
- **How to record:** print this file or copy it; fill the Result column. Anything that is not exactly the Expected result is a FAIL - log what you actually saw.

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

- ðŸŸ¢ **Positive test** â€” the role/lane should be able to do this.
- ðŸ”´ **Negative test** â€” the role should be *blocked*; a "PASS" means it was correctly refused.
- âš ï¸ **SHIPPED v2.0.7+** â€” a gap fixed **and deployed** during go-live hardening (migrations 0228-0236 applied; frontend live). The **Expected** shown is the live behavior â€” test it as a normal row; if you instead see the old behavior, the Vercel build may still be propagating (give it a few minutes).
- ðŸ’° **Money/contract invariant** â€” billing-integrity check; treat a FAIL here as a go-live blocker.

---

# PART 0 â€” Pre-flight (do this first; it's the real blocker)

You cannot test "all roles" without one account per role. Staff are **invite-only** (no self-signup). Use Gmail **plus-addressing** so every test inbox lands in your own `jlawrenceang@gmail.com` â€” e.g. `jlawrenceang+admin@gmail.com`. Gmail delivers all `+anything` aliases to you.

### 0.1 Provision the role accounts

| # | Account | How to create | Email to use |
|---|---|---|---|
| 0.1.1 | **Owner** | already exists (failsafe) | `jlawrenceang@gmail.com` |
| 0.1.2 | **Admin** | Owner â†’ `/admin/account` (staff accounts â†’ invite) â†’ invite, role = admin | `jlawrenceang+admin@gmail.com` |
| 0.1.3 | **Operations** | same invite flow, role = operations | `jlawrenceang+ops@gmail.com` |
| 0.1.4 | **Cashier** | same, role = cashier | `jlawrenceang+cash@gmail.com` |
| 0.1.5 | **Checker** | same, role = checker | `jlawrenceang+check@gmail.com` |
| 0.1.6 | **CSR** | same, role = csr | `jlawrenceang+csr@gmail.com` |
| 0.1.7 | **Customer A** | self-signup at `/register` â†’ then Owner approves at `/admin/approvals` | `jlawrenceang+custa@gmail.com` |
| 0.1.8 | **Customer B** | self-signup at `/register` (leave *pending*, don't approve â€” used for negative tests) | `jlawrenceang+custb@gmail.com` |

> **purchaser** role (fuel module) is **not invitable from the UI and has no front-end** â€” skip it (see Part 9).

**Invite mechanics to verify as you go:**
- Each invite sends an email with a set-password link â†’ opens `/reset-password` â†’ set a password â†’ first login.
- Staff log in with the **email** you invited (the address with `@`). A staff *username* without `@` maps to `<user>@ktc-staff.local` internally â€” for these tests just use the email addresses above.
- If MFA enrolment is forced, complete it; note the recovery codes.

| ID | Test | Expected | Result |
|---|---|---|---|
| PF-01 | ðŸŸ¢ Invite each of the 5 staff roles | Invite email arrives for each; set-password link works; first login lands on the role's home (adminâ†’`/admin`, opsâ†’`/app/operations`, cashierâ†’`/app/payment-orders`, checkerâ†’`/app/checker`, csrâ†’`/app/support`) | |
| PF-02 | ðŸŸ¢ Customer A signup â†’ approve | After Owner approval, Customer A can reach `/job-order` and file (no "pending" banner) | |
| PF-03 | ðŸ”´ Customer B left pending | Customer B sees the pending/awaiting-approval banner and **cannot** file a job order | |

### 0.2 Seed the data a lane needs

| ID | Test | Expected | Result |
|---|---|---|---|
| PF-10 | ðŸŸ¢ At least one **consignee** exists for Customer A | Owner/admin can add via `/admin/consignees`, or Customer A requests one and CSR/admin approves; the consignee shows in Customer A's filing dropdown | |
| PF-11 | ðŸŸ¢ At least one **vessel visit** exists | `/admin/vessel-schedule` has a visit (or the Google-Sheet sync ran); it appears in the filing vessel picker | |
| PF-12 | ðŸ’° A **service / DEA rate** is configured so charges compute | When a job order is filed, a base charge is seeded with a non-zero amount (not â‚±0). If amounts are â‚±0, fix pricing in `/admin/settings` before continuing | |

---

# PART 1 â€” Public / unauthenticated lane (no login)

Open these in a **private/incognito window** with no session.

| ID | Test | Expected | Result |
|---|---|---|---|
| PUB-01 | ðŸŸ¢ Open `/login` | Login screen renders; no console crash | |
| PUB-02 | ðŸŸ¢ Open `/register` | Signup form renders; consent/agreement shown | |
| PUB-03 | ðŸŸ¢ Open `/agreement`, `/terms`, `/privacy`, `/irr` | Each renders the legal copy | |
| PUB-04 | ðŸŸ¢ Scan/open a **Verify QR** `/verify/<job-order-id>` for a real order | Shows order status, containers, and PAID / NOT-PAID + a charges table | |
| PUB-05 | ðŸ’°âš ï¸ SHIPPED v2.0.7 â€” Verify a job order that is paid on the base charge **but has an unpaid add-on** | The headline does **NOT** say PAID while any billed charge is unpaid â€” it reflects *all* charges (add-ons included). | |
| PUB-06 | ðŸ”´ Try a protected URL with no session, e.g. `/admin`, `/job-orders`, `/account` | Redirected to login / `/` â€” never renders the protected screen | |
| PUB-07 | ðŸ”´ Try `/verify/<random-non-existent-id>` | Graceful "not found" â€” no crash, no data leak | |

---

# PART 2 â€” Customer lane (the primary money path)

Login as **Customer A** (`+custa`).

### 2A. Filing

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-01 | ðŸŸ¢ `/job-order` â€” file with valid consignee, entry number, vessel visit, 1â€“3 containers | Order created with status **submitted**; appears in `/job-orders`; a base charge is seeded | |
| CUST-02 | ðŸ”´ File with a duplicate entry number / missing required field | Rejected with a clear message; no order created | |
| CUST-03 | ðŸŸ¢âš ï¸ SHIPPED v2.0.7 â€” paste/add **150 containers** in one order | Accepts up to the raised cap (200); a 150-van C-entry files successfully (backend now caps at 200, not 100). | |
| CUST-04 | ðŸ”´ Try to exceed the max container cap (e.g. 250 rows) | Blocked with a clear "at most N containers" message before/at submit â€” not a silent truncation | |
| CUST-05 | ðŸŸ¢ Print the slip `/job-order/<id>/print` | Slip renders with the Verify QR; QR resolves to `/verify/<id>` | |
| CUST-06 | ðŸŸ¢ Cancel a submitted order (if allowed pre-processing) | Status â†’ cancelled; reflected in `/job-orders` | |

### 2B. Charges & payment (ðŸ’° the spine)

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-10 | ðŸŸ¢ Open a billed charge in `/job-orders` â†’ upload payment proof | Proof uploads; charge `payment_status` â†’ **submitted**; awaiting cashier confirmation | |
| CUST-11 | ðŸ’° Pay-before-final-invoice is **intentional** here | Customer **can** submit proof before the final ERP/BIR invoice â€” this is by design (the final invoice is released only after payment, so it acts as the gate pass). This should work, not be blocked. | |
| CUST-12 | ðŸ”´ Try to "pay" a charge that is not yet billed (proposed) or already confirmed | No uploader offered / rejected â€” only billed + unpaid/rejected charges are payable | |
| CUST-13 | ðŸŸ¢ After cashier confirms (Part 6), re-open the order | Charge shows **confirmed/paid**; balance reflects it | |
| CUST-14 | ðŸ’° Order does **not** auto-complete while any billed charge is unpaid | Order stays processing until every billed charge is confirmed AND all services (X-ray) done â€” then it auto-completes | |

### 2C. Release / gate pass (customer side)

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-20 | ðŸŸ¢ File a **release order** at `/releases` | Release created with status submitted; visible to CSR for doc verification | |
| CUST-21 | ðŸŸ¢ After CSR verifies + charges set, upload release payment | `payment_status` â†’ submitted; awaiting cashier | |
| CUST-22 | ðŸŸ¢ After cashier records the OR | Release â†’ released; reflected in `/releases` | |

### 2D. Customer self-service

| ID | Test | Expected | Result |
|---|---|---|---|
| CUST-30 | ðŸŸ¢ `/support` â€” open a ticket | Ticket created; visible to staff in `/admin/support` | |
| CUST-31 | ðŸŸ¢ `/requests` â€” request a consignee | Request created; visible to CSR/admin for review | |
| CUST-32 | ðŸŸ¢ `/vessels` | Vessel schedule renders (read-only for customer) | |
| CUST-33 | ðŸŸ¢ `/notifications` + enable push | Push permission prompt; a later staff action delivers a push | |
| CUST-34 | ðŸ”´ Direct-URL any `/admin/*` route as the customer | Bounced to `/` â€” never renders admin | |
| CUST-35 | ðŸŸ¢ SHIPPED 2026-07-01 - email change confirmation | In `/account`, request Email 1 -> Email 2. Confirmation must go to Email 2; Email 1 receives only a security notice. Account email changes only after Email 2 confirms. | |
| CUST-36 | ðŸŸ¢ SHIPPED 2026-07-01 - Lara compact avatar/chat | Lara launcher uses the new avatar, stays pinned to screen edges after moving, and the chat window has compact Messenger-style options plus minimize/close controls. | |
| CUST-37 | ðŸŸ¢ CURRENT WORKSPACE - New JO two-step filing | `/job-order` mobile shows Step 1 as consignee + C-entry + vessel + up to 10 verification images, Step 2 as containers. Desktop stacks the same sections as one page. Entry input normalizes to `C-...`; review shows entry + container count. | |
| CUST-38 | ðŸŸ¢ CURRENT WORKSPACE - New JO supporting images | Attach 1-10 images on Step 1, file the order, then open `/job-orders`; uploaded images appear in the order timeline/documents. Over-limit/non-image files show clear messages. | |
| CUST-39 | ðŸŸ¢ CURRENT WORKSPACE - Lara back/start/guided JO draft | Lara has Back and Start over controls, no mobile auto-focus jump, and **File with Lara** captures entry/vessel hints then opens New Job Order with the draft applied. | |
| CUST-40 | ðŸŸ¢ CURRENT WORKSPACE - customer vessel calendar/window | `/vessels` Cards/Table/Calendar all honor Show past/cancelled. Customer history is limited to current calls plus the last 7 days; calendar opens on a month with visible calls when needed. | |
| CUST-41 | ðŸŸ¢ CURRENT WORKSPACE - JO detail simplification | Opening a job order shows simpler JO typography, no release-ready block, **Summary of Charges**, Documents submitted jump, and a focused Containers/Qty modal. | |

---

# PART 3 â€” Owner / Root owner (super-admin failsafe)

Login as **Owner** (`jlawrenceang@gmail.com`).

| ID | Test | Expected | Result |
|---|---|---|---|
| OWN-01 | ðŸŸ¢ Reach **every** `/admin/*` route | All render; owner passes every gate (`*`) | |
| OWN-02 | ðŸŸ¢ `/admin/settings` â†’ Roles & Gates â†’ toggle a permission, save | Change persists; the affected role's access changes (re-test with that role) | |
| OWN-03 | ðŸŸ¢ Invite a staff member (any role) | Invite email sends; account created pending password set | |
| OWN-04 | ðŸ’° Reverse a confirmed charge (credit-note path) | Reversal recorded with an audit row in `/admin/charge-audit`; never a silent delete | |
| OWN-05 | ðŸŸ¢ Grant/revoke owner via `set_owner_access` (root-owner only) | Only the root owner can; a non-root owner cannot mint owners | |
| OWN-06 | ðŸ”´ Confirm owner **cannot be locked out** | Even with role rows removed, `jlawrenceang@gmail.com` still resolves as owner (email failsafe) | |
| OWN-07 | ðŸŸ¢ MFA crown-jewel gate | Owner-only sensitive RPCs require MFA (aal2) satisfied | |
| OWN-08 | ðŸŸ¢ SHIPPED 2026-07-01 - trusted 2FA device | Complete owner/admin MFA with **Trust this device for today** checked, sign out, then sign in again on the same browser. The app should resume without another code while backend gates still pass. In a private/new browser, MFA should still be required. | |
| OWN-09 | ðŸ”´ Trusted 2FA does not bypass password/session | Clearing browser storage or using a different device removes the trusted-device shortcut. A password-only session without the trusted token must still stop at the MFA challenge before admin content or privileged RPCs render. | |
| OWN-10 | ðŸŸ¢ CURRENT WORKSPACE - 2FA recovery from interrupted browser/app swap | Start owner Google/password login, reach MFA, switch to authenticator, close/reopen or return to `https://portal.ktcterminal.com/#`. The app must either resume the MFA challenge or show a retry/sign-out security panel; it must not stay on an infinite loading bar. | |

---

# PART 4 â€” Admin (full back office, except owner-only)

Login as **Admin** (`+admin`).

| ID | Test | Expected | Result |
|---|---|---|---|
| ADM-01 | ðŸŸ¢ `/admin` dashboard loads with counts | Renders; counts reflect approved data only | |
| ADM-02 | ðŸŸ¢ `/admin/approvals` â€” approve/reject a pending customer | Customer status changes; they gain/lose filing access | |
| ADM-03 | ðŸŸ¢ `/admin/customers` + `/admin/consignees` â€” manage | CRUD works; protected fields (role/owner) cannot be self-assigned | |
| ADM-04 | ðŸŸ¢ `/admin/job-orders` â€” accept a submitted order â†’ processing | Status â†’ processing via `staff_transition_order` | |
| ADM-05 | ðŸŸ¢ Record a **final invoice** (ERP + BIR) on a billed charge | `invoice_state` â†’ final; ERP/BIR numbers validated by format | |
| ADM-06 | ðŸ’° Approve an **add-on** charge created by someone else | Allowed; **maker-checker** holds â€” admin cannot approve an add-on they themselves created (CUST/ADM-07) | |
| ADM-07 | ðŸ”´ Try to approve an add-on **you created** | Rejected (approver â‰  creator) | |
| ADM-08 | ðŸŸ¢ `/admin/new-job-order` â€” file on behalf of a customer | Order created; `admin_file_job_order` | |
| ADM-09 | ðŸŸ¢ `/admin/vessel-schedule` â€” add/edit + "Sync sheet" | Edits save; sync pulls from the Google Sheet | |
| ADM-10 | ðŸŸ¢ `/admin/reconciliation`, `/admin/charge-audit`, `/admin/logs` | All render with data; audit trail present | |

---

# PART 5 â€” Operations (orders + X-ray + vessels; NO money)

Login as **Operations** (`+ops`). Home (post-login landing): `/app/operations` â€” the full back-office order list is at `/admin/job-orders`.

| ID | Test | Expected | Result |
|---|---|---|---|
| OPS-01 | ðŸŸ¢ `/admin/job-orders` â€” accept / hold / reject orders | Transitions work (gate `accept_orders` / `hold_reject_orders`) | |
| OPS-02 | ðŸŸ¢ Assess RPS on an order | Allowed (gate `assess_rps`) | |
| OPS-03 | ðŸŸ¢ X-ray queue monitor only | Operations can view order/X-ray state, but cannot confirm vans; confirmation belongs to Checker (`confirm_xray`) | |
| OPS-04 | ðŸŸ¢ `/admin/vessel-schedule` | Can manage (gate `manage_vessel_schedule`) | |
| OPS-05 | ðŸ”´ Reach money screens: `/admin/payment-orders`, `/admin/charges`, record invoice, confirm payment | **Screen body refuses** â€” operations has no `review_payments` / `record_invoice`. Nav should not show them; direct URL must also refuse | |
| OPS-06 | ðŸ”´ `/admin/approvals`, `/admin/customers`, `/admin/settings` direct URL | Refused (no `manage_approvals` / `manage_customers` / owner) | |

---

# PART 6 â€” Cashier (money lane only)

Login as **Cashier** (`+cash`). Home: `/app/payment-orders`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CASH-01 | ðŸŸ¢ `/app/payment-orders` â€” review a submitted payment | Proof visible; can confirm/reject (gate `review_payments`) | |
| CASH-02 | ðŸ’° Confirm a charge payment | Only confirms against a **final ERP+BIR invoice**; charge â†’ confirmed; order auto-completes if it was the last gate | |
| CASH-03 | ðŸ’° Reject a payment with a note | Charge â†’ rejected; customer can re-submit (CUST-10 again) | |
| CASH-04 | ðŸŸ¢ Create a **Payment Order** bundling several billed charges for one customer | `create_payment_order` â€” only billed, unbundled, same-customer charges; âš ï¸ SHIPPED v2.0.7: **release** charges now appear and can be bundled too | |
| CASH-05 | ðŸ’° Confirm a Payment Order with one collection OR number | `confirm_payment_order` records the OR, confirms each bundled charge | |
| CASH-06 | ðŸŸ¢ Record a final invoice (cashier has `record_invoice`) | invoice_state â†’ final | |
| CASH-07 | ðŸ”´ Try to accept / hold / reject an **order** | Refused â€” cashier lost `accept_orders` / `hold_reject_orders` (separation of duties) | |
| CASH-08 | ðŸ”´ Direct-URL `/admin/approvals`, `/admin/settings` | Refused | |

---

# PART 7 â€” Checker (X-ray confirmation; tablet)

Login as **Checker** (`+check`). Home: `/app/checker`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CHK-01 | ðŸŸ¢ `/app/checker` opens the scanner | Camera/QR scanner loads (native ML-Kit if using the Capacitor app; web camera otherwise) | |
| CHK-02 | ðŸŸ¢ Scan a container's Verify QR `/verify/<id>` | Resolves the order; checker can confirm the van's X-ray (e-signature) | |
| CHK-03 | ðŸŸ¢ Confirm the **last** van's X-ray on an order | X-ray service marked done; contributes the X-ray gate toward completion | |
| CHK-04 | ðŸŸ¢ Request a **re-X-ray** | Allowed (gate `request_rexray`); creates the re-X-ray sub-flow | |
| CHK-05 | ðŸ”´ Try to confirm a **payment** or reach `/app/payment-orders` | Refused â€” checker has no `review_payments` | |
| CHK-06 | ðŸ”´ Direct-URL `/admin/customers`, `/admin/settings` | Refused | |

---

# PART 8 â€” CSR (intake + comms + release docs)

Login as **CSR** (`+csr`). Home: `/app/support`.

| ID | Test | Expected | Result |
|---|---|---|---|
| CSR-01 | ðŸŸ¢ `/app/support` / `/admin/support` â€” answer a ticket | Works (gate `manage_support`) | |
| CSR-02 | ðŸŸ¢ File a job order on behalf of a customer | Works (gate `file_job_orders`) | |
| CSR-03 | ðŸŸ¢ Review/approve a **consignee request** | Works (gate `review_consignee_requests`) | |
| CSR-04 | ðŸŸ¢ Verify **release docs** on a release order | Works (gate `verify_release_docs`); release â†’ docs_verified | |
| CSR-05 | ðŸ”´ Try to **accept / hold / reject** a job order | **Refused** â€” CSR's accept/hold was revoked (maker-checker SoD, migration 0171). This is a key negative test | |
| CSR-06 | ðŸ”´ Try to confirm a payment / record an invoice | Refused (no `review_payments` / `record_invoice`) | |
| CSR-07 | ðŸ”´ Direct-URL `/admin/settings` | Refused | |

---

# PART 9 â€” Purchaser / Fuel module (DORMANT â€” skip)

| ID | Test | Expected | Result |
|---|---|---|---|
| FUEL-01 | â„¹ï¸ No action | The fuel module has **no front-end** and `purchaser` is not invitable. Confirm there is **no** `/fuel` route and no fuel nav tile. Out of scope for go-live | |

---

# PART 10 â€” Cross-cutting RBAC negative sweep (highest-value security test)

The `/admin/*` routes historically admitted **any** staff at the route level, relying on each screen + the backend to refuse. âš ï¸ SHIPPED v2.0.7 adds a **per-route permission guard** (now live). Run this matrix: for each restricted role, type each URL directly in the address bar and confirm the **screen body** refuses (not just a hidden nav tile).

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

> Record any URL where the **screen content** actually renders for a role that shouldn't see it â€” that is a go-live blocker.

---

# PART 11 â€” Money / billing-integrity invariants (ðŸ’° blockers)

These are the contract invariants. A FAIL here blocks go-live regardless of UI polish.

| ID | Invariant | How to test | Expected | Result |
|---|---|---|---|---|
| MON-01 | **No completion with unpaid billed charges** | Add a billed charge, leave it unpaid, complete X-ray, try to finish the order | Order will **not** complete until the charge is confirmed | |
| MON-02 | **Payment confirms only against a final invoice** | Try to confirm a payment whose charge has no final ERP+BIR invoice | Cashier confirm is blocked until invoice_state=final | |
| MON-03 | **Maker-checker on add-ons** | Same person creates + approves an add-on | Blocked (ADM-07) | |
| MON-04 | **Reversal, never delete** | Reverse a confirmed charge | Credit-note + audit row, original preserved | |
| MON-05 | **Auto-complete on last gate** | Confirm the final outstanding charge on an order whose X-ray is done | Order auto-completes immediately | |
| MON-06 | **Release charges flow through the spine** âš ï¸ SHIPPED v2.0.7 | Bill a release charge â†’ customer pays â†’ cashier confirms | Release charge is payable through the same Payment Order / charge path as JO charges | |
| MON-07 | **Verify QR reflects true paid state** âš ï¸ SHIPPED v2.0.7 | PUB-05 | Headline never says PAID while any billed charge (add-on/release) is unpaid | |
| MON-08 | **Payment Order = one customer** | Try to bundle charges from two different customers | Rejected | |
| MON-09 | **Payment Order = one consignee** âš ï¸ SHIPPED v2.0.8 | Try to bundle charges from two different consignees of the same customer | Rejected â€” the desk groups by consignee and the RPC enforces it | |
| MON-10 | **No bundling a charge with proof submitted** ðŸ’°âš ï¸ SHIPPED v2.0.8 | Customer uploads payment proof on a billed charge (â†’ submitted), then a cashier opens the Payment Order desk | The submitted charge is **visible** (for confirm/reject) but its bundle checkbox is **disabled**; the RPC also refuses it. It can't be settled twice (once by the customer's proof, once by a walk-in OR) | |

---

# PART 12 â€” Release / two-gate convergence

"Cleared for release" is **derived**, never stored: Payment gate (cashier) **AND** X-ray gate (checker) must both clear.

| ID | Test | Expected | Result |
|---|---|---|---|
| REL-01 | ðŸŸ¢ Order with X-ray done but payment unpaid | Shows **not** cleared (payment gate open) | |
| REL-02 | ðŸŸ¢ Order paid but X-ray not done | Shows **not** cleared (X-ray gate open) | |
| REL-03 | ðŸŸ¢ Both gates cleared | Shows **cleared for release**; Verify QR reflects it | |
| REL-04 | ðŸŸ¢ Standalone release-order lifecycle | submitted â†’ docs_verified (CSR) â†’ payable â†’ paid (cashier OR) â†’ released | |

---

# PART 13 â€” Secondary lanes

| ID | Test | Expected | Result |
|---|---|---|---|
| SEC-01 | ðŸŸ¢ Vessel schedule sync ("Sync sheet") | Pulls latest from the Google Sheet without error | |
| SEC-02 | ðŸŸ¢ Support ticket open â†’ staff reply â†’ close â†’ reopen locked rules | Lifecycle works; closed/locked behave per 0112 | |
| SEC-03 | ðŸŸ¢ Bulletin board: admin posts (with attachment) â†’ customer sees it | Post + attachment visible to customers | |
| SEC-04 | ðŸŸ¢ Web push: staff action â†’ customer/staff bell + push | Notification delivered (check the bell and the device) | |
| SEC-05 | â„¹ï¸ SMS / BOC mirror | **Dormant** â€” out of scope unless activated this session (see the SMS activation guide) | |
| SEC-06 | ðŸŸ¢ SHIPPED 2026-07-01 - bulletin archive | Admin/owner can archive a bulletin post; it disappears from the active customer board and remains recoverable in the archive section. Restore returns it to active view. | |
| SEC-07 | ðŸŸ¢ SHIPPED 2026-07-01 - published tariff images | Admin uploads up to 5 tariff images in Settings; customers open **View Published Tariff** in the rate calculator and see readable images with loading/error states. Uploads above the configured size are rejected. | |
| SEC-08 | ðŸŸ¢ SHIPPED 2026-07-01 - filled CIS print | Create/review a consignee request with CIS details; **Print Filled CIS** must render the entered fields, while blank CIS remains available. | |
| SEC-09 | ðŸŸ¢ SHIPPED 2026-07-01 - consignee request tracking | Customer-submitted consignee requests appear in `/requests` with submitted date, status, and admin remarks when present. | |

---

# PART 14 â€” Device / PWA / Checker scan

| ID | Test | Expected | Result |
|---|---|---|---|
| DEV-01 | ðŸŸ¢ Install the staff PWA on a phone/tablet | Installs; role-aware home loads | |
| DEV-02 | ðŸŸ¢ Checker scans a real container QR on a tablet | Native/Web camera opens; QR resolves to the order; X-ray confirm works | |
| DEV-03 | ðŸŸ¢ Mobile layout on the customer filing + payment screens | Usable on a phone; no overflow/clipping; Tagalog copy renders if locale = tl | |
| DEV-04 | ðŸŸ¢ Single-session enforcement | Logging in on a 2nd device prompts terminate/cancel on the first | |
| DEV-05 | ðŸŸ¢ SHIPPED 2026-07-01 - route transition loader | Navigate between public/auth pages and authenticated app pages. The KTC transition overlay appears as an intentional route-frame loader for about 1-1.5 seconds, then clears; the routed page must not blink, remount, or show a blank/template flash. | |
| DEV-06 | ðŸŸ¢ SHIPPED 2026-07-01 - menu sheet stability | Open customer and admin bottom-nav menus repeatedly on mobile width. The sheet fades in with stable tile rows; no grid-template/frame flash appears before the tiles render. | |
| DEV-07 | ðŸŸ¢ CURRENT WORKSPACE - form routes do not transition-reset | While filling `/job-order`, switch steps/screens and return from app/browser focus changes. The form state remains intact; route transition animation is disabled on filing routes but still appears between modules. | |
| DEV-08 | ðŸŸ¢ CURRENT WORKSPACE - customer idle timeout 30 minutes | Customer web session warns at ~29 minutes and signs out at ~30 minutes. A fresh Google OAuth sign-in must not immediately show an old inactivity message. Staff/admin timeout remains 60 minutes; staff app scoped timeout remains separate. | |

---

# PART 15 â€” Android internal app lane (staff APK only)

Use a real Android phone/tablet. Sideload the current internal sandbox debug APK (`KTC-Test-sandbox-debug.apk`) and record its SHA256. This lane is **not** for customers: customer accounts use the web portal only.

Preconditions:
- Android 7+ device, camera available, network toggle available (Wi-Fi or mobile data off/on).
- Current debug APK installed fresh, or app data cleared before the run.
- Test the app in both light/dark and en/fil if you are doing the full lifecycle matrix.
- Native push requires Firebase `google-services.json` + Supabase native-push secrets; until those are armed, treat cloud push registration as **configuration-pending**, not a smoke FAIL. Local notifications must still work.

| ID | Test | Expected | Result |
|---|---|---|---|
| APK-01 | ðŸŸ¢ Install / open the internal APK | App installs as **KTC Portal**, launches without a browser address bar, and shows the normal login flow | |
| APK-02 | ðŸ”´ Log in as **Customer A** inside the APK | Customer is blocked by the **Internal staff app** screen; app explains customers should use the web portal and the **Open customer web portal** button opens `https://portal.ktcterminal.com` outside the app | |
| APK-03 | ðŸŸ¢ Log in as **Checker** | Lands on `/app/checker`; bottom/footer shows **Device** and **Open full portal**; scanner screen uses large touch targets | |
| APK-04 | ðŸŸ¢ Native QR scan | Camera permission prompt appears; granting it opens the ML-Kit QR scanner; a real `/verify/<id>` QR opens the matching order | |
| APK-05 | ðŸŸ¢ Native haptics on scanner outcome | Successful scan / confirmed X-ray gives a success vibration; invalid QR or scan error gives error feedback. If the device has no haptic motor, note N/A | |
| APK-06 | ðŸŸ¢ Confirm X-ray while online | `record_van_xray` succeeds; the order refreshes; van row changes to confirmed; no duplicate confirmation is created on refresh | |
| APK-07 | ðŸŸ¢ Yard offline outbox | Turn network off, open a processing X-ray order already loaded, confirm a van. The app does **not** attempt money/payment work offline; it queues only the yard X-ray confirmation and shows the offline saved message | |
| APK-08 | ðŸŸ¢ Reconnect / background sync | Turn network back on or reopen/resume the app. Queued X-ray confirmation syncs through the normal server RPC, moves to **Synced**, and local alert says sync finished | |
| APK-09 | ðŸ”´ Offline money guard | While offline in the APK, try to reach cashier/payment lanes by role or direct URL as checker/ops/customer | Wrong roles are refused by route permission; no payment proof, invoice, Payment Order, OR, or money action is queued locally | |
| APK-10 | ðŸŸ¢ `/app/device` native-only screen | Shows platform/model/Android version/network/OTA bundle, push toggle, local yard note, and yard outbox; screen is reachable only for staff in the APK | |
| APK-11 | ðŸŸ¢ Local device storage workflow | Save a **Yard note**; it persists after app close/reopen; **Clear local** removes local notes/outbox rows after confirmation | |
| APK-12 | ðŸŸ¢ Local notifications | Tap **Test local alert** on `/app/device`; Android notification permission appears if needed; local alert fires on the device | |
| APK-13 | ðŸŸ¢ Share sheet | Tap **Share device status**; Android share sheet opens with platform/network/outbox/OTA status text and can send to SMS/Viber/Messenger manually | |
| APK-14 | ðŸŸ¢ OTA readiness | `/app/device` shows an OTA bundle status (built-in/current bundle or a readable updater error). The app does not crash if Capgo is not yet activated | |
| APK-15 | ðŸŸ¢ Role-aware APK homes | Operations â†’ `/app/operations`; Cashier â†’ `/app/payment-orders`; CSR â†’ `/app/support`; Admin/Owner â†’ `/admin`; each still obeys Part 10 RBAC direct-URL refusals | |
| APK-16 | ðŸŸ¢ Lock / shared tablet behavior | Tap **Lock** or wait for idle timeout; app signs out and returns to login. Next user does not see the prior user's role/outbox state except device-local unsynced yard items | |
| APK-17 | ðŸŸ¢ Android permissions audit | App requests only expected permissions: internet, camera, notification, network state, vibration, FCM/wake/boot support for notifications. No contacts/location/storage permission prompt appears | |
| APK-18 | ðŸŸ¢ App lifecycle matrix | Repeat APK-03 to APK-13 in light/dark and en/fil at least once; no clipped text, broken Tagalog strings, or role leak in either mode | |

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

**Go-live decision:** all lanes green + zero open ðŸ’° invariant FAILs + zero RBAC content-leaks â†’ cleared. Any FAIL â†’ fix â†’ re-run the affected lane before clearing.

---

## Fixes shipped 2026-07-01 - go-live walkthrough hardening (prod + sandbox through migration 0236)

These rows were added after the blind walkthrough hardening checkpoints and are live on production deployment `ktc-joborderform-6bbtfhqfl` (commit `830bd2a`). DB migrations `0233`-`0236` are applied to production and mirrored to sandbox:

1. **Bulletin archive (`0233`)** - archived posts disappear from active customer board and remain restorable. -> SEC-06.
2. **Published tariff images (`0234`)** - admin upload up to 5 tariff images; customers view them in the calculator modal. -> SEC-07.
3. **Customer email-change flow (`0235`)** - confirmation goes to the new email; old email receives a security notice only. -> CUST-35.
4. **Trusted MFA sessions (`0236`)** - owner/admin can trust the current browser for the day after a real MFA challenge; backend gates still use `aal_satisfied()`. -> OWN-08/09.
5. **Route/menu transition hardening** - route-frame KTC loader appears for about 1-1.5s and menu sheets no longer flash a grid template. -> DEV-05/06.
6. **Lara avatar/chat polish** - new avatar image, edge-pinned movable launcher, compact chatbot options, minimize/close. -> CUST-36.
7. **CIS and request tracking** - filled CIS print mirrors entered data; customer consignee requests show status/date/remarks. -> SEC-08/09.

The blind-walkthrough list is **not fully closed** by these fixes. Continue using the Result column to record any mismatch; use `docs/audits/2026-07-01-go-live-hardening-independent-review.md` for the current review/open-risk notes.

---

## Current workspace addendum - 2026-07-01 batch 2 (pending deployment/smoke)

Implemented in the current working tree after commit `c309cbd`; verify with build/deploy before marking shipped:

1. **New Job Order filing UX** - `C-` entry formatter, 2-step mobile filing, vessel moved to first screen, up to 10 supporting images, review count. -> CUST-37/38.
2. **Auth/session stability** - OAuth sign-ins stamp fresh activity, customer web idle window changed to 30 minutes, MFA assurance reads no longer reload on token refresh and show retry/sign-out on failure. -> OWN-10, DEV-08.
3. **Form transition hardening** - route transition overlay skips filing routes to avoid form disruption while keeping module transitions. -> DEV-07.
4. **Lara hardening** - larger supplied avatar, no mobile autofocus jump, no option glyphs, Back/Start over controls, guided JO draft handoff, documented map. -> CUST-39.
5. **Customer vessel schedule** - Show past/cancelled applies to cards/table/calendar, with customer-visible history capped to current + 7 days. -> CUST-40.
6. **Job-order detail simplification** - simpler JO typography, release-ready block removed, charge heading changed to Summary of Charges, documents jump and containers modal added. -> CUST-41.

---

## Fixes shipped this session â€” v2.0.7 + migration 0228 (deployed to prod 2026-06-30)

These were the âš ï¸ rows. All are **live** (frontend pushed `850b46f`; migration `0228` applied + verified on prod):

1. **Container cap** â€” backend raised 100â†’200 to match the 150â€“200 editor (`0228`). â†’ CUST-03/04.
2. **Verify-QR PAID headline** â€” now reflects *all* billed charges incl. add-ons/release, not just base/RPS. â†’ PUB-05, MON-07.
3. **Release charges parent-aware** â€” Payment Order desk + `submit_charge_payment` authorize through both job_orders and release_orders (`0228`). â†’ CASH-04, MON-06.
4. **Per-route `/admin/*` guards** â€” restricted roles bounced from direct URLs, not just hidden nav. â†’ Part 10.
5. **Stale type defs** â€” charge contract centralized (`service | rps | addon | release`, nullable `job_order_id`, `release_order_id`); stale `'xray'` literal removed.

If a âš ï¸ row still shows the *old* behavior, the Vercel build may not have propagated yet (give it a few minutes) â€” it's not a FAIL.
