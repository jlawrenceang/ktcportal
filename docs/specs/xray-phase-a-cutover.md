# Spec — X-ray Phase A: the cutover (switch onto the charges spine)

* Status: **DRAFT for owner review** (2026-06-29)
* Implements: [ADR-0037](../adr/0037-jo-as-atomic-move-payment-orders-1-1-1-invoicing.md) Phase A — the cutover milestone (M4) of `docs/specs/xray-phase-a-anti-fraud-billing.md`.
* Precondition: the new billing model is already built and on prod additively (migrations `0202`–`0211`, v1.8.0) but **not wired into the live flow**. This spec switches the live flow onto it and removes the old one.

---

## 1. What / Why / Done

**What.** Make the new `charges` / `payment_orders` model the *only* billing path: create charges automatically when a job order is filed, route RPS and add-on charges through the same charge flow, collapse completion to one rule, switch the serving number to a monthly `YYMM-XXXX`, tighten consignee access, change who can cancel, and then **delete** the old billing structures — all shipped as one atomic switch, then re-seed test data.

**Why.** Phase A built the anti-fraud spine but left it running in parallel with the old base/RPS/supplement payment path. Two live billing systems is itself a fraud and correctness risk, and the old path still allows a charge to be confirmed with no invoice (the audit gap ADR-0037 exists to close). Pre-launch (disposable seed data) is the cheapest moment to do this — a clean code switch + re-seed, never a delicate live migration.

**Done looks like.**
1. Filing a job order automatically creates its base X-ray charge and links every container.
2. RPS and add-ons are charges (maker-checker for add-ons), paid through the one charge/payment-order flow — the old `jo_supplements` / `rps_payment_*` paths are gone.
3. A job order completes from exactly one rule, in one place: papers done + all its charges confirmed-paid (each with ERP + BIR invoice).
4. Serving numbers read `YYMM-XXXX`, reset monthly.
5. A customer's consignee picker can no longer pull TIN / contact details; it searches by name/code only.
6. Only an admin can cancel a job order, and a customer can't self-cancel once it carries a billed charge.
7. The old tables/columns (`rps_payment_*`, `jo_supplements`, `terminal_rates`, `job_orders.service_invoice_no` / `invoice_pad_no`) no longer exist; the app runs green on the new model.
8. Jarvis-verified on the money + migration; e2e green; a data-isolated break-test passes. Manuals + demo tours + walkthrough video updated to the new flow.

---

## 2. Current reality (why this is bigger than one migration)

The four-investigator recon (2026-06-29) found the old billing path is wired through most of the cashier/payment surface, all still live:

* **Filing** — `file_job_order` (`0187:184-277`) writes only `job_orders` + `job_order_lines`; **no charge, no `container_id`**. The existing `add_charge` RPC is staff-only (`0209:28`), so creating the base charge at filing is **new internal logic**, plus new container upsert logic (no find-or-create RPC exists — `0202` deferred it).
* **Completion** — one oracle `jo_ready_to_complete` (`0181:17-28`) checks: services done **+ base payment confirmed + RPS paid + no unpaid supplement**. The rule is **duplicated inline** in two BEFORE-triggers (`enforce_two_gate_complete` `0186:32-50`, `complete_on_payment_confirmed` `0186:59-75`). Four paths reach `completed`, all via the rule.
* **Serving number** — a bare per-lane, per-**week** integer (`serving_numbers`, `serving_week()` = Monday PH). The `YYMM-XXXX` string exists nowhere yet. Display tag built at `src/lib/serving.ts:33`; reset boundary at `serving_week()` (`0038:57-60`).
* **Consignee picker** — reads the `consignees` table **directly** (`src/lib/pickerSearches.ts:12-25`), relying on a broad broker RLS policy (`0185:15-26`) that exposes **every column incl. TIN / contact**. New `search_consignees` RPC (`0208:12-22`) returns only id/code/name. Five filing screens use the picker.
* **Cancel** — there is **no staff/admin JO-cancel** today. Only a customer-owned `cancel_job_order` (`0186:309-326`) that checks the *old* supplement table, not `charges`. Staff only cancel indirectly via customer/consignee-reject cascades.
* **The four drop targets are all still live** — RPS payments, supplements, and `service_invoice_no` (the live "PAID" signal) are read by ~12 frontend files and ~15 RPCs/triggers. `terminal_rates` is calculator-only (not billing) but still read by `Calculator.tsx` + `Settings.tsx`.

