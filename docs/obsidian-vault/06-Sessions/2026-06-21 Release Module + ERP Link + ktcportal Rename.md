---
title: 2026-06-21 Release Module + ERP Link + ktcportal Rename
tags: [session, release, payments, erp, security, docs]
type: session
---

# 2026-06-21 — Release / Pull-out Module, ERP Link, ktcportal Rename

Build day for the **customer-filed release / pull-out** flow ([ADR-0024](../../adr/0024-customer-filed-online-release-pullout-payment.md)) and its follow-ons (migrations **0123–0126**, all applied to prod), plus a project de-Jotform + rename. Built with parallel subagents + adversarial review (owner granted standing full-agent authority this session).

## Release / pull-out module (`0124`, ADR-0024)
- New **`release_orders`** entity, separate from `job_orders` (release applies to *every* container; the JO is a service overlay — [ADR-0022](../../adr/0022-gate-pass-is-container-eir-not-job-order.md)). Flow: customer files (consignee picker + **BL no.** + **DO/BL** upload to `release-docs`) → **CSR documents desk** verifies (`verify_release_docs`) → staff enter charges → customer pays (QRPH proof to `payment-slips`) → **cashier** confirms (`review_payments`) → record OR → `released`.
- Statuses `submitted → docs_verified → payable → paid → released` (+ `on_hold`/`cancelled`). All writes via SECURITY DEFINER RPCs; customers SELECT own only. UI: `src/pages/Releases.tsx` (customer) + `src/admin/Releases.tsx` (two desks) + nav `anyPerm`.
- This made **DO verification LIVE** (was the deferred "DO at online payment" gate). EIR/gate still external.

## X-ray queue = ops view (`0123`)
- `/admin/checker` reframed **"X-ray Queue"**; dedicated **`view_xray_queue`** permission (admin/operations/checker/csr true, **cashier false**) so CS can view but the cashier can't. Sortable worklist extracted to `src/components/XrayQueueTable.tsx`. Confirm stays `confirm_xray` (checker = spotter). Customer queue is **daily Batch + working-hours aging** (aging admin-only, 09:00–19:00 Manila).

## Additional charges (`0125`)
- Base charge is **set once** (no revise — `set_release_charges` only on `docs_verified`). Missed charges → **`release_supplements`** lines (mirror JO supplements [0101]): `add_release_charge`, customer `submit_release_supplement_payment`, cashier `confirm_release_supplement_payment`. **OR blocked until every supplement confirmed.**

## ERP link + cancel + approval gate (`0126`)
- **ERP link (combined Record-OR):** `record_release_or(p_id, p_or, p_invoice_no)` records the physical **OR number** *and* the **ERP (Frappe) service-invoice control no.** in one cashier action → `service_invoice_no` + `invoice_recorded_at`. Shared `normalize_erp_invoice_no` validates `OR-INV-…`/`BI-INV-…`. **`service_invoice_no` is the link to the ERP document** (app still doesn't issue the official OR); the box can't release without a valid ERP no. Dropped the old 2-arg `record_release_or`.
- **Cancel:** `cancel_release_order(p_id, p_reason)` — owning customer OR staff (`verify_release_docs`/`review_payments`), only while `submitted|docs_verified|payable|on_hold`. Makes the dead `cancelled` status live.
- **Upfront approval gate:** customer release page hides the file form for non-`approved` accounts (`useBroker` + `BrokerStatusBanner`); releases REQUIRE full approval (unlike JOs).

## De-Jotform + rename to ktcportal
- The portal is a custom React app — Jotform was long gone. Deleted the dead Jotform theme/script, renamed the package to **ktcportal**, retitled the README, scrubbed live doc refs. Kept the historical records (ADR-0003 = the pivot decision; `docs/archive/*`) per doc-governance. **GitHub repo renamed `ktc-joborderform` → `jlawrenceang/ktcportal`** (remote updated).

## No-zero number rules (`0127`, `0128`)
Owner directive: numbers need a minimum / series, and **defaults must be empty (NULL), never 0 — because a 0 can't be cleared**.
- **0127 (validation, no read-side risk):** ERP control no. + JO invoice control + pad serial all **reject all-zeros**; release **OR number** validated (digits, non-zero — was free text); **configurable ERP series range** (`pricing_settings` keys `erp_series_min`/`erp_series_max`, unset = not enforced — owner sets later); **amounts must be > 0** (release base charge `set_release_charges`, JO `add_supplement` — closed the zero-amount supplement gap).
- **0129 (format clarification):** release **`or_number` = BIR OR, max 6 digits** (non-zero, leading zeros kept); release **ERP control no. = `OR-INV-00000000` (8 digits), cash/OR only** for now (BI/credit deferred; `normalize_erp_invoice_no` rejects BI). JO `record_service_invoice` keeps OR + BI (JOs can be cash or credit). UI: OR input numeric, `maxLength 6`.
- **0130 (auto-pad UX):** cashier types only the number — fixed `OR-INV-` prefix + live padded preview; OR zero-pads to 6 (`1234→001234`), ERP to 8 (`12345→OR-INV-00012345`), padded **server-side** (`lpad`). **ERP series range intentionally left OPEN** (owner 2026-06-21: "no limit") — the only bounds are the digit-count format + non-zero; the `erp_series_min`/`erp_series_max` mechanism stays unset for a future narrow window if ever needed.
- **0128 (placeholders → NULL):** `service_rates.rate`, `move_rates.rate`, `terminal_rates.rate`, `pricing_settings.value` (admin_fee/print_fee) made **nullable + seeded zeros nulled out** (`vat_rate` preserved; `shipping_line_charge_rules`/`rps_moves.qty` left — 0 is valid there). All charge computation is **frontend** (`src/lib/pricing.ts` + Calculator/Payment/Settings/Checker), now treating `null` **or ≤0** as **"not configured"** → renders `—`/"not set", excluded from totals; never `₱NaN`, never `null.toFixed()`, never a silent ₱0.

## Role & operation diagrams + ST04
- **`docs/diagrams/role-and-operation-flows.md`** (NEW) — Mermaid: verified permission matrix (from the live `role_permissions` table), whole-operation overview (both spines), JO + release state machines (two-gate + supplement/OR-block detail), and **7 per-role flowcharts** (customer, owner, admin, operations, cashier, checker, csr) with every path/block/hand-off. Built from 4 parallel code scans + the live matrix; all 12 Mermaid blocks parser-validated (mermaid 11).
- **`docs/smoke-test-04-portal.md`** (NEW, ST04) — canonical blind-walkthrough of the release/pull-out spine + the no-zero number rules (migrations through 0130).

## Verification
- Migrations 0123–0128 applied via the Management API + verified (columns, function signatures, `normalize_erp_invoice_no('or-inv-1323')` → `OR-INV-00001323`; `OR-INV-0` raises). `tsc --noEmit` + `vite build` clean. Adversarial subagent reviews on the base module, supplements, 0126 contracts, and the NULL-safety pass.
