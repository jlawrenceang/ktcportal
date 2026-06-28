# KTC Portal — Process-Gap & Coherence Audit (Triage Catalog)

_Date: 2026-06-28 · Sources: a 21-agent process/workflow-gap sweep (128 findings across all 18 domains — the **i18n** domain re-run after an initial failure, see §6) + an 8-agent system/agent map + 31-item incoherence sweep across 5 lenses. Scope of the gap sweep was explicitly **process/workflow gaps — stubs, dead-ends, empty paths, unbuilt features — NOT bugs or security issues.**_

## 1. Executive summary

The portal's core lifecycles (job orders, releases, payments, consignee requests, support tickets) are internally complete end-to-end; the gaps cluster at the **seams** (notifications, cross-screen handoffs, role landing) and in **promised-but-unbuilt affordances** (stale manual/chatbot copy, orphaned RPCs, the entire fuel desk). After merging true duplicates, this catalog holds **107 distinct process gaps** in four impact tiers (including 11 i18n localization gaps, §6) plus **31 coherence mismatches**. Seven are go-live blockers (T1): a silently-failing Google button, a name-change re-verification that can't re-upload its ID, pending-customer copy that promises filing the backend now forbids, an unrecoverable rejected-consignee dead-end, a walk-in RPS payment with no cashier path, a pending cohort with no support channel, and an agreement-version bump that never forces re-consent. The largest single bloc (18 items, all T4) is the deferred fuel-monitoring module + purchaser role — backend-complete, zero frontend, parked by design. The dominant coherence theme is **ADR-0035 ops-overhaul drift**: the 2026-06-27 doc-sync updated the newest vault pages but left older-stamped cores, the Administration page, several ADRs (0016/0018), and six memory notes describing the pre-overhaul model (cashier completing orders, all-supplements completion gate, single serving lane + manual restore).

## 2. Counts

### By tier
| Tier | Meaning | Count |
|---|---|---|
| **T1** | Go-live blocker (dead-end / silent no-op a launch user hits) | 7 |
| **T2** | Ops gap (degrades real operations; has a workaround) | 41 |
| **T3** | Polish / UX / dead-code cleanup | 41 |
| **T4** | Future module / intentionally deferred | 18 |
| **Coherence** | doc/code/spec/agent/memory mismatches | 31 |
| **Total gaps (T1–T4)** | | **107** |

### By domain (T1–T4 gaps)
| Domain | T1 | T2 | T3 | T4 | Total |
|---|:--:|:--:|:--:|:--:|:--:|
| auth-onboarding | 2 | 2 | 2 | – | 6 |
| customer-jo | 1 | – | 3 | – | 4 |
| release | – | 4 | – | – | 4 |
| consignee-cis | 1 | 5 | 1 | – | 7 |
| vessel | – | 1 | 2 | – | 3 |
| cashier-pay | 1 | 4 | – | – | 5 |
| checker-lanes | – | 4 | 1 | 1 | 6 |
| notifications | – | 2 | 5 | – | 7 |
| support-lara | 1 | 2 | 2 | – | 5 |
| settings-roles | – | 2 | – | 1 | 3 |
| dashboard-logs-security | – | 1 | 4 | – | 5 |
| fuel | – | – | – | 10 | 10 |
| bulletin | – | – | 4 | – | 4 |
| calculator-rates | – | 3 | 2 | – | 5 |
| staff-pwa | – | – | 5 | – | 5 |
| manuals-tours | – | 3 | 5 | 1 | 9 |
| integrations-crons | – | 2 | 1 | 2 | 5 |
| purchaser-role (cross-cut) | – | – | – | 3 | 3 |
| x-completeness (cross-cut) | 1 | 2 | 1 | 1 | 5 |
| **i18n** | – | 5 | 6 | – | 11 |
| **Total** | **7** | **41** | **41** | **18** | **107** |

_Counts reflect post-dedup distinct items; ~15 source findings were merged (fuel/purchaser cluster, doc-verification stub, roles-&-gates matrix, consignee/vessel staff-notification, vessel needs-info, cron-monitor, now-serving). Every merged source is cited in its item's **Sources** line._

## 3. System + agent map (condensed)

### 3.1 Core entities (with state machines)

| Entity | States | Driver highlights |
|---|---|---|
| **job_orders** | `held · submitted · processing · on_hold · completed · cancelled · rejected` | `file_job_order` (approved-only, 0163); `staff_transition_order` (accept/hold/reject/complete gates); `held→submitted` on approval trigger; **rejected is TERMINAL** (0154 forces `rejected_recoverable=false`); **two-gate complete** = all services done AND payment confirmed AND (RPS not needed or paid) AND every BILLED supplement confirmed (`jo_ready_to_complete`, 0101/0181); auto-completes via 0097/0172 triggers. |
| — sub: `payment_status` | `unpaid→submitted→confirmed\|rejected` | `submit_payment_proof` (cust) → `review_payment` (gate `review_payments`); base confirm now requires ERP invoice on file (0177). |
| — sub: `rps_status` | `not_assessed→not_needed\|needed` | `record_rps_assessment` (gate `assess_rps`); `needed` adds an `rps_payment_status` mirror machine. |
| — sub: `priority_status` | `null→requested→granted\|denied` | `request_priority`→`review_priority` (gates `request_priority`/`approve_priority`, 0174). |
| — sub: `rexray_status` (child JO) | `requested→approved\|denied` | `request_rexray`→`review_rexray` (gates `request_rexray`/`approve_rexray`, 0175); child suffixed JO-####A; `rexray_billable` decides free vs chargeable. |
| **serving_numbers** | active(n) ↔ vacated(0); lanes `xray·dea·oog·other·queue·priority·rexray` | assigned on submitted/processing, vacated on on_hold/rejected/cancelled/completed (0173); **weekly Monday reset**; line-jump ONLY via priority lane; `restore_serving_number` **dropped** (0182). |
| **release_orders** | `submitted · docs_verified · payable · paid · released · on_hold · cancelled` | file→verify docs (`verify_release_docs`)→set charges→pay (cust)→confirm (`review_payments`)→record OR (`review_payments`/`record_invoice`). Release path is **cash-only (OR-INV)**; BI-INV/credit deferred (0129). |
| **release_supplements** | payment `unpaid·submitted·confirmed·rejected` | `add_release_charge` (verify gate); **no void/edit path**; unconfirmed supplement blocks OR. |
| **consignees** | `pending · approved · rejected · needs_info` | `request_consignee`→`review_consignee` (gate `review_consignee_requests`/`is_admin`); `needs_info→pending` via `resubmit_consignee`; approval guard needs address+TIN+2303 (grandfathers legacy, 0167). |
| **jo_supplements** | payment `unpaid·submitted·confirmed·rejected`; bill `requested·billed` | ops `request_supplement` (no amount) → cashier/admin `bill_supplement` (sets amount, 0176); only BILLED-unpaid block completion (0181). |
| **support_tickets** | `open · answered · closed` | customer msg→open; staff reply→answered; `set_ticket_status` (gate `manage_support`); locked-close 0112. |
| **customers (account)** | `pending · approved · rejected · suspended` | register→confirm email→pending (verify-only, 0163)→upload ID→admin decides; `guard_broker_protected_fields` allows only self `rejected→pending` & `approved→pending`; suspend/reject cancels open JOs (0153) but **NOT open releases**. |

### 3.2 Role × permission matrix (seeded defaults; owner retunes any cell at runtime; `is_owner` bypasses all)

| Permission | admin | operations | cashier | checker | csr | purchaser |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| view_job_orders | Y | Y | Y | Y | Y | – |
| file_job_orders | Y | Y | – | – | Y | – |
| accept_orders | Y | Y | – | – | – | – |
| hold_reject_orders | Y | Y | – | – | – | – |
| complete_orders | Y | Y | – | – | – | – |
| process_job_orders | Y | Y | – | – | – | – |
| confirm_xray | Y | – | – | Y | – | – |
| view_xray_queue | Y | Y | – | Y | Y | – |
| assess_rps | Y | Y | – | – | – | – |
| review_payments | Y | – | Y | – | – | – |
| record_invoice | Y | – | Y | – | – | – |
| request_priority | Y | Y | – | – | Y | – |
| approve_priority | Y | – | – | – | – | – |
| request_rexray | Y | Y | – | Y | – | – |
| approve_rexray | Y | – | – | – | – | – |
| verify_release_docs | Y | – | – | – | Y | – |
| review_consignee_requests | Y | – | – | – | Y | – |
| manage_consignees | Y | Y | – | – | – | – |
| manage_approvals | Y | – | – | – | – | – |
| manage_customers | Y | – | – | – | – | – |
| manage_pricing | Y | – | – | – | – | – |
| manage_vessel_schedule | Y | Y | – | – | – | – |
| manage_support | Y | – | – | – | Y | – |
| view_fuel_reports / manage_fuel / log_fuel | Y | – | – | – | – | Y |

Role intent: **admin** = full back office (only role with `is_admin()` broad RLS) · **operations** = ops floor/queue/assessor · **cashier** = money lane only (SoD-trimmed 0171) · **checker** = per-van X-ray confirm only · **csr** = intake + comms · **purchaser** = fuel module only (backend-only, no frontend). Customers (`staff_role` null) → `has_permission` always false. Staff minted via `admin-create-staff` edge fn + `promote_new_staff` (owner-only); legacy `create_staff` revoked (0119).

### 3.3 Route / RPC inventory highlights

