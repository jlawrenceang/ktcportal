# Fuel Monitoring — Yard Operations sub-module (Fuel)

> **Status (2026-06-22): Phase 0 done, module PARKED.** The schema + effective-dated config + 7 derived views + the `purchaser` role are **live in prod and committed** (`9407d39`; migrations `0135`/`0140`/`0150`). There is **no frontend yet**, and the build is paused — the portal / job-orders lane has priority. Resume per [[Pending Items]] (wire the role/permissions → `/admin/fuel` desk → pump logger). ⚠️ Don't create a `purchaser` account until the UI is wired.

**Owner:** Lawrence (sole builder). **Principle:** derived over hand-maintained; planned vs actual strictly separate; ship each phase before the next; the ERP stays the books of record (the app is operational). Decision: [ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md).

Source: sister-company **CSH** model `FUEL MONITORING_FEBRUARY 2026.xlsx` (2026-06-22) + this session's analysis. On the **same Supabase DB** as the portal; draws equipment + container moves from the [[Yard Operations — Pillar 2 (Move Logger + Yard)]] spine. An interim **Excel stopgap** (`KTC FUEL MONITORING (template).xlsx`) is already in use; this module supersedes it.

## The one idea that makes it work
Fuel is a **derived variance**, not a stack of hand-typed sheets. Two append-only ledgers + the moves spine are the only inputs:
- **Actual** comes from a **dispense ledger** (one row per fuel issue).
- **Estimated** comes from **moves × liters-per-move** (the moves already exist as operational events).
- **Everything else** — the per-machine × month matrix, per-class variance, per-line, tank reconciliation, payable, efficiency — is a **Postgres view**. Edit a ledger row; every report follows. No re-keying, no cross-sheet drift.

## What the CSH model does (and why DB beats the sheet)
Three layers: a vessel-ops log → **estimated** `moves × flat L/move` (MHC & RTG = 3, vessel-ops reach-stacker/forklift = 1.2; 40s/45s = ×2 TEU) → **actual** typed per machine (~176 units) → **discrepancy** valued at ₱50/L; plus deliveries (weighbridge net-kg ÷ 0.82 density → liters; **EWT = 1% of VAT-exclusive**), per-line revenue−fuel, and a tank reconciliation. It works, but the same container counts are re-keyed across 6+ sheets, references are fragile, the headline variance mixes scopes, and **a single ₱/L cell re-prices history when edited** with no record of the change. The DB fixes all four.

## Data model
**Reference (shared with Pillar-2):** `equipment` (code `RTG-02`, class, activity_driver, status) · `shipping_lines` · `operators` · `moves` (the event log).

**Ledgers (the only fuel inputs):**
- **`fuel_dispense`** (OUT): `id` (client-gen UUID, offline-safe), `equipment_id`, `liters`, `occurred_at` (device time), `odometer`/`run_hours`, `operator_id`, `source` (`tank`/`direct`), `delivery_id` (nullable), `device_id`, `synced_at`, `note`.
- **`fuel_delivery`** (IN): `supplier`, `po_no`, `invoice_no`, `invoice_date`, `liters_billed`, `rate`, `gross_kg`, `tare_kg`; **generated/derived**: `net_kg` = gross−tare, `liters_by_weight` = net_kg ÷ density, `gross_amount` = liters×rate, `vat_base` = gross_amount ÷ (1+VAT), `ewt` = −vat_base×ewt_rate, `net_payable` = gross_amount + ewt.
- **`fuel_tank_reading`** (dipstick): `tank_id`, `read_at`, `liters` — the physical count for reconciliation.

