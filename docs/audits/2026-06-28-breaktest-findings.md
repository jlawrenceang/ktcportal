# KTC Portal — Break-Test Findings (Remediation Backlog)

_Date: 2026-06-28 · Method: full end-to-end lifecycle dress rehearsal across every role **to release**, on the isolated sandbox (Supabase test project `zwvzadkgeyhkhyshkwhc`, data-isolated from prod), via a 17-agent ultracode workflow — 10 lifecycle scenarios + a 50-customer/10-staff concurrency load + 5 adversarial probes + synthesis. Fixes were applied in the **sandbox only** (or bypassed) to keep each path moving; **every finding below is for the REAL repo.**_

Seed: 50 approved+consented customers, 10 staff (1 admin / 3 operations / 2 cashier / 2 checker / 2 csr), **1,666 approved consignees copied from prod**, non-zero rates.

**38 raw findings → 33 distinct after dedup. Critical 4 · High 7 · Medium 11 · Low 11.** Two criticals (KTC-01, KTC-02) re-verified against the live repo during synthesis.

## Jarvis verification (2026-06-28, independent read-only sentinel)
- **All 4 criticals' mechanisms CONFIRMED** in the live repo (exact lines re-read); **3/3 high spot-checks CONFIRMED** (KTC-05, KTC-06, KTC-17 — the array-literal bug empirically reproduced).
- **KTC-04 DOWNGRADED to LOW.** Its "unusable in prod" evidence was a **sandbox artifact**: `_copy_consignees.mjs` inserted prod consignees with *explicit* codes, which never advances `consignee_code_seq` — so the sandbox seq stayed at 1. Prod's own importer inserts code-less rows (which *does* advance it). **Resolved by a read-only prod check: `consignee_code_seq` last_value=1659 (next 1660) vs max CN code 1653 → the seq is AHEAD → `request_consignee` works in prod, KTC-04 does NOT reproduce.** The harden-the-default fix is kept as defensive hardening, not a blocker.
- **New finding KTC-34** (Jarvis catch): the supplement-payment RPCs lack the same order-status guard as KTC-05 — see below.
- **Citation drift fixed:** KTC-04 `request_consignee` live def is `0183:174-218` (was citing the superseded `0167`); KTC-17 file is `0162_agreement_consent_enforcement.sql:~113-157`.
- **Data isolation: CLEAN** — all three temp scripts hard-guard the sandbox; `_copy_consignees.mjs` touches prod with exactly one read-only SELECT. No prod-mutation path existed.
- **Verdict: backlog trustworthy to action on prod** (with KTC-04 re-ranked to LOW).

## ✅ Remediation status — all CRITICAL + HIGH FIXED, verified & shipped (migration 0186, v1.6.76, 2026-06-28)
**KTC-01, 02, 03, 05, 06, 07, 08, 09, 10, 11, 34, + 17** were fixed in migration `0186_breaktest_fixes_critical_high.sql` (+ `useAdminCounts.ts` perm) and **applied to prod**. Verification chain: (1) applied to the sandbox, (2) a 9-agent behavioral re-test **14/14 PASS** (every repro now correct; happy path completes; 50×10 load clean — 0 dup JO/serving, 0 cap breaches; positive control confirms the guards stay status-specific), (3) **Jarvis code review PASS** (each fix correct, all grants/guards preserved, no over-blocking, idempotent-safe). The sandbox apply also caught a real bug in the fixes pre-prod (a wrong `GET STACKED DIAGNOSTICS` item name).

### ✅ Security/integrity hardening shipped (migration 0187, v1.6.77, 2026-06-28) — audit Phase 2 part 1
**KTC-13, 14, 15, 16, 21, 22, 25, 26, 27, 31, 33** + the **KTC-09 whitelist residual (a)** were fixed in `0187_breaktest_hardening_medium.sql` (+ checker/nav/counts frontend) and **applied to prod** (sandbox-verified, invariants OK, build-agent Jarvis PASS line-by-line). Covers: RPS guards, terminal-reject retirement, checker accept-gate, file-order length caps + container format, X-ray-only re-X-ray copy, and the `payment_info`/`shipping_lines`/`role_permissions` RLS gates.

**Re-framed:** **KTC-20** is a **single-IP load-test artifact**, NOT a real concurrency ceiling — the 50 logins came from one IP (the test runner) and tripped GoTrue's per-IP throttle; real users are distributed and the 2026-06-16 load test handled ~500 concurrent. Action downgraded to: sanity-check prod Auth rate limits + add client 429 back-off (minor).