- **Public (anon)**: `verify_job_order` (slip QR), `log_client_error`. Public routes: `/login`,`/register`,`/confirmed`,`/forgot-password`,`/reset-password`,`/verify/:id`,`/agreement`.
- **Role landing** (`App.tsx:74`): checker→`/app/checker`, operations→`/app/operations`, cashier→`/app/cashier`, csr→`/app/support`, admin/owner→`/admin`, else customer→Home. **purchaser matches none → falls to customer Home** (see T4 purchaser cluster).
- **Staff PWA** focused screens: only `/app/checker` (AppChecker) is purpose-built; `/app/cashier`,`/app/support`,`/app/operations` reuse the dense desktop page in slim chrome.
- **NO-CALLER / dormant (client-callable but unreferenced in src):** `request_vessel`, `my_vessel_requests`, `resubmit_vessel_request` (no vessel-request UI); `now_serving` (no NowServing board); `record_xray` (superseded by `record_van_xray`); `restore_serving_number` (superseded by priority lane, then dropped 0182); `respond_to_hold`, `resubmit_rejected` (reject terminal 0154); `save_customer_info`/`customer_info_complete`/`my_company_info_complete` (CIS gate reverted 0136). Dormant tables/config: **accreditations** (ADR-0007 disabled), `gcash_number` payment_info row, `erp_series_min/max` guard (no UI), `disposable_email_domains` (no admin UI), entire **fuel** cluster (7 tables, 7 views, no UI).
- **Governance structural issues (from the agent-layer map):** ADR index `docs/adr/README.md` omits ADR-0035 (exists, Accepted); `docs/README.md` stale (cites ADRs 0001–0029, ST01–ST05); `MEMORY.md` carries a frozen 2026-06-10 "29 migrations / 0028-0029" narrative blob contradicting the live 174-files/0183 state; `01-System/Operational Invariants.md` pointer omits `purchaser`. (Detailed in the Coherence section.)

---

## 4. Tiered catalog

### T1 — Go-live blockers

**T1-01 · "Continue with Google" button is shown but silently no-ops** — `src/components/AuthRail.tsx:8-12`
Missing: `signInWithGoogle()` discards `{ error }`; provider config + consent-screen branding still open (go-live-todo §3), so the button produces no redirect, no error, nothing. _Affects:_ every signed-out visitor on the public access rail. _Fix:_ capture/surface the error (reuse Notice) and gate/hide the button behind a runtime flag until the provider is configured. _Effort: S · Confidence: high · Domain: auth._

**T1-02 · Name-change re-verification cannot re-upload the ID it promises** — `src/pages/Account.tsx:80-100` (+ `VerifyId.tsx:75`, `BrokerStatusBanner.tsx:30`)
Missing: on name change, `status` flips to `pending` but `valid_id_path` is not cleared, so `/verify-id` redirects away and the banner shows "verifying…" with no upload prompt — admin re-reviews the OLD ID against the NEW name. Hard dead-end within the 3-day ID-retention window. _Affects:_ any approved customer who renames. _Fix:_ also set `valid_id_path=null` on re-verification, or add an explicit "replace ID" affordance. _Effort: M · Confidence: medium · Domain: auth._

**T1-03 · 'Held' filing state is unreachable, but the manual + chatbot still tell pending customers they can file** — `manual-customer.md:19`, `chat/nodes.ts:187,568`, `MyJobOrders.tsx:21,279,493-497`, `Home.tsx:33`
Missing: 0163 made filing approved-only ("Your account can't file orders right now."), but the customer manual + Lara (`acct.pending_capabilities`, `status.glossary`) still promise "file Job Orders while you wait — up to 10 held," and the full held UI (label/edit/cancel/count) survives. A pending user follows the copy and hits a dead step. _Affects:_ the pending/unverified cohort (largest onboarding group). _Fix:_ rewrite manual + chat nodes + banner to "filing requires approval first," then strip or read-only the held branches. _Effort: M · Confidence: high · Domain: customer-jo._

**T1-04 · Rejected consignee request is an invisible, unrecoverable dead-end** — `0163_lock_pending_to_verify_only.sql:44-51`, `src/pages/MyRequests.tsx:48,80`
Missing: the 0163 SELECT policy hides `rejected` rows from the requester, so a rejected request vanishes from My Requests; re-requesting the same name fails on the global unique index, but the name isn't in the approved picker either — the name is bricked with no path forward. The `rejected` badge MyRequests ships can never render. _Affects:_ any customer whose consignee request is rejected. _Fix:_ either reserve reject for true duplicates (point them at the existing consignee) or let requesters see + re-request their rejected rows (reset same row to pending). _Effort: M · Confidence: high · Domain: consignee-cis._

**T1-05 · Walk-in / office RPS payment is unreachable once the base (X-ray) payment is confirmed** — `src/admin/CashierStation.tsx:118,207-209` (+ `record_office_payment`, 0091/0178)
Missing: the only "Record RPS office payment" button lives inside the `toCollect` bucket, gated on the BASE payment being unpaid. After base is confirmed, an order later assessed an RPS charge never re-enters `toCollect`, so a pure walk-in has no in-app path to settle RPS — and the completion gate requires RPS confirmed, so the order can't complete at the window. (`record_office_payment` already supports `p_kind='rps'`.) _Affects:_ cashier + any walk-in customer assessed RPS after paying X-ray. _Fix:_ add a dedicated "Collect RPS at the window" bucket independent of base-payment state. _Effort: S · Confidence: high · Domain: cashier-pay._

**T1-06 · Pending (verify-only) customers have no in-app support channel; Lara's whole pending branch is orphaned** — `src/components/Shell.tsx:113`, `chat/nodes.ts:135-142,556-574`
Missing: Lara mounts only for non-pending customers (`{!locked && !pending && <ChatWidget />}`), and the verify-only panel shows no phone/email/contact. The customer in the most confusing phase (awaiting ID verification, 48h deadline) cannot reach Lara, open a ticket, or see any contact — while a whole Lara branch authored FOR them is unreachable (and stale: still says "file held orders while pending"). _Affects:_ every pending/unverified customer; suspended/rejected users. _Fix:_ add a contact card to the verify-only panel and either render a restricted Lara or whitelist `/support` for pending (the `open_ticket` RPC already allows pending). _Effort: M · Confidence: high · Domain: support-lara._

**T1-07 · Agreement version bump never forces re-consent** — `0162_agreement_consent_enforcement.sql:53-58`, `src/components/ProtectedRoute.tsx:90-98`, `src/content/legal.ts:7`
Missing: `has_recorded_consent()` only checks `terms_version IS NOT NULL`; nothing compares stored consent to the current `AGREEMENT_VERSION` (now v4). A customer who accepted v3 passes every gate forever — so the planned counsel-final agreement bump (go-live-todo §22) is a no-op for existing accounts; there is no re-consent flow anywhere. _Affects:_ go-live legal requirement; every existing account on an agreement change. _Fix:_ add a version-aware re-consent gate in ProtectedRoute for ALL customers that blocks on mismatch and re-stamps via `record_agreement_consent`. _Effort: M · Confidence: high · Domain: x-completeness._

### T2 — Ops gaps (degrade real operations; workaround exists)

#### auth-onboarding
**T2-01 · No in-app 2FA / lost-authenticator recovery (no backup codes; owner self-lockout has no in-app path)** — `src/components/MfaChallenge.tsx:56-84`, `admin/Security.tsx:13`, `admin-reset-link/index.ts:46`
Missing: MFA challenge offers only Verify/Sign-out; enrollment generates no recovery codes; staff recovery is an out-of-band owner runbook; the owner's own lost authenticator is a full lockout (admin-reset-link can't bypass MFA). Go-live plans to enroll owner+staff in MFA, making this live. _Affects:_ all MFA-enrolled staff; owner failsafe. _Fix:_ recovery codes at enrollment + an owner-only server action to clear a staff factor; document an owner break-glass. _Effort: M · Confidence: medium._

