---
title: Current State
tags: [memory, current]
type: memory
last_updated: 2026-06-30
---


# 📌 Current State (Runtime-Aligned)

## 2026-06-30 - Internal Android staff app SHIPPED (v2.0.11, migration 0232)

**`APP_VERSION` = `v2.0.11`; migrations through `0232` applied to prod.** This ship adds the internal Android staff-app lane on top of the already-live ADR-0037 charges cutover. The APK is staff-only, target-guarded, and built for sandbox device smoke; it does **not** open offline money workflows.

- **Target-safe build commands** - `target:status`, `dev:test`, `build:test`, `preview:test`, `build:android:test`, and live equivalents now make the Supabase target explicit. Sandbox builds refuse the production ref and show a yellow `SANDBOX DB` badge.
- **Bundled staff APK** - Capacitor packages built assets instead of loading `portal.ktcterminal.com` directly. Sandbox APK label = **KTC Test**; latest local build SHA256 `FEE72FD96A2D505E2F7B340F65E51D14552BC4B154DAC7F3B716B2DD978B4158`.
- **Native checker/device workflow** - customer accounts are blocked inside the APK and sent to the web portal. Staff get role-aware homes, native ML-Kit scanner feedback, haptics, local alerts, share-sheet status, `/app/device`, and a device-local outbox. The outbox queues **only** X-ray confirmations (`record_van_xray`) and binds them to the original signed-in staff user; payments/invoices/OR/Payment Orders remain online-only.
- **Native push scaffold (`0232`)** - `native_push_tokens` + RLS + notification triggers are live. `send-native-push` source is present, but Management API deploy failed with local `SUPABASE_ACCESS_TOKEN` 401; cloud native push remains dormant until a valid `sbp_` PAT deploys the function and Firebase/native-push secrets are set.
- **Verified before ship** - `target:status`, `lint`, `check:i18n`, `build:test`, `check-security-invariants`, and `build:android:test` passed. Real-device Part 15 smoke is intentionally deferred.

**Next** - run `docs/smoke-test-08-go-live.md` Part 15 on an Android device, then the all-roles/all-lanes smoke; arm native cloud push only after valid PAT + Firebase service-account secrets exist.


> **For sequencing of what's next, read [[Roadmap]].** This page is a runtime snapshot — *what is live today*.

## 2026-06-30 — ADR-0037 charges cutover SHIPPED + go-live hardening DEPLOYED (v2.0.10, migrations 0228-0231)

**The cutover the 06-29 entry below deferred is now LIVE, and three codex-review hardening passes are deployed on top. `APP_VERSION` = `v2.0.10`; migrations through `0231` applied to prod (`0228`-`0231` applied 2026-06-30 via `_apply_one.mjs`, verified live).** The `charges`/`payment_orders` spine is the live operational money path — the old base/RPS/supplement flow is retired. Fully break-tested (gates / RLS / RBAC / writes hold). See memory `cutover-shipped-go-live-status` + [[target-architecture-jo-payment-invoice]].