**Conclusion:** the cutover is the **switch of the whole X-ray billing/cashier flow** from the old screens/RPCs onto the new ones, then the drops. Because data is disposable, it's a clean code switch + re-seed — but the code surface is real.

---

## 3. Scope

**In** *(owner-confirmed 2026-06-29)*:
* The **X-ray job-order billing path**: base X-ray, RPS, and add-ons all become `charges`; the new `PaymentOrderDesk` + `ChargeApproval` + customer `JobOrderCharges` screens become the live cashier/payment flow; the old `CashierStation` / customer `Payment` payment path is retired.
* The **Release / pull-out desk** (`release_orders`, `release_supplements`, `or_number`) — **folded onto charges/payment-orders in this same cutover** (owner: "include it now"). Its base + supplement charges and its receipt/invoice numbers move onto the charge model alongside the X-ray path.
* Completion, serving number, consignee access, cancel changes (steps 2–5).
* Drops: `rps_payment_*` + `rps_moves` billing, `jo_supplements`, `release_supplements`, `job_orders.service_invoice_no` / `invoice_pad_no`, and the release `or_number` path as it stands.
* **`terminal_rates` is NOT dropped — correction (2026-06-29).** It is the calculator's *terminal-handling* tariff (arrastre / wharfage / lift-on-off / weighing / storage by size·fill·kind·trade·origin) — none of which the portal bills. The calculator **already** prices the billable X-ray/ancillary services off `service_rates` (the real spine), so estimate == bill already holds for those. Dropping `terminal_rates` would gut the calculator for no billing benefit. **Decision 3 reversed pending owner confirm; 1.5 needs no migration.**

**Out (still deferred):**
* Frappe ERP API, per-broker accreditation, payment gateway, partial/installment payments (all already deferred in ADR-0037).

---

## 4. The plan — build to parity, then one atomic flip