**T2-02 · Staff have no in-app personal account screen (change own password/email; floor roles can't self-enroll 2FA)** — `src/admin/AdminShell.tsx:75-79`, `admin/Security.tsx:94-99`, `Settings.tsx:498-523`
Missing: customers get `/account`; staff get nothing equivalent — floor roles get no Settings link and Security is admin/owner-only (yet manual-cashier says cashiers may have 2FA). Synthetic `@ktc-staff.local` accounts have no mailbox, so they depend entirely on the owner running `reset_staff_password`. _Affects:_ every staff role. _Fix:_ a lightweight staff "My Account" (change password/email) reusing customer Account components; decide floor-role 2FA. _Effort: M · Confidence: medium._

#### release
**T2-03 · Entire release lifecycle fires ZERO customer notifications (no in-app/email/push)** — `0124_release_orders.sql` (whole file), `0071:14`, `NotificationBell.tsx:89`
Missing: no release RPC/trigger inserts a customer notification; the `notifications` table has no `release_order_id` FK and the bell has no `/releases` route. Customers learn nothing about payable/confirmed/rejected/OR-ready except by manually re-opening the Releases tab. _Affects:_ every release customer. _Fix:_ add `release_order_id` FK + a `notify_release_change()` trigger mirroring `notify_jo_change`; extend bell routing (push comes free). _Effort: L · Confidence: high._

**T2-04 · Release desk receives no staff notifications** — `0085_staff_notifications.sql:17-115`, `admin/Releases.tsx:109-110`
Missing: new releases and release-payment proofs fire no `notify_staff`; `staff_notifications` has no `release_order_id`. Docs desk + cashier discover work only via manual Refresh/polling. _Affects:_ documents desk, cashier. _Fix:_ add `release_order_id` + StaffNotificationBell routing + triggers on release insert / payment-submitted. _Effort: M · Confidence: high._

**T2-05 · Suspending/rejecting a customer leaves their in-flight releases live** — `0153_suspend_reject_cancels_open_jos.sql:8-29`, `0124:151-162`
Missing: 0153 cancels open JOs on suspend/reject but never touches `release_orders`; the customer release RPCs check only `customer_id`+`status` (no `broker_is_approved()`), so a suspended customer (and desks) can drive a release to `released`. _Affects:_ access-control consistency. _Fix:_ extend the customers status trigger to cancel open releases (skip paid/released and any with a submitted/confirmed supplement). _Effort: M · Confidence: medium._

**T2-06 · No way to void/correct a mistaken additional charge (supplement) — it permanently blocks the OR** — `0125_release_supplements.sql:58-73`, `0129:52-55`, `admin/Releases.tsx:401-414`
Missing: `add_release_charge` has no remove/edit/void counterpart; `record_release_or` refuses while any supplement is unconfirmed. A fat-fingered charge can never be cleared in-app, so the OR can never be recorded. _Affects:_ documents desk after any charge error. _Fix:_ a `void_release_charge` RPC (only while unpaid/rejected) + a Remove control. _Effort: M · Confidence: high._

#### consignee-cis
**T2-07 · Help chatbot still promises file-now for pending consignees (removed 0163)** — `chat/nodes.ts:144-152`
Missing: `consignee.add` says "you can still file the order now," but the picker is approved-only (`pickerSearches.ts:17`) and the success screen correctly says "file once approved." Bot contradicts the real flow. _Affects:_ customers requesting a new consignee. _Fix:_ rewrite the node to approved-only + "Track my request" → `/requests`. _Effort: S · Confidence: high._

**T2-08 · Full CIS contact fields are captured but orphaned in the admin UI + printed CIS** — `admin/Consignees.tsx:123,410-417,430`, `0166_consignee_cis_fields.sql`
Missing: 0166 added customer_name/address2/tel/mobile/email and the request RPCs persist them, but the admin load select, type, detail modal, edit modal, and `cisPrintUrl` all omit them — the data is write-only and the printed CIS is incomplete. _Affects:_ staff reviewing/printing a CIS. _Fix:_ add the columns to the type/select/detail/edit/print. _Effort: M · Confidence: high._

**T2-09 · Admin consignee add/edit cannot capture or replace the BIR 2307** — `admin/Consignees.tsx:73-81,294-301,394-405`
Missing: only a 2303 uploader exists; staff creating a consignee or attaching a withholding-agent's 2307 have no path (the customer form already captures both). _Affects:_ staff creating consignees for walk-ins/withholding agents. _Fix:_ generalize the uploader to tag 2303|2307 and add a 2307 input to add+edit. _Effort: S · Confidence: high._

**T2-10 · New consignee requests fire no staff signal; the CSR review role gets no pending badge** — `0183:174-218`, `useAdminCounts.ts:21`, `0086:65`, `0138:22` _(merged: consignee-cis + notifications)_
Missing: `request_consignee` calls no `notify_staff`; the nav badge is gated on `manage_consignees` (false for CSR) while CSR holds `review_consignee_requests` — so the role whose job is reviewing requests sees no count and nobody is notified a request arrived. _Affects:_ CSR + the request→review handoff. _Fix:_ add `notify_staff('review_consignee_requests',…)` to request/resubmit; gate the count on `review_consignee_requests`; scope it to customer-requested rows. _Effort: M · Confidence: high · Sources: consignee-cis#5, notifications#2._

**T2-11 · 'Approve all pending' is a silent no-op for CSV-imported / name-only consignees** — `admin/Consignees.tsx:215-231`
Missing: `approveAllPending()` filters on non-null address/TIN/2303, excluding exactly the name+code rows it claims to serve; 0120 made the approval guard a no-op, so single-approve works but bulk returns "Approved 0" with a false "incomplete can't be approved" dialog. _Affects:_ admin importing a master list. _Fix:_ drop the completeness filter (align with 0120) or split into two explicit actions. _Effort: S · Confidence: high._

**T2-12 · BIR 2303 required on customer/manual paths but bypassed by CSV import + seeded list, with no remediation owner** — `admin/Consignees.tsx:160-171`, `pickerSearches.ts:21-24`, `0120`
Missing: imported/seeded consignees can be approved + filed against with no 2303; the picker only cosmetically flags "docs pending" with no action and no path for customer or admin to backfill. _Affects:_ compliance/billing. _Fix:_ make "docs pending" an actionable worklist + attach path, or soft-block approval without 2303 except a grandfather flag. _Effort: M · Confidence: medium._

#### vessel
**T2-13 · Vessel needs-info review state has no customer recovery UI (dead-end notification)** — `admin/VesselSchedule.tsx:121-131`, `0138:177-189,211-226`, `NotificationBell.tsx:78-90` _(merged)_
Missing: ops can tag a vessel request "needs info," inserting `vessel_needs_info`/`vessel_rejected` customer notifications, but the customer can't view vessel requests, `resubmit_vessel_request` has no UI, and the bell routes vessel kinds to Home (no `/requests` branch, no icon). The recoverable path is unreachable. _Affects:_ customers who get a vessel needs-info/rejected notice. _Fix:_ add a My Requests vessel section + bell route/icon, OR stop emitting customer vessel notifications and drop the orphan RPCs. _Effort: M · Confidence: high · Sources: vessel#2, notifications#1, x-scenarios#3._

#### cashier-pay
**T2-14 · Walk-in BASE collection can't be completed inside the Cashier Station (invoice can't be recorded there for an unpaid order)** — `admin/CashierStation.tsx:122,206`, `0178:33-36`
Missing: since 0178 `record_office_payment` needs the ERP invoice on file, but the in-station "Record invoice" list excludes processing+unpaid walk-ins, so the cashier must leave to AllJobOrders to record the invoice — contradicting the station's own "without leaving the station" intent. _Affects:_ cashier on walk-in base collection. _Fix:_ broaden `toInvoice` to include live unpaid/rejected orders lacking an invoice, or fold invoice-capture into the Collect card. _Effort: S · Confidence: high._

**T2-15 · Ops-requested additional charges (awaiting cashier billing) are invisible + un-billable at the Cashier Station** — `admin/CashierStation.tsx:38,124-127`, `0176:34-59`
Missing: the station filters supplements on `amount > 0` (requested charges are amount-NULL) and never fetches `bill_status` or calls `bill_supplement`; the cashier's own money-lane step (0176) lives only on AllJobOrders. _Affects:_ cashier; charges sit unbilled. _Fix:_ add a "Charges to bill" bucket with an amount input calling `bill_supplement`. _Effort: M · Confidence: high._

**T2-16 · Base/RPS payment-review cards show no amount or balance** — `admin/CashierStation.tsx:131-141,155-163`
Missing: review cards render only JO number + name + Confirm/Reject; no peso amount/balance is fetched, yet the manual says to check the slip against the balance pill (which lives on AllJobOrders). The cashier confirms blind. _Affects:_ cashier payment review on the station they actually land on. _Fix:_ fetch lines + reuse the pricing breakdown to render a balance per card. _Effort: M · Confidence: medium._

**T2-17 · Credit (BI-INV) job orders have no distinct completion action** — `admin/CashierStation.tsx:88,118`, `0177:33`, `0101:40-48`
Missing: `record_service_invoice` (BI-INV) never sets `payment_status`, but completion requires `payment_status='confirmed'`; the only confirm-without-slip control is `record_office_payment` labeled "Paid at cashier office" — so a credit order completes only by mislabeling it as a cash collection. _Affects:_ on-account customers. _Fix:_ a distinct "billed on credit → complete" action or auto-confirm on BI-INV record. _Effort: M · Confidence: medium._

#### checker-lanes
**T2-18 · Desktop X-ray Checker never shows serving/lane number and the default table ignores priority order** — `admin/Checker.tsx:73,156-174`, `XrayQueueTable.tsx:37-58`
Missing: the default table view re-sorts by JO number (discarding the `servingKey` priority order) and has no Line/serving column; OrderCard shows no priority/re-X-ray chip. The priority lane is neither served ahead nor visible on desktop (mobile AppChecker is correct). _Affects:_ desktop checker; the priority feature. _Fix:_ add a lane-tagged Line column + default to lane order + add chips, reusing AppChecker helpers. _Effort: M · Confidence: high._

**T2-19 · Checker holds request_rexray but has no re-X-ray affordance at either checker station** — `0175:138`, `admin/Checker.tsx`, `app/AppChecker.tsx:216-236`, `AllJobOrders.tsx:679`
Missing: re-X-ray can only be requested on a COMPLETED order, but both checker queues filter to open statuses and neither renders the button — the only UI is on AllJobOrders. The checker must abandon the focused station to use a permission granted to them. _Affects:_ checker. _Fix:_ add Request re-X-ray to the checker app's lookup/detail when the order is completed. _Effort: M · Confidence: medium._