- **Cutover (≤`0227`)** — JO is the atomic move; **1:1:1 ERP/BIR invoicing** (draft→final); **Payment-Order N:1**; **payment-before-movement** bidirectional gate; supplements retired; completion = one rule reading `charges` (`0216`); release charges dual-written into the spine (`0214`/`0215`).
- **Go-live hardening DEPLOYED (v2.0.7, 2026-06-30, codex review; commit `850b46f` pushed + `0228` applied)** — **release charges payable** through `submit_charge_payment` (parent-aware, job_orders OR release_orders) + **container cap 100→200** across all three filing RPCs (and the previously-uncapped `update_job_order`). Frontend: **Verify-QR "PAID" headline now reads every billed charge** (add-ons can't hide under a paid base); **per-route `/admin/*` + `/app/*` guards** mirroring the nav GRID (a role that can't see a tile can't reach the URL); charge **type contract** centralized (`service|rps|addon|release`, nullable `job_order_id`, `release_order_id`); Android **CAMERA** permission added for the native checker scanner. Jarvis-verified SAFE TO SHIP.
- **Go-live hardening pass 2 DEPLOYED (v2.0.8, 2026-06-30, codex; `0229` applied)** — `create_payment_order` now (P1) refuses to bundle a **proof-submitted** charge (only `unpaid`/`rejected` bundle-able — closes the double-settlement window in the reverse direction of 0227) and (P2) enforces **one consignee** per PO (`coalesce(jo,ro).consignee_id is distinct from p_consignee`), plus the desk checkbox matches. P3 gate alignment: charge-audit page now gates `review_payments` (matching its RLS/route/nav, was `complete_orders`); `/app/checker` route gates `confirm_xray` (matching AppChecker, was `view_xray_queue`). Jarvis-verified SAFE TO SHIP.
- **Go-live hardening pass 3 DEPLOYED (v2.0.9, 2026-06-30, codex; `0230` applied)** — customer self-service writes now use `current_customer_id()` instead of the broader profile helper, blocking staff/admin rows from customer business RPCs by direct call (JO file/edit/cancel, release file/resubmit/pay, charge proof submit, support tickets, consignee request/resubmit). `/app/operations` no longer opens for broad read-only `view_job_orders`; Payment Order desk filters stale selected IDs to `unpaid`/`rejected`; the operations smoke row is monitor-only for X-ray. Google OAuth button is enabled through `VITE_GOOGLE_OAUTH_ENABLED=true` now that the provider is active.
- **SMS/Capacitor readiness (v2.0.10, 2026-06-30; `0231` applied)** — SMS remains dormant until gateway credentials are present and an admin sets selected notification rows to SMS/both. `send-sms` now uses SMSGate's current `/3rdparty/v1/messages` payload, `setup-sms.mjs` disarms Vault when gateway creds are absent, the trigger respects `notification_settings`, and `/account` exposes the customer SMS opt-out. Capacitor Android doctor/sync/debug build pass locally; release signing still needs the actual keystore password/new release keystore.
- **Pay-before-final-invoice is intentional** — the final ERP/BIR invoice is released only after payment, so it acts as the gate pass; customers may submit proof before the final invoice (owner-confirmed 2026-06-30). NOT a gap.
- **Next** — run `docs/smoke-test-08-go-live.md` (all roles + all lanes); operational onboarding (DEA rate, staff/broker accounts); owner side-by-side smoke walk; launch call.

## 2026-06-29 — X-ray Phase A anti-fraud billing BUILT (backend + frontend) — PRE-CUTOVER, old flow still live

**Migrations `0202`–`0211` applied to prod — all ADDITIVE (nothing dropped); the old base/RPS/supplement payment flow is still the live operational one. The new `charges`/`payment_orders` spine is BUILT + Jarvis-verified but NOT yet wired in — the cutover is deferred to a future session.** See [[2026-06-29 X-ray Phase A Anti-Fraud Billing Build (backend + frontend, cutover deferred)]]. In one line each:

- **Why** — the June-4-2026 open forum (X-ray queue pain, "questionable charges", bad CS) + the owner's discovery of **invoice fraud** (fictitious/copied invoices + unwarranted charges by staff or brokers). A **pre-launch POC for a stakeholder presentation** (~2–3 months); Frappe ERP integration deliberately deferred (manual invoice entry for now).
- **Architecture** (ADR-0037 Phase A + a dated addendum committed today) — the **JO stays the X-ray service request**; each billable (base X-ray, RPS move, add-on) is a row in a uniform **`charges`** table (NOT charge-as-its-own-JO). Spine: **container → moves** (dormant, owned by KTC's **existing TOS**) **→ charges → payment_orders**. The container becomes a **first-class record**; `container_cycles`/`container_events` are a **DORMANT, RLS-locked scaffold** = the future TOS-integration seam.
- **4 anti-fraud controls** — **authenticity** (server-issued, QR-verifiable charges), **authorization** (add-ons are maker-checker), **accountability** (every charge/approval/payment in a `charge_audit` trail; ~400 staff), **reconciliation** (monthly containers×rate vs cash).
- **Backend — `0202`–`0211`** — `0202` containers + dormant cycle/event scaffold · `0203` charges + payment_orders + `job_order_lines.container_id` · `0204` `consignee_rate_overrides` (per-consignee rates on one price spine) · `0205` `mfa_recovery_codes` + `notification_settings` · `0206` charge-lifecycle RPCs (the **universal invoice-before-confirm gate for every charge type**, maker-checker, payment orders, reversal, `charge_audit`) · `0207` MFA recovery RPCs (generate/redeem/owner-reset → MFA can be **mandated for money roles**) · `0208` `search_consignees` (PII-scoped, anti-scrape) + rate/notification editors + `get_xray_monthly_reconciliation` (admin-gated) · `0209` charge-gate hardening (folded the Jarvis findings) · `0210` **admin-only** billing cancellation (`cancel_charge`/`cancel_payment_order`) · `0211` `verify_job_order_charges` (public anti-forgery RPC).
- **Frontend — 10 new screens** (ultracode, typecheck-clean, additive) — customer **JobOrderCharges** + **VerifyCharges** (wired into MyJobOrders + Verify); cashier **PaymentOrderDesk**; admin **ChargeApproval** + **Reconciliation** + **ChargeAuditView**; Settings **SettingsRateOverrides** (Pricing) + **SettingsNotifications** (Operations); MFA **MfaRecoveryCodes** + **MfaRecoveryRedeem** + an owner-only **"Reset 2FA"** button. Tagalog copy pass in progress.
- **UI fix** — terminal-photo backgrounds were broken (referenced non-existent `/photos/hero-1..5.jpg`/`dash-admin.jpg`; real files are `/photos/1..23.jpg`); repointed + added a per-role **`AppBackdrop`** so every logged-in role (incl. the previously-blank admin/staff shell) gets a dimmed KTC aerial (theme-aware scrim via `--cc-canvas`).
- **Owner decisions** — one price spine + per-consignee special rates; keep consignee filing **open** but protect PII + block scraping (accreditation = future); serving number → **monthly reset, `YYMM-XXXX`** (deferred to cutover); completion = one boring-correct rule (deferred to cutover); cancellation **admin-only**.
- **Deferred to the cutover** (surgical, large blast radius) — `file_job_order` creates the base charge + upserts containers/`container_id`; one-rule completion reading `charges`; monthly serving `YYMM-XXXX`; tighten the consignee broker-read RLS (picker → `search_consignees`); staff JO-cancel → admin-only + block customer self-cancel once billing exists; **then** the destructive drops (`rps_payment_*`, `jo_supplements`/`release_supplements` as billing, `terminal_rates`, old invoice fields) — atomic, together → Jarvis + e2e + a data-isolated break-test. Also deferred to land **with** the cutover: user-facing manuals + demo tours + walkthrough video.

## 2026-06-29 — Audit Phases 2–4 shipped + Phase-5 verification + whole-app MFA gate + ADR-0037 (v1.7.0→v1.7.5)

**Migrations through `0201` applied to prod; `APP_VERSION` = `v1.7.5`.** See [[2026-06-29 Phase-5 Verification, v1.7.0-v1.7.5, MFA Gate, ADR-0037 Move-Spine]]. In one line each:

- **Audit Phases 2–4 shipped (v1.7.0)** — the unmerged ops gaps + staff manuals/tours + **full Tagalog i18n** (strict coverage guard) merged to main; two **dormant scaffolds** — SMS (`0193`, `send-sms`) + the BOC customs Sheet mirror (re-scoped to X-ray inspection) — awaiting owner activation creds.
- **2 live-bug hotfix (v1.7.1, `0194`)** — a release-supplement money gap (pay/confirm on a **cancelled** release) + the AppChecker/Checker **submitted-order dead-end** (post-`0187`).
- **Phase-5 UX/UI batch (v1.7.2)** — 13 **error-blind data loaders** → error+Retry (the read-side of "green tests, dead app"), shared **Modal**/**Notice** a11y, de-glassed Home tiles, Lara FAB hides on input focus, semantic-token aliases, a new **offline banner**, Approvals false-"ID removed" copy fixed, JO-filing confirmation, Brokers search+pagination; **e2e recalibrated** to an 8-config matrix (the smoke "14/14 fail" was a `BASE_URL=localhost` footgun, not stale selectors) + a `layout.spec` overflow guard; `0195` release-trigger ACL.
- **Security-audit fixes (v1.7.3, `0196`–`0201`)** — disposable-email table RLS lockdown, `cancel_release_order` base-payment guard, the **crown-jewel-RPC aal2-hardening** (`reset_staff_password`/`promote_new_staff`/`set_owner_access` now gate on hardened `is_owner()` — the **owner→staff-minting prevention**), JO `submit_supplement_proof` guard, staff-notif session gate, invoice-before-confirm trigger (base only); + the **Hybrid admin layout** (dense full-width ops console ≥1280px, app-like mobile/tablet) + Suspend retoned to danger-red.
- **Whole-app MFA gate (v1.7.4/v1.7.5)** — MFA now renders **before** the first-run setup; a top-level **MfaGate** wraps the whole app so the challenge can't be leaked at aal1. Owner **enrolled TOTP + rotated the owner password**. (Supabase TOTP has no native backup codes — recovery is server-side factor-deletion; proper codes = carry-over.)
- **ADR-0037 ratified (Accepted)** — every operational move = a JO; **1:1:1 ERP/BIR invoicing** (draft→final); **Payment-Order N:1**; **payment-before-movement** (bidirectional gate); retire supplements. A **pre-launch clean reshape**; **Phase A** (payment_orders + per-JO invoices + cashier gate) is the go-live compliance build. See [[target-architecture-jo-payment-invoice]].

## 2026-06-28 — Break-test security/integrity hardening (v1.6.77)

**Migration `0187` applied to prod; `APP_VERSION` = `v1.6.77`.** The security/integrity slice of the break-test mediums/lows (the first chunk of audit Phase 2): RPS guards (no confirm-on-unassessed / no assess-on-dead-order — KTC-14/15), terminal-reject retired (`resubmit_rejected` always-raises + backfill — KTC-13), checker can't X-ray an un-accepted order (KTC-16), `file_job_order`/`update_job_order` length caps + container-format + service whitelist (KTC-21/22/09-residuals), X-ray-only re-X-ray line copy (KTC-27), RLS gates on `payment_info`/`shipping_lines`/`role_permissions` (KTC-31/33), dead-count + unapproved-rexray-queue cleanup (KTC-25/26). Sandbox-verified + Jarvis-reviewed. KTC-20 re-framed (single-IP test artifact, not a real ceiling); KTC-32 left for owner decision.

## 2026-06-28 — Break-test critical+high fixes (v1.6.76)

**Migration `0186` applied to prod; `APP_VERSION` = `v1.6.76`.** A full-lifecycle break-test (sandbox `zwvzadkgeyhkhyshkwhc`, 17-agent ultracode run + 50×10 load) surfaced 33 findings ([[breaktest-2026-06-28]] / `docs/audits/2026-06-28-breaktest-findings.md`); the **12 critical+high** were fixed in `0186` and shipped, each verified by a 9-agent behavioral re-test (14/14 PASS) + an independent Jarvis code review. Headlines: `request_supplement` un-crashed (KTC-01), free re-X-ray can complete (KTC-02), no auto-complete with a billed-unpaid charge (KTC-03), payment can't confirm on a cancelled/rejected order (KTC-05/34), container-swap invalidates prior payment+X-ray (KTC-06), cancel guards a paid charge (KTC-07), `file_job_order` caps + service whitelist (KTC-08/09), consignee-request staff notification (KTC-11), privilege-escalation audit log fixed (KTC-17). Medium/low + two KTC-09 residuals remain open.

## 2026-06-28 — Phase 1 go-live blockers, owner-failsafe backstop, ops-overhaul doc-sync (v1.6.75)

**Migrations through `0185` applied to prod; `APP_VERSION` = `v1.6.75`.** In one line each:

- **Phase 1 go-live blockers — 7 T1 fixes** (v1.6.75) — Google sign-in button gated behind a runtime flag (no more silent no-op); name-change re-verification clears the old ID so the upload page reappears; all "file while pending / held" copy rewritten to the verify-only truth (pending can't file; held model retired); rejected consignee requests are recoverable (`0185`, below); a dedicated **Collect RPS at the window** cashier bucket (walk-in RPS after base is paid); pending customers get an in-app support channel (`/support` whitelist + contact card); and an **agreement re-consent gate** (`ReConsent`) that re-prompts customers on an `AGREEMENT_VERSION` bump.
- **Coherence doc-sync (31 items)** — runtime-vs-doc drift fixed across cores, ADRs (0016/0018/0035 addenda), the role matrix, and version/migration snapshots (chiefly ADR-0035 ops-overhaul drift).
- **Job-order slip printable from filing onward** (v1.6.74) — the printable slip + "Print slip" link (customer **and** staff) now appear from `submitted` onward (was `processing`/`completed`); status-aware watermark/banner; slip now carries Vessel & Voyage.
- **Owner failsafe hardened — email-keyed backstop** (`0184`) — `is_owner()`/`is_admin()` also return true when the JWT email is the owner's, so a missing/flag-wrong `customers` row can't lock the owner out (MFA still enforced). The old `jla.ktcport@gmail.com` "admin fallback" is now a **rejected customer** — there is **one** privileged account. See [[Owner Failsafe]].
- **Recoverable rejected consignee request** (`0185`) — a rejected consignee request is now visible in My Requests and re-requestable (was bricked by the global unique-name index).

## 2026-06-27 — Ops overhaul (ADR-0035), consignee approval gate, whole-app audit CLOSED (v1.6.73)

**Migrations through `0183` applied to prod; `APP_VERSION` = `v1.6.73`.** See [[2026-06-27 Ops Overhaul ADR-0035 + Whole-App Audit Closed]] + [[whole-app-audit-closed]]. In one line each:

- **Consignee approval gate + full CIS** (`0165`–`0169`) — a consignee must be **approved before it can be used to file** (mirrors the ID gate — "no limbo"); the full CIS is captured online; the **BIR 2303 rule is hard-enforced on every path** (admin / CSV / request / resubmit / approval-guard); JO filing refuses an unapproved consignee. Plus notifications **"Clear read"** + the test account reset to fresh pending.
- **Job-order ops overhaul** ([ADR-0035](../../adr/0035-job-order-ops-overhaul-queue-priority-rexray-autocomplete-invoice-gate.md), `0170`–`0177`) — **separation-of-duties** (CSR no longer approves; cashier money-only), **fully automatic completion** (from whichever side finishes last), **automatic queue lifecycle** (assign/vacate on status), a **priority lane** (request → admin approve), a **re-X-ray lane** (a completed order's re-inspection as an `A`-suffixed child JO; checker/ops request → admin approve; free now), **charges = ops-request → cashier-bill**, and **payment-requires-invoice** (base payment can't confirm without the ERP service invoice + BIR pad serial).
- **Whole-app ultracode audit → fixed + CLOSED** (`0178`–`0183`, v1.6.66–73) — a 75-agent audit surfaced **59 findings** (11 high), several from the overhaul; all live-impact ones fixed + re-verified by a closure workflow (which caught 1 regression). Financial-integrity holes, re-X-ray maker-checker + guards, the completion-breaking supplement gate, phantom balances, lane-tagged + priority-served serving numbers, vessel dedup data-loss, fuel-pricing-readable-by-anon, stale copy. Only the **parked fuel module's** 5 findings deferred to the Phase-1 desk; `check-security-invariants` green. See [[whole-app-audit-closed]].

## 2026-06-26 — Public landing, Lara, Google OAuth, consent enforcement, pending lockdown (v1.6.31)

**Migrations through `0164` applied to prod; `APP_VERSION` = `v1.6.31`.** A long public-facing + access-hardening run (`v1.6.18`–`v1.6.31`). See [[2026-06-26 Public Landing + Lara + Google OAuth + Consent Enforcement]]. In one line each:

- **Public landing** — signed-out `/` is now a real **Landing** page (orientation, **no forced accept gate**) via a `RootGate`; redesigned around real terminal photos (5-photo `HeroSlideshow`, responsive desktop card / mobile photo band, login + signup carry the same backdrop). `src/pages/Landing.tsx`.
- **Lara** ([[Lara (Customer Assistant)]]) — a deterministic **non-LLM** customer help assistant (93-node rule tree + keyword matcher), an RLS-scoped track-order action, and a `open_ticket` two-strike fallback. Customer Shell only; **no new route/table/migration**.
- **"Continue with Google"** (`0161`) — Supabase OAuth (email pre-verified) + a one-time **`FinishRegistration`** gate (in `ProtectedRoute`) collecting contact number + Agreement consent via `complete_oauth_registration`; scoped to Google users so email/password is unaffected. Owner must enable the provider + finish URL config.
- **Consent enforced server-side** (`0162`) — `file_job_order` / `open_ticket` refuse without `has_recorded_consent()` (gate **inside** the definer fn); consent columns server-stamped via a guard-trigger flag; one writer `record_agreement_consent`. See [[Broker Agreement]].
- **Pending → verify-only lockdown** (`0163`) — a `status='pending'` customer (incl. Google self-signup) is RLS-locked to ID-upload / status / Agreement / account basics; every business surface is hidden until approved. See [[RLS Posture]].
- **Disposable-email block** (`0164`) — `handle_new_user` rejects 7,578 throwaway domains (DB trigger = the wall; form hint advisory).
- **Customer Agreement → v4** — PH-legal redline: truthful privacy + owner-as-interim-DPO + NPC refs removed; liability cap re-pegged to the Service Invoice + **₱100k floor**; **affirmative re-acceptance** for material changes; authority-to-bind + Notices clauses.
- **Admin dashboard drill-down** — pending accounts + consignees surface as clickable rows below the count tiles (a work surface, not a scoreboard).

## 2026-06-25 — Release-desk reason now server-enforced (v1.6.13)

**Migration `0159` applied to prod; `APP_VERSION` = `v1.6.13`.** Closed ST05 **Defect D-01**: the release-desk RPCs `verify_release_order`, `confirm_release_payment`, and `confirm_release_supplement_payment` now **RAISE on a blank hold/reject reason** (on the `p_ok = false` branch), mirroring the JO side's `hold_job_order` guard. Backend-only defense-in-depth — the UI already disabled the buttons on a blank note; this stops a scripted client from holding/rejecting a customer's release with no explanation. See [[Pending Items]].

## 2026-06-23 — JO lifecycle overhaul, tiered storage, dropdown-only vessel, clickable consignees (v1.6.12)

**Migrations through `0158` applied to prod; `APP_VERSION` = `v1.6.12`.** A portal-focused day on a single contiguous lane (`0151`–`0158`). See [[2026-06-23 JO Lifecycle Overhaul + Storage Tiers + Consignee UI + Vessel Dedup]]. In one line each:

- **JO lifecycle** (`0151`–`0156`) — **reject is terminal** (no resubmit) and **on-hold is field-targeted**: staff tick which fields (consignee/entry/vessel/containers) the customer must re-enter via `needs_fields` (`hold_job_order` + `resubmit_needs_info`, `0154`). Rejecting a **consignee** (`0152`) or suspending/rejecting a **customer** (`0153`) cancels their open JOs **except** paid/invoiced. The customer **serving-number notification is retired** (`0151`; ops X-ray queue keeps its #). A unified **Balance/Paid** payment pill; additional charges are an admin-seeded **dropdown** (`additional_charge_types`, `0155`); admin + print fee **merged** (`0156`). **Dual-view JO lists** (Cards/List) on customer + admin; admin compact tiles → detail modal; derived **"✓ Cleared for release"** badge (both gates met).
- **Rate calculator** (`0157`) — per-service rate granularity (`terminal_rate_config` — each service varies by chosen dims or uniform) + **tiered foreign storage** (`storage_tiers`: cumulative per-day bands for Import/Export/Transhipment × size after free days; domestic stays flat per-day by size; empties use laden rates) + **Transhipment** trade option; **Inbound/Outbound** for domestic + colour-coded Foreign/Domestic origin pill; Settings tariff editor rebuilt.
- **Vessel** (`0158`) — removed the "enter manually" escape hatch app-wide (dropdown-only; ops add to the schedule); **de-duplicated `vessel_schedule`** (the sync's `vessel_visit` key flipped date↔week when the sheet's week column was filled) + a trigger enforcing **one row per (vessel_name, voyage_number)**.
- **Consignees admin** — clickable rows → detail modal (business address, TIN, BIR 2303/2307 viewers, requester name + email, dates, Print CIS); review/edit/delete moved into the modal.
- **Settings** — tabbed (Pricing & tariff / Operations / Access & staff / System).
- **Data** — test orders **purged to a clean slate**; `jo_number_seq` reset (first real JO = `JO-000001`); **0 releases**.

## 2026-06-22 — Self-service consignee/vessel requests, CIS-as-accreditation, rate matrix; fuel Phase 0 (deferred)

**Migrations through `0150` applied to prod** (portal lane `0124`–`0141`; fuel lane `0135`/`0140`/`0150`). Two concurrent lanes ran — the **portal/job-orders** lane and a new **fuel** lane (deliberately split numbers). See [[2026-06-22 Consignee+Vessel Requests, CIS, Rate Matrix, Fuel Phase 0]]. In one line each:

- **Self-service requests** — customers **request a consignee** (`request_consignee`, `0132`) or **vessel** (`request_vessel`, `0137`) that's missing; both are created **pending + usable-immediately** (file-now, KTC verifies in parallel). A recoverable **"needs info"** review state (`0138`) lets reviewers ask for more instead of rejecting; the customer edits & resubmits in-app. New **`review_consignee_requests`** gate (CSR), customer **My Requests** view, admin dashboard pending tile; consignee request now requires address + TIN + 2303 (`0139`).
- **CIS = consignee accreditation** — the Customer Information Sheet accredits the **consignee** (billed cargo-owner), not a broker account. `0133` modeled it on the broker and gated all filing; **`0136` reverted** that — one customer pool, one CIS on the consignee record, file-now with missing docs flagged. **Print CIS** = the filled sheet as a PDF.
- **Container rate matrix** (`0141`) — the **calculator's** `terminal_rates` tariff gains **empty/full × dry/reefer** (160 combos; 120 new cells `null` so it flags "rate not set", never ₱0); `job_order_lines` carry size/fill/kind; redesigned calculator + admin tariff editor. **Live billing is unchanged** (`service_rates`); the X-ray JO stays **operational/unpriced**.
- **Fuel monitoring Phase 0 (deferred)** — backend-only **derived-variance module** on the moves spine ([ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md); `equipment` + `fuel_dispense`/`fuel_delivery` ledgers + effective-dated `fuel_rates`/`fuel_settings` + `move_tally` + 7 views + RLS + audit, `0135`), a non-admin **`purchaser`** role (`0150`), and a trigger-ACL fix (`0140`). **Live in the DB, committed (`9407d39`), but no frontend** — Phase 1+ parked; focus is back on the portal. Detail: [[Fuel Monitoring (Yard Operations sub-module)]].
- **UI** — portal modals now render into `<body>` (no tabbar/footer overlap), consistent small-screen padding; Taglish on the new/redesigned screens.

## 2026-06-16 — Staff role matrix, two-gate completion, per-van X-ray, verify-QR

**Migrations through `0104`, all applied to prod (main @ `1b2e824`).** The big build day — see [[2026-06-16 Staff Roles, Supplements, Per-Van X-Ray, Verify]]. In one line each:

- **Staff model** — five staff roles **admin / operations / cashier / checker / csr** (+ owner / **root owner**) on the owner-tunable [[Staff Roles & Gates]] matrix; `process_job_orders` **split** into `accept_orders` / `hold_reject_orders` / `complete_orders` and enforced in `staff_transition_order`; X-ray confirmation is **checker-only**; root-only owner grants ([[Multi-Owner & Root Grants]]) + privilege-grant alerting.
- **Completion** — hard **[[Two-Gate Completion]]**: all services done AND base payment AND (RPS not needed OR paid) AND every supplement paid; auto-fires from whichever side finishes last; raw-update backstop.
- **X-ray** — confirmed **per container van** by the checker (BOC performs it), with an immutable name e-signature on the slip.
- **Payments** — RPS folded into the gate; **walk-in/office payment** at the [[Cashier Station]]; **[[Additional-Charge Supplements]]** (JO-####-A/B/C) with under-review re-completion.
- **Anti-forgery** — every slip carries a QR → public **[[Verify-QR Anti-Forgery|/verify/:id]]** (PAID + status + consignee/container cross-check).
- **Queue / comments / edit** — one **generalized priority number per JO** (weekly reset); **[[Comment Visibility & Escalation]]** (staff-only notes + complaint flag); staff JO-header edit (checker excluded).
- **Earlier same-day** — reworked rate calculator + per-line charge rules, **[[Support Tickets]]**, admin **bottom-tab nav**, **[[Staff Notifications]]** bell, consolidated customer email, atomic JO filing.

## 2026-06-13 — v1.1.0 trial-run release; ST02 manual lanes underway

**v1.1.0 live on `portal.ktcterminal.com`** (migrations through `0055`; prod wiped clean 2026-06-12 — first real order will be `JO-000001`). Everything since the 2026-06-10 snapshot, in one line each:

- **Payments & invoicing:** per-JO pay page (charges computation, bank/GCash + QR, payment-slip upload → admin confirm/reject), `/calculator`, ERP invoice recording (`OR-INV-`/`BI-INV-` + pad no. → PAID/BILLED chips), unpaid-completed view, admin-configurable `service_rates`/fees with pricing lock + server-guarded statutory VAT (`0050`), data-driven service catalogue (add/deactivate/reorder/safe-delete, `0051`).
- **Lifecycle & stations:** per-service serving numbers (weekly reset, vacate/restore rules), on-hold respond-&-resubmit + recoverable rejection loops, per-service ✓ completion, checker station (`/admin/checker`), admin file-on-behalf (`/admin/new-job-order`), order history trail, weekly archive + carry-over crons.
- **Roles & security:** cashier/checker roles + role-permission matrix, TOTP 2FA for admin/owner (server-enforced aal2, `0049`), single session per account — last-login-wins + dead-session RLS cut-off (`0054`/`0055`), idle timeouts everywhere (customer 15 min / staff 60 min) with "still there?" prompt, auto-suspend + owner alerts on escalation attempts (`0046`–`0048`), security headers/CSP in `vercel.json`, Logs tab + 15-min ops watchdog + System health panel (`0045`).
- **Onboarding & content:** Customer Agreement v2 (counsel sign-off pending), contact number at registration, `/verify-id` flow, ID retention 24h-guaranteed → 3-day auto-purge (`0052`/`0053`), per-role manuals + demo tours, version provenance in footers.
- **Testing:** ST02 (`docs/smoke-test-02-portal.md`) preflight **P1–P8 green** (P8 = Playwright 16/16 vs the test project, keys regenerated 2026-06-13); P9 (rates + payment-details entry) and manual Lanes 1–8 in progress with the owner.

*Detail: `CHANGELOG.md` v1.1.0 + sessions 10a–10s.*

## 2026-06-10 — Processing workflow, printable slip, account self-service

**Admin job-order processing is live (ADR-0014, migration `0029`).** The admin Job Orders page advances orders `submitted → processing → completed`, or **on_hold** / **rejected** with a customer-visible `admin_note`. "Approve = start processing." Admin UPDATE policy on `job_orders`; customers still can't self-update. **Printable A6 job-order slip** at `/job-order/:id/print`, styled as a mini KTC Service Invoice (logo/TIN header, JOB ORDER + red JO No., bordered customer block, container/service table with an Amount column ready for prices, signature lines) → browser print / Save-as-PDF; **"ON PROCESS" watermark** for in-progress orders. Available once approved (processing/completed); reachable from admin queue + My Job Orders.

**My Account self-service (ADR-0013, migration `0028`).** `/account` lets a customer edit full name / contact, change email (re-confirm link to the new address), and change password (in-page + reset-by-email). An **approved** customer changing their legal name triggers **re-verification** (→ `pending`, re-upload ID), because the verified name was matched to the now-deleted ID; the protected-fields guard now permits `approved → pending` self-transition.

**Polish:** unified `Notice` component (banner + login bubbles), Back-to-Home/Dashboard buttons + clickable logo on every page, **bulk-paste** containers (uncapped) + file→My-Job-Orders redirect, collapsible My-Job-Orders cards with status badges, square frosted-glass admin dashboard, and a **login lockout** (5 wrong passwords → 60s cooldown). Committed `aeac344`, tag `checkpoint-2026-06-10`, **live** on `portal.ktcterminal.com` (verified bundle).

## 2026-06-09 — Email-confirmation registration flow

**Confirm-email ON via Resend.** Registration now collects full name + email + password + 2 consents + CAPTCHA — **no valid ID at sign-up**. Broker confirms via email (Resend from `noreply@ktcterminal.com`; template `docs/email-templates/confirm-signup.html`), then on first login uploads their valid ID in the pending panel (`PendingPanel.tsx`), which also syncs consent columns from metadata. `emailRedirectTo` set. Email is the login identifier (no separate username). Rationale: the `valid-ids` storage policy needs a session, so post-confirmation upload keeps per-user security (no anon uploads). Resend domain `ktcterminal.com` verified + working (right-team API key in `.env.local`). **Still to do (you):** Supabase → Auth → Custom SMTP (Resend), paste the email template, Confirm email = ON, Site/Redirect URLs. See [[Broker Onboarding]].

## 2026-06-09 — Flow change Phase 1: approval workflow

**Reject-with-reason + suspend (in progress flow overhaul).** `/admin/approvals` now captures a **required reason** when rejecting a broker or accreditation (shown to the broker on the gated panel). `/admin/brokers` can **suspend / reactivate** approved brokers (with reason). New broker status **`suspended`** (auto-gated out via `broker_is_approved()`). Needs migration **`0013_approval_workflow.sql`** applied (decision_reason columns + suspended in the status check). Vercel MCP added (`https://mcp.vercel.com`, pending OAuth). Remaining flow phases: consignee-request, job-order documents, broker edit/cancel, status lifecycle (after smoke test). See [[Roadmap]].

## 2026-06-09 — Legal docs consolidated into one Broker Agreement

**Consolidated (ADR-0011, supersedes the structure of the two entries below).** The Broker IRR + Terms & Conditions + Privacy Notice are fused into a single **KTC Broker Agreement** (`src/content/broker-agreement.md`), centered on **confidentiality/NDA** and the **Data Privacy Act (R.A. 10173)**, at the public `/agreement` route (old `/irr` `/terms` `/privacy` redirect there). Registration shows the Agreement **inline in a scrollable box** with a **"View full ↗"** link, and **two required ticks** below: (1) Terms & Conditions, (2) DPA consent. Acceptance recorded as before (`terms_*` + `privacy_consent_*`, migration `0012`). See [[Broker Agreement]].

## 2026-06-09 — Terms & Conditions + Data Privacy consent

**Added (ADR-0009).** Public `/terms` and `/privacy` pages (single-source Markdown via a shared `MarkdownDoc` renderer). The Privacy Notice is **DPA (R.A. 10173)-aware** — required because brokers upload a government ID. Registration now requires two consents: (1) Terms & Conditions + Broker IRR, (2) a **separate** data-privacy consent. Versions + timestamps recorded in auth metadata + `brokers` columns via migration **`0012`** (apply to KTC DB; metadata holds the record until then). Login page has footer links. All three legal docs are templates pending KTC/legal finalization. *(Later consolidated — see [[Broker Agreement]] and the top entry.)*

## 2026-06-09 — Broker IRR acceptance gate

**IRR added (ADR-0008).** Implementing Rules and Regulations content in `src/content/broker-irr.md` (versioned via `IRR_VERSION`), rendered at the **public** `/irr` page + broker nav link. Registration now requires agreeing to the IRR (required checkbox linking to `/irr`); acceptance recorded in auth metadata immediately and on `brokers` columns via migration **`0011`** (must be applied to the KTC DB; metadata holds the record until then). IRR text is a template pending KTC/legal finalization. *(Later folded into the one Agreement — see [[Broker Agreement]].)*

## 2026-06-09 — Flow change: brokers pick consignee from master list

**Per-broker consignee accreditation disabled (ADR-0007).** The New Job Order page (`src/pages/JobOrder.tsx`) now uses a debounced server-side **typeahead over the full consignee master list** instead of an accreditation-fed dropdown — any approved broker can pick any consignee and submit. The `/accreditation` page is replaced with a notice (route kept) and its nav link removed (`Shell.tsx`). The broker self-register → admin-approve gate is unchanged; the `accreditations` table + admin accreditation features are untouched (reversible). Lint + build clean.

Also added: Playwright E2E Phase 1 (8 unauth smoke tests passing). Phase 2 (auth flows) pending a CAPTCHA-free path — see [[Pending Items]].

## 2026-06-07 — Live on portal.ktcterminal.com with CAPTCHA + full docs

**Deployed + protected.** The portal is live on Vercel at **`portal.ktcterminal.com`** (custom domain, DNS on Vercel, HTTPS valid, SPA deep-links working). Cloudflare **Turnstile CAPTCHA** is live on login + registration and **enforced server-side** in Supabase Auth (verified: auth API returns `captcha_failed` without a token). Vercel CLI installed + linked. Access is gated behind login — not public yet (prod testing).

**Documentation system shipped.** Mirrored jta-sys's layered docs: `CLAUDE.md` + `AGENTS.md`, `docs/agent/*`, `docs/adr/*` (ADRs 0001–0006), and this Obsidian vault. See [[2026-06-07 Deploy + CAPTCHA + Docs System]].

## What is live

- **Auth** - customer email/password registration (contact no. + Agreement consents) -> confirm email -> `/verify-id`, or "Continue with Google" -> one-time `FinishRegistration` consent step; staff username login; owner failsafe; invite-only staff; CAPTCHA, lockout, MFA/2FA gates, single session, idle timeouts, and disposable-email block. Pending customers are **verify-only** until admin approval; they cannot file or hold orders. See [[Authentication]].
- **Customers** - self-register -> `pending` verify-only -> upload ID -> admin approval; rejected verification can be resubmitted, while suspended accounts are locked pending KTC staff/customer-service intervention. See [[Brokers]].
- **Consignees** - admin CRUD, scoped search, pagination, approval, CIS/accreditation fields, BIR 2303 guard, recoverable request/resubmit loops, and rate/notification settings. See [[Consignees]].
- **Job Orders** - customer + CSR/operations-on-behalf filing, three auto-assigned serving lanes (regular / priority / re-X-ray), gated transitions (`staff_transition_order` + split role gates), hold/respond + recoverable reject loops, per-van X-ray, DEA/OOG service-done, charge-driven completion, printable A6 slip, verify-QR, timeline comments + staff-only notes/flags, weekly archive/carry-over. Live money path is the `charges`/`payment_orders` spine: base X-ray, RPS, add-on, and release charges are paid through Payment Orders; the old supplement payment path is retired. See [[Job Orders]], [[Job Order Lifecycle]], and [[target-architecture-jo-payment-invoice]].
- **Account** - `/account` self-service (name/contact/email/password; name change -> re-verify) plus customer SMS opt-out. See [[Authentication]].
- **Administration** - approvals, customers, consignees, JO queue, stations (operations / checker / [[Cashier Station|cashier]] / [[Support Tickets|CSR support]]), charge approval/audit/reconciliation, Payment Order desk, rates/tariff/charge rules, staff + [[Staff Roles & Gates|role gates]] + root-owner grants, [[Staff Notifications]] bell, Logs, System health, manuals + tours. See [[Administration]].
- **Internal Android staff app** - staff-only Capacitor APK lane with sandbox/live target guards, native scanner feedback, haptics, local alerts, share-sheet status, `/app/device`, and a device-local outbox limited to X-ray confirmations. Customer accounts are redirected to the web portal. Offline payments/invoices/OR/Payment Orders are not available.

## Backend

- Supabase project `mdlnfhyylvapzdubhyic` (KTC's own account). Migrations `0001_init` through **`0232_native_push_tokens`** are applied and tracked in `public._migrations`. RLS + role-permission matrix (`has_permission`) + `session_alive()` remain load-bearing across helpers; owner failsafe/root-owner grants, customer approval, payment gates, and server-side CAPTCHA must not be weakened. Email (Resend) is live; SMS and native cloud push are dormant until their secrets/functions are explicitly armed.

## In progress / not yet

- Real-device Android Part 15 smoke remains deferred: install the latest sandbox APK, confirm customer redirect, staff login, `/app/device`, local alerts/share sheet, scanner haptics, and offline X-ray outbox replay.
- All-roles/all-lanes go-live smoke remains the next broad release check after the Android device lane.
- Native cloud push is scaffolded but dormant: `send-native-push` deploy failed locally with Management API `401` because the available token is not a valid `sbp_` PAT. Arm only after deploying the Edge Function and setting Firebase/native-push secrets.
- Customer Agreement/legal launch items remain owner/legal work: PH-counsel sign-off, NPC/DPO decisions, and public-launch call.
- Parked future work: per-customer accredited-consignee scoping, JO drafts/document attachments, BOC Sheets mirror (blocked on Google service-account creds), Playwright mutation lanes, and a Vitest unit suite.

## Immediate priorities

**See [[Roadmap]] for authoritative sequencing; the owner-actioned launch checklist is `docs/go-live-todo.md`.** Summary: (1) run Android Part 15 real-device smoke; (2) run all-roles/all-lanes go-live smoke; (3) arm native cloud push only after valid PAT + Firebase/native-push secrets exist; (4) finish legal/NPC/DPO launch items; (5) public-launch call.