**Still open:** **KTC-04** → LOW (verified not a prod issue). **KTC-09 residual (b)** — `types.ts` `SERVICE_REQUESTS` fallback casing (rare degraded state). **KTC-32** (`verify_job_order` disclosure) — owner decision (may be intentional per ADR-0019). The **UX/polish mediums/lows** (KTC-12 cashier walk-in invoice, KTC-18/30 priority display, KTC-19 now-serving board, KTC-28 ops new-order notify, KTC-23/24 notification inbox/Lara, the manuals + i18n) are **audit Phase 2 (remainder) / Phase 3 / Phase 4** — in progress.

## Lifecycle reach
- **Completed clean (→ released):** happy-path-to-release, cancel, priority (grant), walk-in+RPS, reject-recover (terminal *by design*), on-hold resolution (in-app path works), load (only with client-side login throttling — auth is the ceiling, KTC-20).
- **Dead-ended without a service-role bypass:** **re-X-ray** (KTC-02), **supplement request→bill** (KTC-01), **consignee request** (KTC-04).

---

## CRITICAL (4)

### KTC-01 — `request_supplement` inserts NULL into NOT NULL `jo_supplements.amount`; ops "request a charge" is dead on arrival
- error · operations/admin
- **where:** `request_supplement` — `supabase/migrations/0183_audit_closure_notify_rexray_consignee_vessel.sql:20-21` (`values (..., null, 'requested', ...)`) vs column `0101_jo_supplements.sql:19` (`amount numeric(12,2) not null default 0`). UI: `src/admin/AllJobOrders.tsx:428` ("Request charge").
- **repro:** `rpc('request_supplement',{p_jo,p_label})` → `null value in column "amount" violates not-null`. 0 rows ever written; ADR-0035 phase-6 maker-checker split non-functional (only `add_supplement` with a non-null amount works).
- **fix:** migration `alter table public.jo_supplements alter column amount drop not null;` (a requested-but-unpriced charge has no amount yet; `bill_supplement`/`add_supplement` already enforce `amount>0`; gates key off `bill_status`). Add a smoke test exercising `request_supplement`.