**T2-20 · Unapproved re-X-ray child sits in the checker queue with a Confirm button that always errors** — `0183:98-104`, `0181:72-74`, `Checker.tsx:108`, `AppChecker.tsx:73`
Missing: a requested-but-unapproved re-X-ray child appears in the queue with a live Confirm button; `record_van_xray` rejects it ("not been approved by an admin yet"), so the checker taps Confirm and just gets an error, with no "awaiting approval" badge. _Affects:_ checker. _Fix:_ exclude unapproved children from the queue or badge + disable Confirm (carry `is_rexray`/`rexray_status` into the SELECT). _Effort: S · Confidence: medium._

**T2-21 · Operations manual describes an X-ray-Checker landing + nav tabs the operations role doesn't get** — `manual-operations.md:3,10-11`, `App.tsx:80`, `AppLayout.tsx`, `Checker.tsx:198-232`
Missing: operations land on `/app/operations` (AllJobOrders) in a chrome with no tabs; the RPS-assess UI exists only in desktop Checker, reachable only via the full portal. The role's stated main workflow is neither on the landing nor in any tab. _Affects:_ operations. _Fix:_ route operations to `/app/checker` or add a role-aware tab strip; reconcile the manual. _Effort: S · Confidence: medium._

#### notifications
**T2-22 · Re-verification after a name change never pings the approvals desk** — `0085:134-147`, `Account.tsx:79-86`
Missing: `notify_staff_account` fires only on FIRST ID upload (`old.valid_id_path IS NULL`); a name-change re-pending (ID already non-null) never meets the condition, so the re-pending account sits unseen. _Affects:_ approvals desk. _Fix:_ add a branch pinging `manage_approvals` on any approved→pending transition. _Effort: S · Confidence: high._

**T2-23 · No notification history/inbox; both bells cap at 20 and the staff unread count under-counts** — `NotificationBell.tsx:49-63`, `StaffNotificationBell.tsx:42-70`
Missing: both centers load only the latest 20 with no "view all"; the staff bell derives unread from those 20 rows, so >20 unread shared notifications silently cap and older actionable work becomes invisible AND uncounted. _Affects:_ busy staff desks. _Fix:_ a notifications page + an exact-count unread RPC for the staff bell. _Effort: M · Confidence: high._

#### support-lara
**T2-24 · Lara routes payment tickets to "the cashier team," but the cashier role can't see the support inbox** — `chat/nodes.ts:729-734`, `0083:53-58`, `admin/SupportInbox.tsx:102`
Missing: `manage_support` is true only for admin+operations; cashier sees the "no access" screen, so payment tickets the bot promises the cashier are invisible. The inbox also has no category filter. _Affects:_ cashier + customers told their ticket goes to the cashier. _Fix:_ grant cashier a scoped payment-ticket view or change the copy; add a category filter. _Effort: M · Confidence: high._

**T2-25 · No way for staff/CSR to open a ticket on a customer's behalf** — `0112:33-43`, `admin/SupportInbox.tsx`
Missing: `open_ticket` is customer-only; SupportInbox has only reply/status — a CSR fielding a phone/walk-in/off-platform inquiry can't log it, and KTC can't proactively open a thread. _Affects:_ CSR/support handling off-platform contacts. _Fix:_ a `staff_open_ticket` RPC (gate `manage_support`) + a "New ticket" + customer picker. _Effort: M · Confidence: medium._

#### settings-roles
**T2-26 · Roles & Gates matrix omits 8 live, enforced permission gates** — `admin/Settings.tsx:1140-1158` vs `usePermissions.ts:5-30` _(merged)_
Missing: the owner's only permission editor renders 17 of 25 perms; absent are `verify_release_docs, review_consignee_requests, request_priority, approve_priority, request_rexray, approve_rexray, request_supplement, bill_supplement` — all seeded + enforced + consumed, but tunable only via hand-written migration. _Affects:_ owner SoD configuration. _Fix:_ drive the matrix from the role_permissions catalogue + a label map so new gates auto-appear. _Effort: M · Confidence: high · Sources: settings-roles#1, x-stub-sweep#3._

**T2-27 · RPS move-rate editor only edits the rate — no add/retire/reorder (unlike sibling editors)** — `admin/Settings.tsx:1029-1049`
Missing: `move_rates` has active/sort_order, but the editor exposes only the rate for the 5 seeds; ops can't add a new billable move or retire one without a migration (service-rate + charge-type editors have the full lifecycle). _Affects:_ ops managing the RPS catalogue. _Fix:_ bring to parity (active/sort/add/inactive-delete). _Effort: M · Confidence: medium._

#### dashboard-logs-security
**T2-28 · System health panel is unreachable by admins despite being built + documented for them** — `admin/Settings.tsx:553,1248`, `SystemHealth.tsx:15`, `0046:122-123`
Missing: `system_health()` is `is_admin`-gated and the component handles the admin case, but Settings renders the System tab only `{isOwner}` — so a plain admin can never open the cron/outbound/error snapshot the manual points them to. _Affects:_ admins. _Fix:_ expose the System tab to admins (keep the security-events section owner-gated) or tighten the RPC + fix the manual. _Effort: S · Confidence: high._

#### calculator-rates
**T2-29 · Terminal tariff (4 tables + 3 editors) has no live-billing consumer — calculator-only** — `Calculator.tsx:68-74` vs `Payment.tsx:43,59` + `pricing.ts:29-45`
Missing: `terminal_rates`/`storage_tiers`/`terminal_rate_config`/`shipping_line_charge_rules` are read only by the estimate calculator and written only by Settings; the money path reads only `service_rates`/`pricing_settings`/`move_rates`. The owner-maintained terminal tariff never produces a portal charge — the customer estimate is structurally disjoint from the bill (documented intentional, but a whole rate-config subsystem has no invoice path). _Affects:_ billing completeness; KTC-collects-terminal-fees workflow. _Fix:_ scope it as estimate-only OR build a `compute_terminal_charges` bridge (needs T2-30 first). _Effort: L · Confidence: high._

**T2-30 · `job_order_lines.size/fill/kind` are write-only-NULL dead columns — the "0141 new filing UI" was never built** — `ContainerLinesEditor.tsx:6-9`, `0141:7-8,92-96`
Missing: 0141 added size/fill/kind (header: "required in the new filing UI") and wired them through the RPCs, but the editor's `LineDraft` is only `{container_number, service_request}` and nothing ever reads/sends/displays them — so the 120-cell rate matrix can never bind to a real JO. _Affects:_ terminal-matrix billing; JO data completeness. _Fix:_ add size/fill/kind selects to the editor + both filing forms + print, or drop the unused columns. _Effort: M · Confidence: high._

**T2-31 · Calculator blocks every estimate without a scheduled current vessel** — `Calculator.tsx:235`
Missing: `canGenerate = hasVessel && totalQty > 0`, but only storage needs a vessel; when a line has no current vessels the customer is fully locked out of even a basic terminal-charge estimate. _Affects:_ customers estimating when no vessel is scheduled. _Fix:_ gate Generate on quantity alone; treat a missing vessel as "no storage estimate." _Effort: S · Confidence: medium._

#### manuals-tours
**T2-32 · Release / Pull-out module has no customer manual section and no tour** — `pages/Releases.tsx`, `manual-customer.md`
Missing: a full customer Release workflow (file→DO/BL→docs_verified→payable→pay→released, supplements, resubmit, cancel) is absent from the manual and has no tour — a customer would never learn it exists or what the statuses mean. _Affects:_ release customers. _Fix:_ add a manual section (en+tl) + a page tour + a Menu tour step. _Effort: M · Confidence: high._

**T2-33 · Admin release-management workflow is undocumented (no manual section, no tour)** — `admin/Releases.tsx`, `manual-admin.md`
Missing: verify docs / set charges / confirm payments / supplements / record OR / cancel appear in no manual and have no tour. _Affects:_ docs desk + cashier + admin. _Fix:_ add a Releases section to the admin (+ operations/cashier) guides and an admin page tour. _Effort: M · Confidence: high._

**T2-34 · CSR role + Support-inbox workflow have no written manual; CSR falls through to the admin guide** — `admin/ManualPage.tsx:24-30`, `AdminShell.tsx:61`, `manual-admin.md`
Missing: no `manual-csr.md`, no `csr` GUIDES entry, no floorGuide mapping — the support-inbox workflow that is the CSR's whole job is in no content file (only the in-app tour). _Affects:_ CSR. _Fix:_ add `manual-csr.md` (+tl) + GUIDES/ROLE_FLOWS + a Support section to the admin manual. _Effort: M · Confidence: high._

#### integrations-crons
**T2-35 · ERP link is manual transcription only — no Frappe API (no create, verify, or paid callback)** — `0126:6`, `0177:9`
Missing: `record_service_invoice`/`record_release_or` only format-validate + store a cashier-typed control number; zero programmatic ERP contact. The app's PAID state + payment-confirm gate hinge on a human typing a number that's never checked — a typo/fabricated number reads as paid; no reconciliation; the two governing decisions remain open. _Affects:_ financial integrity; cashier handoff. _Fix:_ an edge fn that verifies the control number against Frappe at record time, ideally a paid-webhook; add a reconciliation report. _Effort: L · Confidence: high._

**T2-36 · Release credit / billed-on-account (BI-INV) path is deferred — releases are hard-wired cash-only** — `0129:14`, `admin/Releases.tsx:556`
Missing: `normalize_erp_invoice_no` accepts only OR-INV and the release record-OR card hardcodes the OR-INV prefix; a release that should be billed on credit can't have its ERP number recorded, so it can never reach `released`. (UI + backend agree, so not a dead-end mismatch — the scenario is simply unhandled.) _Affects:_ credit/on-account release customers. _Fix:_ widen the validator + add a cash/credit selector (the JO side already does this), or drop the "handled later" comment if credit releases never happen. _Effort: M · Confidence: medium._