The build is **staged and mostly non-breaking**; only the final flip + drops are atomic and irreversible. This keeps each diff small and reviewable (the framework's fast-verification loop) while the user-facing money-path switch still happens in one shot.

### Stage 1 — wire the new flow to full parity (additive, non-breaking; old path still live)
1. **Filing creates billing.** Rewrite `file_job_order` to: normalise each container number, validate ISO-6346 (`iso6346_valid`), find-or-create the `containers` row, set `job_order_lines.container_id`, and insert the base **`service`** charge priced by `effective_rate(consignee, service)` (`bill_status='billed'`). *(Carried-over step 1.)*
2. **RPS → charge.** Replace `record_rps_assessment` + the `rps_payment_*` flow so an RPS becomes an **`rps`** charge on the JO, paid through the charge flow.
3. **Add-ons → charge.** Point the admin "add charge" actions (`AllJobOrders` / `CashierStation` supplement buttons) at `add_charge` (`addon`, maker-checker) instead of `add_supplement` / `request_supplement` / `bill_supplement`.
4. **Invoice signal → charge.** Re-point every read of `service_invoice_no` / `invoice_pad_no` (the "PAID/BILLED" signal) onto `charges.erp_invoice_no` / `bir_invoice_no` + `payment_status`.
5. **Calculator on the price spine.** Move `Calculator.tsx` + `Settings.tsx` rate grid off `terminal_rates` onto the one price spine (`effective_rate` / `service_rates` / `move_rates`).
6. **Release desk → charges.** Re-point the release / pull-out billing (`src/pages/Releases.tsx`, `src/admin/Releases.tsx`, `add_release_charge` / `record_release_or` / the `0188` release billing loop) onto `charges` + `payment_orders` — base + supplement release charges and the collection OR run through the one model.
7. Make the new screens (`JobOrderCharges`, `PaymentOrderDesk`, `ChargeApproval`, `Reconciliation`, `ChargeAuditView`) the live nav entries; old `CashierStation` / `Payment` and the old release-billing UI become unreferenced.

### Stage 2 — the atomic switch + drops (one commit, irreversible)
7. **One-rule completion.** Collapse `jo_ready_to_complete` to: `jo_all_services_done(jo)` **AND** every `charges` row for the JO is `payment_status='confirmed'` (free re-X-ray still exempt). Update the two inline BEFORE-triggers to read the same single rule. Conditions C/D/E (base/RPS/supplement) all fold into "all charges confirmed." *(Step 2.)*
8. **Monthly serving `YYMM-XXXX`.** Change `serving_week()` → a monthly boundary (`date_trunc('month', PH now)`); the `serving_numbers` period column + unique constraint follow; the display tag at `src/lib/serving.ts` renders `YYMM-####`. Lane routing (queue / priority / re-X-ray) unchanged; charge-only items never enqueue. *(Step 3.)*
9. **Tighten consignee access.** Switch all five pickers to `search_consignees`; drop the broad broker SELECT on `consignees` so the API returns only id/code/name to customers (full row stays admin/staff). Re-add a "docs pending" signal if still wanted (the RPC omits `doc_2303_path`). *(Step 4.)*
10. **Cancel changes.** Add a new **admin-only** `cancel_job_order` path; make the customer `cancel_job_order` refuse once any `charges` row exists (replacing its stale `jo_supplements` check). *(Step 5.)*
11. **Destructive drops.** Drop `rps_payment_*` + `rps_moves` (billing), `jo_supplements`, `release_supplements`, `job_orders.service_invoice_no` / `invoice_pad_no`, and the release `or_number` billing path (**`terminal_rates` is KEPT — see the §3 correction**); retire the now-dead RPCs/triggers (`submit_payment_proof`, `review_payment`, `record_office_payment`, `record_service_invoice`, `record_rps_assessment`, `add_supplement`/`request_supplement`/`bill_supplement`, `add_release_charge`, `record_release_or`, `complete_on_payment_confirmed`'s old columns, `enforce_invoice_before_confirm`, old `verify_job_order` fields). **Re-seed disposable test data.** *(Step 6.)*

### Stage 3 — verify + ship + the human layer
12. **Jarvis** on the money + migration logic (acceptance criteria). **e2e** lane green. A **data-isolated break-test** (sandbox, separate DB/storage — `sandbox-breaktest-params`).
13. **Manuals + demo tours + walkthrough video** updated to the new flow, landing with the cutover.
14. `/ship`: version bump (v1.9.0 or v2.0.0 — this is a model change), CHANGELOG, commit, push; apply migrations to prod with `node scripts/run-migrations.mjs`.

---

## 5. Decisions (resolved 2026-06-29)

1. **Release / pull-out desk** — ✅ **Included now** (owner: "include it now"). Folds onto charges/payment-orders in this same cutover (Stage 1 step 6, Stage 2 step 11).
2. **Retire the old payment screens** — ✅ Yes (required by the drops). `CashierStation` + customer `Payment` + the old release-billing UI are replaced by the new charge/payment-order screens.
3. **Calculator** — ⚠️ **REVERSED 2026-06-29 (needs owner re-confirm).** The premise was wrong: `terminal_rates` is the calculator's *terminal-handling* tariff (arrastre/wharfage/lift/weighing/storage), not a billing-rate duplicate, and the calculator already prices the billable X-ray/ancillary services off `service_rates`. So estimate == bill already holds for the billable part; `terminal_rates` should be **kept** and **1.5 needs no migration**. (Corroborated by [[rate-matrix-and-calculator]].)
4. **Admin cancel is new** — ✅ Add an admin-only job-order cancel; block customer self-cancel once a charge exists. (Proceeding on the recommended default; raise if you want it different.)
5. **Serving number** — ✅ Stays staff-internal with the new `YYMM-XXXX` format; priority / re-X-ray keep a lane marker. (Recommended default.)
6. **Version** — ✅ **v2.0.0** (breaking billing-model change).

---

## 6. Risks + mitigations

* **Largest blast radius is the re-point (Stage 1), not the drops.** Mitigation: Stage 1 is additive and non-breaking — it ships and is verified *before* the atomic flip, so the risky drop runs against an app already proven on the new model.
* **A charge can be confirmed without an invoice if a path is missed.** Mitigation: the `confirm_charge_payment` gate (`0206`) already enforces ERP+BIR-on-final for *every* charge type; the drop removes the old un-gated path entirely. Jarvis verifies acceptance criterion #1.
* **Filing form may not capture size/fill/kind** (`JobOrder.tsx:117` omits them) needed to price move_rates. Mitigation: confirm the base X-ray price only needs `service` (it does, via `effective_rate`); capture the rest only if pricing requires it.
* **Consignee "docs pending" flag lost** (the new RPC omits the doc path). Mitigation: add a scoped boolean to `search_consignees` if the flag is still wanted.
* **Irreversibility.** Mitigation: pre-launch disposable data + the staged build + a tagged pre-cutover release (`v1.8.0`) as the rollback point.

---

## 7. Rollback

Pre-launch, the rollback is simple: revert the cutover commit and restore from the `v1.8.0` tag (the additive Phase-A state), then re-seed. No live customer data is at stake. The destructive migrations are forward-only, so rollback is via the tagged frontend + a restore of the pre-drop schema snapshot taken immediately before Stage 2.