### KTC-02 — Free re-X-ray child can NEVER complete: `enforce_two_gate_complete` contradicts `jo_ready_to_complete`
- error · checker / admin
- **where:** trigger fn `enforce_two_gate_complete()` `0181_audit_fixes_completion_rexray_fuel.sql:33-39` requires `new.payment_status='confirmed'` with NO `is_rexray and not rexray_billable` exemption — whereas `jo_ready_to_complete()` (`0181:17-28`, exemption at :21-22) HAS it. Hit via `record_van_xray` (`0181:51`) → `record_service_done` → autocomplete trigger `0172_autocomplete_on_service_done.sql:9`.
- **repro:** parent→completed → `request_rexray` → admin `review_rexray(approve)` → child processing/free → checker `record_van_xray(child)` → "Cannot complete — services, base payment, RPS, and all billed charges must be cleared." Whole txn rolls back; child stuck in processing forever. Re-X-ray feature 100% dead end-to-end.
- **fix:** forward migration giving `enforce_two_gate_complete` the same free-re-X-ray exemption (best: delegate to `jo_ready_to_complete(new.id)` so the two gates can't drift).

### KTC-03 — Billed-unpaid supplement does NOT block completion when base/RPS payment confirms last; order auto-completes with money owed
- data-integrity · cashier (system trigger completes)
- **where:** `complete_on_payment_confirmed` (trigger `job_orders_complete_on_payment`, BEFORE UPDATE OF payment_status, rps_payment_status) — last defined `0097_rps_in_completion_gate.sql` (~:22), NO supplement clause. Backstop `enforce_two_gate_complete` is BEFORE UPDATE OF **status**, so it never fires when this trigger mutates `new.status` in-place under a payment-only SET.
- **repro:** services done + `add_supplement(800)` billed/unpaid, then `record_office_payment(base)` → `status='completed'` while supplement stays `billed`/`unpaid`. `staff_transition_order(completed)` is correctly blocked — only this autocomplete path leaks.
- **fix:** add to `complete_on_payment_confirmed`: `and not exists (select 1 from public.jo_supplements s where s.job_order_id=new.id and s.bill_status='billed' and s.payment_status<>'confirmed')`. Defense-in-depth: widen the backstop trigger to plain BEFORE UPDATE (drop `OF status`).

### KTC-04 — [DOWNGRADED → LOW] `consignee_code_seq` *could* lag bulk-imported codes — but does NOT in prod (verified)
- data-integrity (hardening) · customer (approved) / admin add-without-code
- **⚠️ Jarvis correction + prod check:** the "unusable in prod" claim was a **sandbox artifact**. Prod check: `consignee_code_seq` last_value=1659 (next 1660) > max CN code 1653 → `request_consignee` works in prod; **NOT a go-live blocker.** Keep the fix only as defensive hardening.
- **where:** `request_consignee` `0183_audit_closure_notify_rexray_consignee_vessel.sql:174-218` (live def; was citing the superseded `0167`); code default `0006_consignee_code_default.sql:7-10` (`consignee_code_seq`); import paths `src/admin/Consignees.tsx:160-171` + `:196-201` (insert with explicit codes, never advance the seq).
- **repro (sandbox only):** after importing coded consignees without advancing the seq, `request_consignee(new name)` → `duplicate key consignees_code_key`. Does not occur where the seq is ahead of `max(code)` (prod today).
- **fix (hardening):** make `Consignees.tsx` bulkUpsert run `setval('public.consignee_code_seq', max_existing)` after a coded upsert; harden the column default to `greatest(nextval, max_existing)` or retry-on-23505. (A one-time setval is unnecessary in prod now.)

---

## HIGH (7)

### KTC-05 — Cashier can CONFIRM payment (and `record_office_payment`) on a CANCELLED/REJECTED order; revenue + ERP invoice bound to a dead order
- data-integrity · cashier
- **where:** `review_payment` `0177_payment_requires_invoice.sql:39-76` (no status check); `record_office_payment` `0178_audit_fixes_financial_notifications.sql:17-44`. UI `src/admin/AllJobOrders.tsx:638,688` + closed filter `:255`.
- **repro:** submit proof → cancel/reject → `review_payment(confirm,base)` SUCCEEDS → `{status:cancelled, payment_status:confirmed, service_invoice_no:OR-INV-…}`. `record_office_payment(rps)` confirms on a cancelled order with no proof.
- **fix:** both RPCs `select status for update` + raise when `status in ('cancelled','rejected')`. Defense-in-depth: reset non-confirmed payment in cancel/reject paths; gate the Confirm button on a live status.

### KTC-06 — `resubmit_needs_info` container swap does NOT invalidate prior base payment OR X-ray completion (revenue leakage + customs/X-ray bypass)
- data-integrity · customer (via ops hold-for-containers)
- **where:** `resubmit_needs_info` `0154_reject_terminal_and_needs_info_fields.sql:111-126` (containers branch deletes+reinserts lines, never touches payment_status/service_invoice_no/service_completions).
- **repro:** 2 containers billed+paid → ops `hold_job_order(['containers'])` → customer resubmits with 4 → payment stays confirmed for 4 though 2 paid. X-ray variant: swap containers after X-ray done → `xray` completion persists → completes without re-X-raying.
- **fix:** when 'containers' changes the line set, reset `payment_status='unpaid'`, null payment/invoice fields, delete affected `service_completions` + clear `xray_done_at`. Or forbid `hold_job_order(['containers'])` once paid.

### KTC-07 — `cancel_job_order` strands a confirmed/pending supplement payment (missing the guard releases got in 0131)
- data-integrity · customer/cashier
- **where:** `cancel_job_order` `0181_audit_fixes_completion_rexray_fuel.sql:94-107` (no supplement check); analogous release guard `0131_cancel_guard_paid_supplement.sql:25-28`.
- **fix:** before the cancel UPDATE, raise if any `jo_supplements` for the order is `payment_status in ('submitted','confirmed')`.

### KTC-08 — Customer `file_job_order` has NO per-order container cap (admin path caps 100); 2000-line order accepted
- gap · approved customer
- **where:** `file_job_order` `0163_lock_pending_to_verify_only.sql:124-177` vs `admin_file_job_order` cap `0141_container_rate_matrix.sql:140-142`.
- **fix:** add array-length guards mirroring 0141 (reject 0 and >100 lines).

### KTC-09 — `service_request` accepts arbitrary non-catalogue text (length-bounded 1–60 but NOT whitelisted)
- data-integrity · approved customer
- **where:** `file_job_order` `0163:167-171` inserts verbatim; no check vs `service_rates`/SERVICE_REQUESTS (`src/lib/types.ts:248-253`); routing keys off it via `service_line_of`.
- **fix:** per-line existence check against active `service_rates`; apply in `update_job_order` + `admin_file_job_order` too.

### KTC-10 — `request_consignee` & `resubmit_consignee` map EVERY unique_violation to "name already exists", masking the code collision
- error · customer (surfaces to CSR/admin)
- **where:** `request_consignee` `0167:212-214`; `resubmit_consignee` `0185_recoverable_rejected_consignee.sql:56-58`.
- **fix:** branch the `unique_violation` handler on constraint name; mostly moot once KTC-04 is fixed.

### KTC-11 — CSR consignee-request handoff is invisible: no notification fires AND the consignee badge is gated by a permission CSR doesn't hold
- gap · csr
- **where:** `request_consignee` `0183:174-218` (no `notify_staff` despite the filename); badge `src/lib/useAdminCounts.ts:21` uses `manage_consignees` vs page using `review_consignee_requests OR manage_consignees`.
- **fix:** (a) `notify_staff('review_consignee_requests','consignee',…)` in `request_consignee`; (b) change `useAdminCounts.ts:21` perm to `review_consignee_requests`.

### KTC-34 — [Jarvis catch] Supplement-payment RPCs have no order-status guard (sibling of KTC-05): confirm a supplement payment on a cancelled/rejected order
- data-integrity · cashier/admin
- **where:** `review_supplement_payment` `0101_jo_supplements.sql:130-160` and `record_supplement_office_payment` `0101:166-184` — neither checks `job_orders.status`. (The follow-on autocomplete is harmlessly blocked by its own `where status in (...)`, but the confirmed-payment-on-a-dead-order leak is identical to KTC-05.)
- **fix:** add the same terminal-status guard as KTC-05 to both RPCs (`select job_orders.status for update` → raise on `cancelled`/`rejected`). Fold into the KTC-05 fix migration.

---

## MEDIUM (11)

- **KTC-12** — Cashier station can't record the ERP invoice on a walk-in (unpaid) order; the prescribed "invoice then base payment" dead-ends in-station. `record_office_payment` gate `0178:33` vs `CashierStation.tsx:125/:118`. _Fix:_ broaden `toInvoice` to include processing+unpaid; surface the invoice form inline. _(overlaps audit T2-14.)_
- **KTC-13** — Terminal-reject bypassable on legacy (pre-0154) rejected orders: `resubmit_rejected` still granted + no backfill (`0034_customer_order_actions.sql:51-99`). _Fix:_ backfill `rejected_recoverable=false where status='rejected'` + drop/revoke `resubmit_rejected`.
- **KTC-14** — `record_office_payment(p_kind='rps')` confirms RPS on an order with NO RPS assessed; a later real assessment inherits the stale confirm (`0178:17-44`; `record_rps_assessment` `0062` never resets). _Fix:_ require `rps_status='needed'`; reset `rps_payment_status` on (re)assessment.
- **KTC-15** — `record_rps_assessment` can set/modify the RPS charge on a CANCELLED/REJECTED/COMPLETED order (`0062`, no status check). _Fix:_ `select status for update` + raise unless open.
- **KTC-16** — No "order accepted" handoff to the checker: X-ray queue/badge keys off filing, and `record_van_xray` lets a checker advance a never-accepted (submitted) order (auto-promotes), bypassing the ops accept gate. _Fix:_ scope checker queue to processing/on_hold; require accepted status in `record_van_xray`.
- **KTC-17** — Privilege-escalation guard errors (`22P02 malformed array literal` on `text[] || unknown`) BEFORE logging, so `protected_field_attempt` audit + owner alert never fire (`guard_broker_protected_fields` `0162:~113-156`; same bug in 0046/0047/0093/0094). _Fix:_ cast appends `|| 'is_admin'::text` (or `array_append`).
- **KTC-18** — Desktop Checker silently re-orders a priority order to the top with no visual cue (`src/admin/Checker.tsx:37,42-44,116` vs AppChecker shows "P-1"). _Fix:_ mirror AppChecker lane tag/chip + add `priority_status` to the SELECT. _(overlaps audit T2-18.)_
- **KTC-19** — `now_serving()` board RPC is dead (zero callers); no now-serving board surfaces priority vs queue lanes; two parallel queue models (serving-numbers vs batch/aging). _Fix:_ pick one source of truth (build the board or drop the dead layer). _(overlaps audit T3-09.)_
- **KTC-20** — Burst concurrent sign-in hits the GoTrue auth rate limit (~30/50 logins in a naive burst); token minting is the real concurrency ceiling (DB/RPC layer handled 50 concurrent fine). _Fix:_ raise prod GoTrue rate limits sized to peak; client-side backoff on 429. **Re-verify on prod, not the sandbox.**
- **KTC-21** — `file_job_order` accepts unbounded `entry_number`/`vessel_name`/`voyage_number`/`vessel_visit` (10k-char stored) (`0163:146-151`). _Fix:_ length caps + NOT VALID CHECK constraints; optionally backstop vessel/voyage against current `vessel_schedule_v`.
- **KTC-22** — `file_job_order` leaks raw Postgres errors (23502 / 22023 / 23514 constraint names) and has no container_number format check (`0163:153-171`); admin path pre-validates. _Fix:_ pre-validate mirroring `admin_file_job_order` (typeof guard, per-line service, size/fill/kind, container regex, friendly messages).

---

## LOW (11)

- **KTC-23** — Vessel-flagged on-hold has no in-app free-text resubmit fallback when `vessel_schedule_v` has no current match (`MyJobOrders.tsx` NeedsInfoForm; RPC accepts free text). _Fix:_ reveal free-text vessel/voyage inputs when the schedule is empty.
- **KTC-24** — `hold_job_order` / `resubmit_needs_info` retain default anon EXECUTE (`0154`, missing the revoke/grant block). _Fix:_ `revoke … from public, anon; grant … to authenticated`.
- **KTC-25** — Stale "needs action" count includes recoverable-rejected orders the action list can't show (`Home.tsx:33` + `BottomNav.tsx:59` vs `MyJobOrders.tsx:281`). _Fix:_ drop the rejected clause from both `.or()` filters. Pairs with KTC-13.
- **KTC-26** — Unapproved re-X-ray child appears in the checker queue but can't be acted on (`Checker.tsx:104-119`, `AppChecker.tsx:71-80`). _Fix:_ exclude `is_rexray && rexray_status!=='approved'`. _(overlaps audit T2-20.)_
- **KTC-27** — `request_rexray` copies ALL parent service lines (DEA/OOG), so a multi-service order's re-X-ray child needs non-X-ray services re-completed (`0183:105-107`). _Fix:_ restrict copied lines to `service_line_of='xray'`. Latent until KTC-02 fixed.
- **KTC-28** — Operations gets no notification on a new order; only a polled badge that lumps submitted+processing+on_hold (`0085`; `useAdminCounts.ts:24`). _Fix:_ `notify_staff('accept_orders',…)` on submitted; separate unaccepted count.
- **KTC-29** — Every concurrent filing serializes on one global `serving:queue` weekly advisory lock held for the whole filing txn (`assign_serving_numbers` `0174`). ~1322ms at 50 concurrent, no errors — scale watch-point, fine now. _Fix (later):_ per-lane sequence or scope the lock to the numbering step.
- **KTC-30** — Main admin/ops queue shows a Priority chip but does NOT move the order ahead; "priority" differs across surfaces (`AllJobOrders.tsx:258` vs `Checker.tsx:116`). _Fix:_ sort granted-priority first; align with Checker. Pairs with KTC-18.
- **KTC-31** — `payment_info` (KTC payee bank/GCash) readable by ANY authenticated user incl. pending (`0036_payments.sql:39-41` `using(true)`, never re-gated by 0163). _Fix:_ gate to `broker_is_approved() or current_is_staff()`.
- **KTC-32** — Anon `verify_job_order` over-discloses (full container NUMBERS + payment/RPS status) beyond the documented minimal facts (`0089_verify_job_order.sql:15-28`, expanded 0090/0097). Not enumerable (UUIDv4). _Fix:_ drop payment/rps fields, return container count not numbers; or update ADR-0019.
- **KTC-33** — `shipping_lines` + `role_permissions` world-readable to any authenticated (incl. pending) via `using(true)`. _Fix:_ gate shipping_lines to approved/staff; role_permissions to staff.

---

## Top 5 must-fix before go-live (revised post-Jarvis — KTC-04 dropped out, verified not a prod issue)
1. **KTC-05 (+ KTC-34 sibling)** — payment / supplement-payment confirmed on cancelled/rejected orders → revenue + ERP/BIR invoice bound to a dead order (financial integrity, no workaround).
2. **KTC-03** — order auto-completes with a billed-unpaid supplement → completed orders with money owed.
3. **KTC-06** — container swap on resubmit keeps prior payment + X-ray "done" → revenue leakage AND a customs/X-ray bypass.
4. **KTC-02** — re-X-ray can never complete → an entire shipped feature is dead.
5. **KTC-01** — ops "request a charge" is dead on arrival (partial workaround via `add_supplement`, but the ADR-0035 maker-checker split is non-functional).

_Just below the line: **KTC-17** (silent loss of privilege-escalation auditing). **KTC-04** is now LOW (verified not reproducing in prod) — keep only as defensive hardening._

---

_All fixes above are TO BE APPLIED IN THE REAL REPO (a remediation phase, owner-greenlit). Nothing here has been applied to prod. The sandbox was reset/disposable. Counts by kind: data-integrity 10 · gap 16 · error 4 · bypass 3._