#### x-completeness
**T2-37 · Admin customer record (CustomerDetail) shows only job orders — releases + support tickets invisible** — `admin/CustomerDetail.tsx:56-70`
Missing: the per-customer page loads only the customer row + job_orders; never queries `release_orders` or `support_tickets`, so staff can't see a customer's release history or support threads from their record. (Minor: JO_STATUS map omits on_hold/rejected.) _Affects:_ staff servicing a customer. _Fix:_ add Releases + Support sections by `customer_id`; complete the status map. _Effort: M · Confidence: high._

**T2-38 · Disposable-email blocklist is a server-enforced signup gate with no admin management UI** — `0164:17-23`
Missing: `disposable_email_domains` (7,578 seeded) rejects signups server-side, but no UI reads/writes it — the owner can't whitelist a wrongly-blocked legit domain without direct DB edits (which runtime-data-safety makes deliberately awkward). _Affects:_ owner; a legit customer blocked at signup. _Fix:_ an owner-only Settings sub-panel + add/remove RPCs (gate `is_owner`), ideally an allowlist override. _Effort: S · Confidence: medium._

### T3 — Polish / UX / dead-code cleanup

#### auth-onboarding
**T3-01 · AwaitingEmailConfirmation gate is unreachable under email-confirm-ON, and its resend omits the CAPTCHA token** — `ProtectedRoute.tsx:9-56` — dead defensive UI; if reached its resend would always fail captcha_failed. _Fix:_ remove the dead branch or wire a Turnstile token. _Effort: S · Confidence: low._

**T3-02 · Dead signup ID-upload / contact / consent branch in AuthContext (no caller, unreachable under confirm-ON)** — `AuthContext.tsx:193-213` — leftover from an earlier signup-with-ID flow. _Fix:_ remove the dead branch + `SignUpExtras.idFile`. _Effort: S · Confidence: low._

#### customer-jo
**T3-03 · Recoverable-rejection workflow is orphaned (RPC has no caller; dead `rejected_recoverable` reads/query + stale admin manual)** — `MyJobOrders.tsx:275,521-532`, `0034:51`, `Home.tsx:35`, `manual-admin.md:16` — reject is terminal since 0154 but `resubmit_rejected` + the `rejected.recoverable=true` "needs action" branch + the manual still describe a panel that no longer exists. _Fix:_ drop the RPC/column reads/dead branch + fix the manual. _Effort: S · Confidence: high._

**T3-04 · Print slip fetches the serving/queue number but never renders it; no customer queue view anywhere** — `JobOrderPrint.tsx:17,53` — the slip selects `serving` into the order but never shows it, and MyJobOrders/Payment don't select it at all. _Fix:_ render the serving tag or drop the dead fetch. _Effort: S · Confidence: high._

**T3-05 · Free (non-billable) re-X-ray order renders a ₱0 "X-ray charges" pay box with an upload control** — `Payment.tsx:68,135,139,263-275` — a zero-total order isn't treated as settled; reachable mainly by direct `/pay` URL. _Fix:_ treat `total===0` as nothing-due. _Effort: S · Confidence: low._

#### consignee-cis
**T3-06 · CIS lists a Zero-Rating Certificate as required, but nothing in the system captures it** — `public/customer-info-sheet.html:137` — no column/upload/viewer for zero-rating. _Fix:_ add an optional doc path + inputs, or remove the line from the printed CIS. _Effort: M · Confidence: medium._

#### vessel
**T3-07 · Customer vessel-request RPCs are fully orphaned (no modal/page/caller); intended path is a support ticket** — `0137:9-32`, `0138:200-226`, `MyRequests.tsx:14-16` — a complete granted-to-authenticated subsystem with no UI; the real escape hatch is the `ticket.vessel` chat node. _Fix:_ retire `request_vessel`/`my_vessel_requests`/`resubmit_vessel_request` + the vessel notification kinds, OR build the VesselRequestForm + My Requests section. _Effort: M · Confidence: high · Sources: vessel#1, x-scenarios#3._

**T3-08 · Unlisted-vessel auto-request trigger + admin review panel are unreachable from any current UI** — `0068:40-58`, `VesselSchedule.tsx:305-345`, `JobOrder.tsx:92-114`, `NewJobOrder.tsx:61-79` — both filing paths now always send a resolved `vessel_visit`, so the trigger never fires for new orders and the review panel/badge can never repopulate after the 0068 backfill clears. _Fix:_ retire the trigger/RPCs/panel, or restore a live source. _Effort: S · Confidence: high._

#### checker-lanes
**T3-09 · "Now serving" board promised in manuals + customer tour, but `now_serving()` has no UI consumer and the manuals describe a strip/weekly-reset that doesn't exist** — `0100:35-47`, `manual-checker.md:10`, `manual-operations.md:10` _(merged)_ — no NowServing component anywhere; checker manuals claim "sorted by line number, Now serving strip on top" + "weekly line-number reset," contradicting the customer manual ("no serving number to wait on") and the actual lane-tag UI. _Fix:_ build a NowServing strip (higher value) OR drop the RPC + rewrite the manuals (en+tl). _Effort: M · Confidence: high · Sources: checker-lanes#1, manuals-tours#5._

#### notifications
**T3-10 · Unlisted-vessel requests raise no staff notification bell ping** — `0068:40-58`, `0137:9-32` — partial mitigation via the nav count badge, but the bell never signals (unlike payments/support/account/supplement/rexray). _Fix:_ emit `notify_staff('manage_vessel_schedule',…)` + bell icon/route. _Effort: S · Confidence: high._

**T3-11 · Orphaned `notify_serving_assigned` function re-created with no trigger** — `0178:84-98`, `0151:7-8` — 0151 dropped the trigger+function; 0178 recreated the function but not the trigger, leaving dead backend. _Fix:_ drop it (customer serving notification is intentionally retired). _Effort: S · Confidence: high._

**T3-12 · `under_review` notification kind whitelisted for email but never produced** — `0099:26` — a no-op whitelist entry; nothing inserts that kind. _Fix:_ build the event or remove the token. _Effort: S · Confidence: high._

**T3-13 · PushToggle `menu` variant is advertised but never mounted** — `PushToggle.tsx:6-14,60-68` — every mount uses `variant="bell"`; the menu branch is dead and device-push is only discoverable inside the bell. _Fix:_ surface it in the nav Menu or delete the branch. _Effort: S · Confidence: medium._

**T3-14 · Staff bell icon map missing kinds added after 0085 (`supplement`, `rexray`)** — `StaffNotificationBell.tsx:23-28`, `0183:24,108` — newer actionable pings render with the generic fallback icon. _Fix:_ add the two icons. _Effort: S · Confidence: high._

#### support-lara
**T3-15 · Lara "Document verification" node is an explicit placeholder ("a full step-by-step guide is coming shortly")** — `chat/nodes.ts:576-586` _(merged)_ — reachable from the account menu; TODO comment, holding answer only. _Fix:_ author the guide or remove the menu option. _Effort: S · Confidence: high · Sources: support-lara#2, x-scenarios#4, x-stub-sweep#4._

**T3-16 · Bug / "App & System" reporting has no menu/tile entry — reachable only by typing the right keyword** — `chat/nodes.ts:661-668`, `match.ts:30-31` — `bug.report`/`app_system` category has no click-through entry; tile-navigating customers can never reach it. _Fix:_ add a "Report an app problem" option to feedback.root. _Effort: S · Confidence: medium._

#### dashboard-logs-security
**T3-17 · Activity Log + System health show ~7 recorded security-event kinds as raw machine codes** — `eventLabels.ts:26-30`, `Logs.tsx:73`, `SystemHealth.tsx:19-22` — owner_granted/revoked, customer_status_changed, staff_password_reset, valid_id_deleted, sign_in, fuel_config_changed render as raw enums + JSON blobs. _Fix:_ one complete kind→label map + per-kind detail. _Effort: S · Confidence: high._

**T3-18 · System health cron monitor mislabels/omits 4 of the 8 active scheduled jobs** — `SystemHealth.tsx:24-30` _(merged)_ — keys the watchdog on the old `ops-watchdog-hourly` name (renamed `ops-watchdog`, 0046) and has no hints for `purge-expired-ids`/`remind-unpaid-orders`/`vessel-sync-hourly`. _Fix:_ fix the key + add the three hints (shared cron-name→hint registry). _Effort: S · Confidence: high · Sources: dashboard-logs-security#3, integrations-crons#6._

**T3-19 · Client-error stack trace + user-agent are captured but never surfaced anywhere** — `0045:21-29`, `Logs.tsx:79-80`, `errorReporting.ts:34-36` — `app_errors.stack`/`user_agent` are write-only; the Logs row shows one line with no expand. _Fix:_ an expandable detail that lazily fetches stack+UA; include in system_health payload. _Effort: M · Confidence: high._

**T3-20 · Admin dashboard is a 5-metric scoreboard but a work-surface for only 2 of the actionable queues** — `Dashboard.tsx:61-72`, `useAdminCounts.ts:15-42` — only pending accounts + consignee requests drill down; payment proofs, support tickets, vans-awaiting-X-ray, vessel requests are counted but not surfaced. _Fix:_ add the other backlogs as permission-keyed QueueSection rows, or rename/scope the section. _Effort: M · Confidence: low._