**Effective-dated config (read=authenticated, write=`manage_fuel`):**
- **`fuel_rates`**: `equipment_class`, `liters_per_move`, `effective_from`, `updated_by` — per-machine override via an optional `equipment_id`.
- **`fuel_settings`**: `key` (`diesel_price`/`density`/`ewt_rate`/`vat_rate`), `value`, `effective_from`, `updated_by`.
- **The rule:** editing a rate **inserts a new dated row** (the old one is preserved); views pick the row whose `effective_from` is the latest on/before the period. Past months keep their price; you get a full change history. (This is the "record the changes" the spreadsheet can't do.)

**Interim:** **`move_tally`** (`period`, `equipment_class`, `moves`) — manual/imported monthly counts that feed the estimate **until the live move logger lands**, satisfying the same view contract.

## Derived views (never hand-stored)
- `fuel_actual_monthly` — liters per equipment per month (from `fuel_dispense`). *Replaces the giant matrix.*
- `fuel_actual_by_class_monthly` — per class per month.
- `fuel_estimated_by_class_monthly` — handling moves (from `moves`, or `move_tally`) × effective `liters_per_move`.
- `fuel_variance_monthly` — estimate vs actual per class, in liters and pesos (priced at the diesel rate effective that month). Positive = actual over estimate.
- `fuel_inventory_monthly` — forwarded + IN − OUT = ending vs dipstick = variance (forwarded chains from the prior month's physical reading).
- `fuel_payable` — per delivery net/EWT (from the generated columns).
- `fuel_equipment_efficiency` — L/move, L/run-hour, L/100km per machine + **peer-anomaly flag** (z-score vs class). *The value-add the sheet cannot do — spot the leaking unit.*

## Write path & access (backend-enforced)
SECURITY DEFINER RPCs only; new owner-tweakable permissions in `role_permissions`:
- `log_fuel` → `log_fuel_dispense(...)` (pump operator / mobile).
- `manage_fuel` → `record_fuel_delivery(...)`, `set_fuel_rate(...)`, `set_fuel_setting(...)`, `record_tank_reading(...)` (admin/fuel desk).
- `view_fuel_reports` → read the views.
Config/ledger changes log an audit event (reuse `log_security_event`/an event log). Internal trigger/definer helpers `revoke … from public, anon, authenticated` (the [0105]/[0117] invariant; `scripts/check-security-invariants.mjs` must pass).

## Capture UX
- **Admin fuel desk** (`/admin/fuel`): deliveries, effective-dated rate/price editor (mirrors `Settings.tsx` "Service rates & fees"), tank readings, and the report views.
- **Mobile pump logger** (`/app/fuel`): single-purpose PWA on the `AppLayout` shell (like the checker app) — pick equipment → liters → (odometer/hours) → confirm. Offline-first (IndexedDB + UUID upsert), same approach as the move logger.

## Phases (ship in order)
0. **Foundations** — tables + effective-dated config + derived views; import the stopgap's history. Deliverable: reports as views off seeded data.
1. **Admin fuel desk** — deliveries, config, tank readings, reports. Office staff stop using Excel.
2. **Mobile pump logger** — `fuel_dispense` captured at the pump; kills manual per-machine entry.
3. **Estimate from live moves** — swap `move_tally` for the Pillar-2 `moves` feed (no view change).
4. **Efficiency + anomaly alerts** — per-machine L/move, L/hr, L/100km + outlier flags.
5. **(Optional) Fuel-payable handoff** — feed AP/ERP; ERP stays the books of record.

## Relationship to the pillars
Same Supabase DB. Pillar 1 = the portal (JOs + release). Pillar 2 = the yard move logger + `moves` spine. **Fuel is a derived consumer of Pillar-2:** the estimate reads the same `moves`/`equipment` the yard logger writes, so building fuel pulls the spine forward instead of forking it. Until the logger exists, `move_tally` bridges the gap.

## Interim stopgap (the Excel)
`KTC FUEL MONITORING (template).xlsx` already implements this model in spreadsheet form — CONFIG/EQUIPMENT/LINES + FUEL_OUT/FUEL_IN/VESSEL_LOG ledgers → derived RPT_* tabs, enter-once with bounded SUMIFS. It de-risks the schema (same shape) and keeps KTC running until P1 lands. Its known limits — no effective-dated prices, no audit trail, no per-machine anomaly detection — are exactly what the DB module adds.

## Open questions
- Diesel price for variance valuation: one effective-dated rate, or the weighted-average actual purchase cost per period?
- Pump operator: a new `staff_role`/`operators` PIN login on a shared tablet, or an existing staff login?
- Fuel scope: include the civil-works (Oblique) and KD fleets in KTC's variance, or track them as separate cost centers?
- Tanks: single bulk tank or multiple (per-tank dipstick reconciliation)?