#### bulletin
**T3-21 · Posted bulletins cannot be edited (title/body/attachment) — only pin/hide/delete** — `BulletinBoardAdmin.tsx:70-74,154-156` — `patchPost` is generic but only called with pin/publish; a typo forces delete-and-repost (loses read state, may re-blast the pinned notification). _Fix:_ reuse the composer as an edit form. _Effort: M · Confidence: high._

**T3-22 · `sort_order` drives customer ordering but has no admin setter (manual reorder referenced, not built)** — `0076:15,29`, `BulletinBoard.tsx:31` — always 0; admin list and customer view order differently. _Fix:_ a drag-to-reorder upsert (copy service_rates) or drop the column. _Effort: S · Confidence: high._

**T3-23 · No scheduling or expiry — announcements never auto-clear and the customer board is unbounded** — `0076:9-18`, `BulletinBoard.tsx:27-36` — no publish_at/expires_at, no date filter, no limit. _Fix:_ optional schedule/expiry columns + filtered query + a `.limit()` backstop. _Effort: M · Confidence: medium._

**T3-24 · Composer cannot save a draft or pin at creation** — `BulletinBoardAdmin.tsx:48-68` — always inserts live+unpinned; "Draft" only reachable by posting then hiding; pin is a separate second click with a live-but-unpinned window. _Fix:_ add Publish/Draft toggle + Pin checkbox to the composer. _Effort: S · Confidence: medium._

#### calculator-rates
**T3-25 · Storage-tier band geometry is uneditable — admin can edit rates but not add/remove/reshape bands** — `Settings.tsx:357-359,854-864,375` — only the rate of pre-seeded bands mutates; day breakpoints/bands are frozen at the 0157 seed (a fresh env would show an empty, unfillable editor). _Fix:_ add/delete bands + editable boundaries with contiguity checks. _Effort: M · Confidence: high._

**T3-26 · Calculator estimate is a dead-end — no save, quote, print, send, or attach-to-order** — `Calculator.tsx:237-241` — the estimate evaporates on navigate; KTC keeps no record. _Fix:_ at least a print/save action (reuse the A6 slip), optionally a quotes table. _Effort: M · Confidence: medium._

#### staff-pwa
**T3-27 · Service worker push icon/badge point at `/app-icon.svg`, which does not exist** — `public/sw.js:17,73,74` — every push renders with the browser default (URL 404s); only PNG icons ship. _Fix:_ point at an existing PNG or add the SVG; reconcile the APK plan doc. _Effort: S · Confidence: medium._

**T3-28 · No "Install app" affordance on the focused app screens — the install-targeted roles never see it** — `AppLayout.tsx:45-81` — InstallButton lives only in the full-portal bottom-nav menus; a gate tablet must dig through Open full portal → Menu → Install. _Fix:_ render InstallButton in AppLayout (self-hides when standalone). _Effort: S · Confidence: medium._

**T3-29 · "Open full portal" hardcodes `/admin` instead of the role's work home** — `AppLayout.tsx:76` — drops restricted roles on the generic admin Dashboard they can't act on (AdminShell already computes a per-role home). _Fix:_ extract one role→home helper and use it. _Effort: S · Confidence: low._

**T3-30 · Manifest/TWA start_url carries an `?app=1` flag that nothing reads** — `manifest.webmanifest:5`, `twa-manifest.json:14` — the documented `ktc_app_mode` reader was never built; app mode is route-based. _Fix:_ drop the param or wire a reader. _Effort: S · Confidence: low._

**T3-31 · Only the checker has a purpose-built focused app; cashier/CSR/operations "app" screens are the full desktop page in slim chrome** — `RoleShell.tsx:9-10` vs `AppChecker.tsx` — an intentional shortcut, but the focused-app experience is half-built for 3 of 4 operational roles. _Fix:_ accept + document the reuse, or build focused variants (at least cashier). _Effort: M · Confidence: low._

#### manuals-tours
**T3-32 · Priority lane (request → approve) is undocumented in every manual + tour** — `AllJobOrders.tsx:327-341,669-676`, `Checker.tsx:40-44`. _Fix:_ document the gates/lane/chips + a tour step. _Effort: S · Confidence: high._

**T3-33 · Re-X-ray (request → approve → child JO, billable vs free) is undocumented in every manual + tour** — `AllJobOrders.tsx:343-356`, `Payment.tsx:66-68`. _Fix:_ admin/operations subsection + checker note + tour step. _Effort: S · Confidence: high._

**T3-34 · Customer consignee-request flow ("Request a new consignee" + My Requests) is undocumented and has no tour** — `ConsigneeRequestForm.tsx`, `MyRequests.tsx`, `manual-customer.md:27`. _Fix:_ manual §2 update (en+tl) + tour step + a /requests page tour. _Effort: S · Confidence: high._

**T3-35 · Customer Help & Support (tickets) and the Lara assistant are missing from the customer manual; /support has no tour** — `SupportTickets.tsx`, `manual-customer.md`. _Fix:_ add a Help & Support manual section + optional page tour. _Effort: S · Confidence: high._

**T3-36 · Pending vessel-request review is missing from the operations manual + vessel tour** — `VesselSchedule.tsx:62-65,305`, `manual-operations.md §4`. _Fix:_ add a review-queue note + a vesselSteps step. _Effort: S · Confidence: medium._

#### integrations-crons
**T3-37 · ERP accredited-series guard (`erp_series_min/max`) exists in the backend with no UI to configure it** — `0127:79`, `0129:43` — the guard rejects out-of-window control numbers but can only be armed via raw SQL; intentionally left unset. _Fix:_ expose two optional fields in Settings or remove the dormant guard. _Effort: S · Confidence: medium._

#### x-stub-sweep
**T3-38 · `gcash_number` payment-setting row is seeded but has no editor and no consumer** — `0036:50`, `Settings.tsx:963` — explicitly filtered out of the editor and never rendered on payment pages (all e-wallets route through the QR). _Fix:_ delete the orphaned row or restore it. _Effort: S · Confidence: medium._

#### x-completeness
**T3-39 · WatchWalkthroughButton is built + documented for Menu/Manual/Home but mounted nowhere — the walkthrough video is reachable only mid-tour** — `Walkthrough.tsx:7,50-58`, `WelcomeTour.tsx:50` — a returning customer who finished the tour has no standalone way to watch the freshly-produced 3.1 MB video; the reusable trigger is dead code. _Fix:_ mount the button in the Menu/Manual/Home, or delete it. _Effort: S · Confidence: high._

### T4 — Future module / intentionally deferred

#### Fuel-monitoring module (Phase 0 backend live, ADR-0025; zero frontend by design)
**T4-01 · Entire fuel module has no frontend — the Phase-1 admin fuel desk (`/admin/fuel`) does not exist** — `App.tsx:196-212`, design doc:50 _(merged)_ — 7 tables, 2 helpers, audit trigger, 7 views shipped; no route/nav/screen. _Fix:_ build the tabbed desk (deliveries/config/tank readings/reports) gated on the fuel perms. _Effort: XL · Confidence: high · Sources: fuel#1, x-scenarios#1, x-stub-sweep#1._

**T4-02 · Mobile pump logger (`/app/fuel`) referenced in design + ADR but not built** — `App.tsx:189-193`, design doc:51 — `fuel_dispense` was designed offline-safe for it; nothing consumes it. _Fix:_ a single-purpose logger on AppLayout (gate `log_fuel`). _Effort: L · Confidence: high._

**T4-03 · Fuel write-path RPCs named in ADR/design were never built; ledger tables have no caller** — ADR-0025:41, `0135:174-177` — `log_fuel_dispense`/`record_fuel_delivery`/`set_fuel_rate`/`set_fuel_setting`/`record_tank_reading` exist only in docs; 0135 grants raw table DML instead. _Fix:_ build the 5 definer RPCs then tighten grants to read-only. _Effort: M · Confidence: high._

**T4-04 · Seven derived reporting views are computed backend with zero reader** — `0135:203-285` — variance/inventory/payable/efficiency views have no screen. _Fix:_ a Reports tab over the views. _Effort: L · Confidence: high._

**T4-05 · Equipment master has no management UI — blocks all dispense logging** — `0135:14-24,74` — `fuel_dispense.equipment_id` is NOT NULL FK; with no way to populate equipment, no dispense can be logged. _Fix:_ an equipment management screen + a seed/import for the ~176 CSH units. _Effort: M · Confidence: high._

**T4-06 · Effective-dated rate/price config has no editor; the audit trigger never fires from a workflow** — `0135:27-48,183-197` — `fuel_settings`/`fuel_rates` seeded once, no editor; the effective-dated value prop is inert. _Fix:_ a Config tab inserting new dated rows. _Effort: M · Confidence: high._

**T4-07 · `move_tally` has no entry/import UI — the estimate + variance views produce nothing** — `0135:103-112,218-222` — the interim move-count input feeds the headline variance; empty until populated. _Fix:_ a move-tally entry/import screen (bounded-import pattern). _Effort: M · Confidence: high._

**T4-08 · Tank dipstick readings have no entry UI — inventory reconciliation is permanently incomplete** — `0135:91-100,265-267` — `dipstick_l` always null, so inventory variance can't compute. _Fix:_ a tank-readings form. _Effort: S · Confidence: high._

**T4-09 · Per-machine anomaly detection promised in ADR/design is not built even at the view level** — `0135:271-278`, design doc:40 — the shipped efficiency view computes only totals/avg, no L/move, L/run-hour, L/100km, or z-score peer flag (the headline differentiator over Excel). _Fix:_ extend the view + surface flagged units. _Effort: M · Confidence: high._

**T4-10 · Phase 0 "import the stopgap's history" deliverable has no import artifact** — ADR-0025:97, `scripts/` — no fuel/equipment/dispense/delivery importer, so the variance baseline has no loading path. _Fix:_ a bounded idempotent fuel-history importer. _Effort: M · Confidence: medium._

#### Purchaser role (DB-live since 0150, frontend deferred with the fuel desk)
**T4-11 · Purchaser role is uncreatable end-to-end — the sole staff-invite gateway rejects it** — `admin-create-staff/index.ts:22,59`, `Settings.tsx:53,581-587` _(merged)_ — `ROLES` whitelist + the create-staff dropdown both omit purchaser (`promote_new_staff` already accepts it). _Fix:_ add purchaser to the whitelist + dropdown when the desk lands. _Effort: S · Confidence: high · Sources: fuel#3, settings-roles#2, x-scenarios#2, x-stub-sweep#2._

**T4-12 · Purchaser role absent from the owner Roles & Gates matrix (+ the 3 fuel gates)** — `Settings.tsx:1134,1161,1140-1158` _(merged)_ — no purchaser column and no view_fuel_reports/manage_fuel/log_fuel rows, contradicting 0135's "owner-tweakable" comment. _Fix:_ add the column + gate rows. _Effort: S · Confidence: high · Sources: fuel#4, settings-roles#2._

**T4-13 · Purchaser role has no post-login landing, home route, nav label, or redirect — falls through to the customer Home** — `AdminShell.tsx:52-62`, `AppHome.tsx:20-25`, `App.tsx:79-82`, `AdminBottomNav.tsx:81-84` _(merged)_ — every role switch omits purchaser; a provisioned purchaser lands on screens it can't use. (Root cause: role-routing logic duplicated across 5 files — centralize a `roleHome()` helper.) _Fix:_ add purchaser branches → `/admin/fuel` once it exists; interim, hard-block assignment + show a "not yet available" screen. _Effort: S · Confidence: high · Sources: fuel#5, staff-pwa#1, x-scenarios#2, x-stub-sweep#2._

**T4-14 · Purchaser role has no manual, no tour, and no UI creation path** — `0150`, `Settings.tsx:581-587`, `ManualPage.tsx:24-30` — a standing manuals/tours gap once fuel ships. _Fix:_ add `manual-purchaser.md` (+tl) + GUIDES/ROLE_FLOWS + a tour. _Effort: M · Confidence: medium · Source: manuals-tours#10._

#### Other deferred modules
**T4-15 · No gate-in / gate-out (gate-scan) / EIR module; the checker flow ends at X-ray confirmed with no capture of physical gate movement** — `App.tsx:154-214` (no Gate/EIR route) — acknowledged north-star roadmap scope; the container/EIR + gate spine is the build-out ahead. _Fix:_ a `gate_events`/EIR table + a gate-scan screen wired to release "cleared"; keep it out of the manuals until built. _Effort: XL · Confidence: low · Source: checker-lanes#6._

**T4-16 · BOC Google Sheets mirror is fully built but never activated (no service-account creds)** — `boc-mirror/index.ts:53`, `0045:157` — the edge fn + hourly cron are a silent no-op until GOOGLE_SA_* / BOC_SHEET_ID are set (and a fresh `sbp_` token to deploy); status "built-awaiting-google-creds." _Fix:_ owner runs the one-time Google setup + reruns `setup-boc-mirror.mjs`; surface the "not configured" state in System health. _Effort: M · Confidence: high · Source: integrations-crons#1._

**T4-17 · Bounded admin Sheet→app import (staging + admin-confirm) is decided but unbuilt** — CLAUDE.md decision #11, Pending Items.md:67 — only one-time dev seed scripts exist; vessel-sync doesn't satisfy the general bounded-import decision (explicitly conditional). _Fix:_ defer until a concrete staff data-entry need; then a staging table + validated definer upsert + admin-confirm UI. _Effort: L · Confidence: medium · Source: integrations-crons#5._

**T4-18 · `accreditations` table + RLS exist but have zero consumers (per-broker accreditation dormant since ADR-0007)** — accreditations table, ADR-0007, `App.tsx:180-181` — the page was deleted 2026-06-11; a dormant backend, intentional/reversible. _Fix:_ formally archive/drop the table, or revive the request+review UI; document the choice in the ADR. _Effort: S · Confidence: low · Source: x-completeness#5._

---

## 5. Coherence (31 mismatches, grouped by kind)

_Runtime wins in every case below; each resolution fixes/archives the stale doc in the same change (doc-precedence ladder). Dominant theme: ADR-0035 ops-overhaul drift (0170-0183, 2026-06-27) — newest vault pages absorbed it; older-stamped cores, the Administration page, ADRs 0016/0018, and several memory notes did not._

### 5.1 doc ↔ code (doc_code_drift)
- **C-01 · APP_VERSION is v1.6.74 in runtime; all 3 live-snapshot docs still say v1.6.73** — runtime `src/version.ts:11` + a real CHANGELOG v1.6.74 entry vs Current State.md:14/12, System Scale.md:14, Home.md:16. _Fix:_ bump the figure in all three + add a v1.6.74 line to Current State. _Severity: medium._
- **C-02 · Role-flows says "Print slip (processing/completed)" — v1.6.74 made it available from `submitted` onward** — `role-and-operation-flows.md:278` vs `MyJobOrders.tsx:546`. _Severity: low._
- **C-03 · Administration core: operations "complete" + cashier "complete once paid" — ADR-0035 made completion automatic + the cashier money-only** — `Administration.md:23,25,41` vs 0171-0172. (Surfaced by both the currentstate and cores lenses — the one 02-Cores page skipped in the ADR-0035 doc-sync.) _Fix:_ operations "request charges" (not tag), drop cashier "complete once paid," note auto-complete. _Severity: high · Sources: currentstate#5, cores#2._
- **C-04 · System Scale Playwright "16/16 — 11 Phase 1 smoke" is stale — smoke suite now has 15 tests (0 fixme)** — `System Scale.md:21` vs `e2e/smoke.spec.ts` + CHANGELOG "15/15 green." _Severity: low._
- **C-05 · Current State "What is live" still says "one priority number per JO" — ADR-0035 replaced it with three auto-assigned lanes** — `Current State.md:127` vs 0173/0174/0175. _Severity: low._
- **C-06 · Cashier Station doc says cashier holds `complete_orders` + `hold_reject_orders` — 0171 stripped both** — `Cashier Station.md:21` vs `0171:9-11` (Staff Roles & Gates agrees). _Severity: high._
- **C-07 · Job Order Lifecycle §C lists cashier on the hold + complete gates** — `Job Order Lifecycle.md:62,64` vs `0171:9-11`; both gates are operations/admin only. _Severity: high._
- **C-08 · Docs claim the manual "complete" button is retired / no manual click — runtime still renders "Mark completed"** — `Job Orders.md:41`, `Staff Roles & Gates.md:17` vs `AllJobOrders.tsx:658-659`. (The button is a ready-state fallback; auto-complete just makes it rare.) _Severity: medium._
- **C-09 · Job Order Lifecycle §D describes one 'queue' lane + admin "↩ Restore #N" — runtime has 3 lanes and dropped restore** — `Job Order Lifecycle.md:75,76` vs 0174/0175 + `0182:43` (restore dropped). _Severity: medium._
- **C-10 · Process Flow Map ("as built today", 2026-06-25) predates ADR-0035 and says serving № is per-line** — `Process Flow Map.md:8,35,43` vs the post-0170-0183 model. _Fix:_ refresh diagrams or mark superseded → Job Order Lifecycle.md. _Severity: medium._
- **C-11 · tooling-inventory.md says smoke.spec.ts has 11 tests; it has 15 (testing-and-release.md already says 15)** — `tooling-inventory.md:49` vs runtime + `testing-and-release.md:53`. (Also a doc↔doc one-owning-file violation.) _Severity: medium._
- **C-12 · tooling-inventory.md scripts tables are incomplete vs `scripts/` on disk (24 scripts) despite the file's own update mandate** — `tooling-inventory.md:3,16-35`. _Severity: low._
- **C-13 · `src/lib/types.ts` staff_role comment lists only 3 roles; runtime has 6** — `types.ts:38` vs migrations 0056/0086/0150. (Here the agent docs are correct and the canonical types comment is wrong.) _Severity: low._

### 5.2 spec ↔ impl (spec_impl_mismatch)
- **C-14 · Two-Gate Completion rule #4 (supplements) is stale — runtime gates on BILLED-unpaid only, plus a re-X-ray exemption** — `Two-Gate Completion.md:19` vs `0181:26-27` + `0175:79`. Same stale phrasing in Job Order Lifecycle.md:100 §G. _Severity: high._
- **C-15 · Additional-Charge Supplements doc still describes ops `add_supplement(process_job_orders)` — superseded by request→bill (0176)** — `Additional-Charge Supplements.md:20,10,39,31` vs `0176:14,38,67` + `AllJobOrders.tsx:773`. _Severity: high._
- **C-16 · ADR-0018's core decision (a charge reverts a completed order to 'under review') was reversed in runtime with no addendum** — `0018-…md:1,37,39` vs `0183:30-31` + 0181/0182 (billed-only gate). Violates the README "add a dated addendum" rule. _Severity: medium._
- **C-17 · ADR-0016's authoritative seeded role-permission matrix is stale for cashier + csr (no addendum)** — `0016-…md:29` vs `0171:9-11` + the new 0174-0176 gates. _Severity: medium._
- **C-18 · ADR-0035 phase 2 says the manual "Mark completed" button retires, but it's still rendered** — `0035-…md:30` vs `AllJobOrders.tsx:658-659`. _Fix:_ remove the button or amend the ADR to "kept as fallback." _Severity: low._

### 5.3 doc ↔ doc (doc_doc_contradiction)
- **C-19 · Current State "Backend" section frozen at migration 0164 / "155 files" — contradicts its own top (0183) and System Scale (174 files)** — `Current State.md:133` vs line 14 + System Scale/Home. _Severity: medium._
- **C-20 · Authentication Core says "5 staff roles" — purchaser (0150) makes six** — `Authentication.md:17,28` vs Staff Roles & Gates.md:14,21. _Severity: low._
- **C-21 · AGENTS.md says it "does not restate rules" but restates the full 6-role matrix + two-gate + owner-grant rules — duplicating workflow-invariants.md / release-gate.md** — `AGENTS.md:3` vs `AGENTS.md:16` (values consistent, so a maintenance hazard, not a factual conflict). _Fix:_ trim AGENTS.md:16 to a pointer. _Severity: low._
- **C-22 · ADR index (`docs/adr/README.md`) is missing ADR-0035** — `README.md:7,47` (reading order "0001 to 0034") vs the Accepted 0035 file. _Severity: low._

### 5.4 agent-instruction ↔ runtime (agent_instruction_stale)
- **C-23 · architecture-overview labels `review_priority`/`review_rexray` as "permissions" — the real permission keys are `approve_priority`/`approve_rexray` (review_* are RPC names)** — `architecture-overview.md:58-60` vs `has_permission('approve_*')` (role-flows.md is correct). _Severity: low._
- **C-24 · tooling-inventory.md claims all KTC DB work goes through direct Postgres / SQL Editor — omits the now-standard Management-API-over-HTTPS path** — `tooling-inventory.md:40` vs `scripts/query-via-api.mjs` + `apply-migration-via-api.mjs` (the documented pooler-stall fallback). _Severity: medium._

### 5.5 memory ↔ runtime (memory_stale)
- **C-25 · MEMORY.md still pins "Latest migration = 0169" — runtime is 0183 (line 34 already says 0183)** — `MEMORY.md:4`. _Fix:_ drop the trailing 0169 high-water mark; keep one. _Severity: medium._
- **C-26 · Memory lists "restore serving #" as a live `process_job_orders` capability, but `restore_serving_number` was dropped (0182)** — `job-order-lifecycle.md:21`. _Severity: low._
- **C-27 · serving-number-edit-requeue note says "resubmit-after-reject → back of line (admin can restore)" — both halves are now false** — `serving-number-edit-requeue.md:19` vs 0154 (reject terminal) + 0182 (restore dropped). The note's core "edit keeps its number" rule is still valid. _Severity: medium._
- **C-28 · project_data_model memory still names `rpc('create_staff')` as the staff-creation path — that RPC is revoked (0119); table is `customers` not `brokers` (0021)** — `project_data_model.md:15,10`. _Fix:_ reconcile or archive with a stale-banner. _Severity: medium._
- **C-29 · MEMORY.md release-gates one-liner says "DO verification deferred" — DO verification is LIVE in the release module (0124)** — `MEMORY.md:32` (the note body already says it's live). _Severity: medium._
- **C-30 · release-gates-roadmap says the priority/serving number is "retired" and the 0081 restore-number is "vestigial" — superseded by ADR-0035 (priority lane revived 0173/0174; restore fully dropped 0182)** — `release-gates-roadmap.md:19`. The customer-facing "now serving" strip stays deleted, but the internal serving + priority lane are live again. _Severity: low._
- **C-31 · (governance-layer map note) MEMORY.md carries a frozen 2026-06-10 narrative blob ("29 migrations … Latest 0028/0029", held-broker lifecycle as live) duplicating + contradicting the vault's `07-Memory/` current-state owners (174 files / 0183, v1.6.73)** — the single largest stale-content liability in the governance layer; also `01-System/Operational Invariants.md:15` omits `purchaser`. _Fix:_ trim/replace the frozen blob; sync the pointer. _Severity: medium (advisory; from the agent-layer map's structural-issues list)._

## 6. i18n / Tagalog localization (addendum — re-run)

_The 18th domain, re-run after the original agent failed. Engine: the English string IS the key; Tagalog mode = `tl[key] ?? enSimple[key] ?? key`, so any string absent from `tl` silently renders English under Filipino. Measured: `tl` = 1,834 entries, `enSimple` = 379 (**0 missing — the formal layer is fully mirrored**); but ~78 unique `t()` literals + 53 tour strings have no `tl` entry. **No T1** — English fallback degrades gracefully, nothing dead-ends. 11 findings: 5 T2, 6 T3._

**Headline:** the language *gate* is well-built (offers Filipino everywhere incl. the staff PWA; `enSimple` 100% mirrored) — but what it gates into has decayed: the onboarding tour and the newest ops surfaces render English in Filipino mode. Root cause = no guard that new `t()` strings get a `tl` entry.

### T2 — ops gaps
- **I18N-01 · Demo tour is ~55% English under Tagalog (customer + staff)** — `WelcomeTour.tsx` (22/38 strings absent from `tl`), `AdminTour.tsx` (31/56), rendered via `Tour.tsx:118`. Fires right after the language gate, so a Filipino-choosing user gets a half-English onboarding. _Fix:_ add the missing tour strings + the I18N-05 guard. _Effort: M._
- **I18N-02 · ADR-0035 priority / re-X-ray / charge action cluster untranslated** — `AllJobOrders.tsx` ("Priority requested", "Request/Approve/Deny priority", "Re-X-ray…", "Request charge", "Bill", "Amount (₱) to bill — {label}", re-X-ray confirm). Note `Add charge` IS translated but its request-role twin `Request charge` is not. _Fix:_ add ~15 keys; align the pair. _Effort: S._
- **I18N-03 · Release / pull-out desk untranslated (admin + customer)** — `admin/Releases.tsx` (Documents desk, DO/BL, charge label, OR/ERP fields) + `pages/Releases.tsx` (BL Number, "Almost there", the full base-paid / released status sentences). _Fix:_ batch the release-desk keys. _Effort: M._
- **I18N-04 · Customer core banners + inputs untranslated (first-impression surfaces)** — `Shell.tsx:81-86` (pending-verification home), `BrokerStatusBanner.tsx:51`, `Login.tsx:308` (disposable-email hint), `Calculator.tsx` (Quantity/container), `MyJobOrders.tsx` (container vans), `AccountMenu.tsx`. _Fix:_ add keys; prioritize Shell/banner/Login. _Effort: S._
- **I18N-05 · ROOT CAUSE — no guard that every `t()` / TourStep string has a `tl` entry; copy edits silently revert to English** — systemic; evidence: reworded copy drifted ("Rate calculator" vs `tl`'s "Rate Calculator"; reworded checker tour; Request vs Add charge). Every ops overhaul added English strings; Tagalog silently decayed. _Fix:_ a CI/precommit check (seed scripts saved) that diffs `t()` first-args + TourStep literals against `Object.keys(tl)` and fails on new untranslated strings; pair with an "add the `tl` key in the same change" rule. _Effort: M._ **(Highest-leverage — stops recurrence.)**

### T3 — polish
- **I18N-06 · Consignee CIS / request-form labels untranslated** — `ConsigneeRequestForm.tsx`, `MyRequests.tsx`, `admin/Consignees.tsx` (TIN / Tel / Mobile / 2303 / 2307 / Address). _Effort: S._
- **I18N-07 · Cashier "Record invoice" field labels untranslated (section title IS translated)** — `CashierStation.tsx:145,220-229` (Invoice control no., Pad/serial, cash/credit hint, RPS/X-ray payment). Half-Filipino mid-task. _Effort: S._
- **I18N-08 · Admin Settings tabs + Vessel Schedule column headers untranslated** — `Settings.tsx` (Pricing & tariff / Access & staff / CSR / Purchaser / In-house), `VesselSchedule.tsx` (Arrival/Departure/Discharge Time, Week), + Bulletin "Attachment", JoTimeline. _Effort: S._
- **I18N-09 · Public slip-verify page bypasses i18n entirely** — `pages/Verify.tsx` (no `useT`; "PAID/NOT PAID", STATUS_LABEL, all labels hardcoded English). _Fix:_ decide intent (public artifact — may be deliberate); if localizing, wire `t()`. _Effort: S · Confidence: medium._
- **I18N-10 · No pluralization mechanism** — `i18n.tsx:42-45` plain `{var}` substitution; "1 container vans" is wrong in EN and untranslatable to Tagalog plurals. One site today (`MyJobOrders`). _Fix:_ special-case or a minimal `tn()` helper; don't over-build. _Effort: S · Confidence: medium._
- **I18N-11 · Crash error-boundary hardcoded English** — `ErrorBoundary.tsx:32-50`. Defensible (renders during a crash, can't use the hook). _Fix:_ accept, or pass a translated message from a wrapper. _Effort: S._

_Reusable audit scripts saved (`scratchpad/i18n-audit.cjs`, `tour-audit.cjs`) — the basis for the I18N-05 CI guard._
