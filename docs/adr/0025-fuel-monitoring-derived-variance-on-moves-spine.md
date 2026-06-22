# ADR-0025: Build fuel monitoring as a derived variance module on the moves spine (estimate vs per-dispense actual, effective-dated rates)

* Status: Accepted (Phase 0 applied — migration 0135, 2026-06-22)
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-22
* Category: Architecture | Database | Business Logic

## Context and Problem Statement

KTC needs to track and compute equipment **fuel** — currently an unsolved problem. The sister company **Cebu South Harbor (CSH)** shared a detailed Excel ("FUEL MONITORING_FEBRUARY 2026.xlsx") used as the **model**. It is a sound but clunky **fuel-variance** workbook: a vessel-ops log feeds container moves, an **estimated** consumption is computed as `moves × flat liters/move` (MHC & RTG = 3, vessel-ops reach-stacker/forklift = 1.2; 40s/45s count ×2 for TEU), an **actual** consumption is hand-typed per machine (~176 units), and the **discrepancy** is valued at ₱50/L. It also tracks supplier deliveries (weighbridge net-kg ÷ 0.82 density → liters; EWT = 1% of the VAT-exclusive amount), per-line revenue-vs-fuel, and a tank reconciliation (forwarded + in − out = ending vs dipstick = variance).

The clunk is structural: the same container counts are re-keyed across six-plus sheets, cross-sheet references are fragile, and the headline variance mixes scopes (move-based estimate vs whole-fleet actual). The question: **what is the right data model and home for a KTC fuel system** that keeps the proven variance methodology but kills the re-keying, makes the variance meaningful per machine, and records rate/price changes over time — without waiting on the (unbuilt) yard move logger or an ERP/AP integration?

## Decision Drivers

* The same numbers must be **entered once** — container moves already exist (or will) as operational events; fuel should derive from them, not re-count them.
* **Derived over hand-maintained; planned vs actual strictly separate** — the standing KTC/Pillar-2 principle (`CLAUDE.md`, [[ADR-0015]]).
* Variance must point at the **leaking machine**, not a single fleet-wide number — per-equipment-class reconciliation with class-appropriate drivers.
* Rate/price changes must be **recorded and not retroactively re-price history** — a single global "₱50/L" cell (as in Excel) silently re-values past months when edited.
* Reuse what exists: the config-table pattern ([0030] `service_rates`/`pricing_settings`), owner-tweakable role gates (`role_permissions` + `has_permission()`), SECURITY DEFINER RPCs, the audit-event pattern ([0040]/[0046]), and the mobile staff-PWA shell (checker app).
* Ship value now: an Excel **stopgap** is already delivered; the DB module must be able to start before the live move logger ([[Yard Operations — Pillar 2 (Move Logger + Yard)]]) exists.
* Stay operational, not the books of record — the ERP/accounting remains the AP authority (mirrors the JO/release stance, [[ADR-0024]]).

## Considered Options

* **Home:** (A) a standalone CSH app · (B) a **module inside the KTC portal / same Supabase DB** · (C) stay in Excel. → **B** (owner decision): shared auth/roles/PWA, the same `moves`/`equipment` spine, one DB. (C kept as the interim stopgap only.)
* **Estimated-fuel source:** (A) re-enter container counts per equipment (the CSH way) · (B) **derive estimate from the `moves` spine** (Σ handling moves by class × rate). → **B** — single source, no re-keying, reinforces Pillar-2.
* **Actual-fuel capture:** (A) a monthly per-machine matrix typed in · (B) a **per-dispense ledger** (one row per issue), the matrix becoming a derived view, captured via a mobile pump logger. → **B**.
* **Rate / price handling:** (A) a single current value (Excel) · (B) **effective-dated rate tables + audit** (each rate has a valid-from date; edits insert a new dated row; old values preserved). → **B** — historical accuracy + a change record.
* **Variance scope:** (A) one fleet-wide `actual − estimate` number · (B) **per-equipment-class reconciliation** (cranes/RTG by moves, trucks by km, gensets by run-hours). → **B**.

## Decision Outcome

A **fuel module on the same Supabase DB**, built as **derived variance over two append-only ledgers plus the moves spine**:

1. **Actual = a dispense ledger.** `fuel_dispense` — one row per issue (`equipment_id`, `liters`, `occurred_at`, odometer/run-hours, `operator_id`, source, optional `delivery_id`; client-generated UUID for offline-safe upsert). The old per-machine × month matrix becomes a derived view (`fuel_actual_monthly`).
2. **Estimate = derived from moves.** `fuel_estimated_by_class_monthly` = Σ(handling moves by equipment class, from the Pillar-2 `moves` event log) × the **effective** liters/move rate. Until the live move logger lands, an interim `move_tally` (manual/imported monthly counts) satisfies the same view contract — the formula never changes, only its source.
3. **Variance = per class.** `fuel_variance_monthly` = estimate vs actual per equipment class, in liters and pesos (valued at the diesel price **in effect that month**). Positive = actual over estimate.
4. **Deliveries + inventory.** `fuel_delivery` (supplier, PO, invoice, liters, rate, weighbridge gross/tare → net-kg, liters-by-weight, gross amount, VAT base, EWT, net payable as generated/derived columns) feeds `fuel_inventory_monthly` (forwarded + in − out = ending vs `fuel_tank_reading` dipstick = variance).
5. **Effective-dated, audited config.** `fuel_rates` (per class liters/move, with per-machine override) and `fuel_settings` (diesel price, density, EWT %, VAT %) carry an `effective_from` date; an edit **inserts a new dated row** and logs a fuel/security event — so past periods keep their rate and there is a full change history. Read = authenticated, write = `manage_fuel` (mirrors [0030]).
6. **Access.** New owner-tweakable permissions — `log_fuel` (pump/mobile), `manage_fuel` (deliveries, config, reconciliation), `view_fuel_reports` — added to the `role_permissions` matrix and enforced by SECURITY DEFINER RPCs (`log_fuel_dispense`, `record_fuel_delivery`, `set_fuel_rate`, `record_tank_reading`).
7. **Value-add beyond Excel.** Per-machine efficiency (`L/move`, `L/run-hour`, `L/100km`) and peer-anomaly flags — impossible in the flat workbook.

Backend-enforced, forward-only migrations. Phase 0 shipped as **migration 0135** (`0135_fuel_module.sql`; originally authored as 0133, renumbered to resolve a concurrent-work clash with `0133_customer_info_sheet`). The estimate's data source is the same `moves`/`equipment` spine as Pillar-2, so the fuel module and the yard move logger reinforce each other rather than being separate builds. The full design lives in [[Fuel Monitoring (Yard Operations sub-module)]].

### Positive Consequences

* Enter once: dispenses and deliveries are the only inputs; every report (monthly matrix, class variance, per-line, inventory, payable) is a view — the re-keying and cross-sheet drift are gone.
* Variance is meaningful per equipment class and per machine — it can surface the specific leaking unit, which the spreadsheet cannot.
* Rate/price changes are recorded and historically correct — editing today's diesel price never re-prices last month.
* Reuses the config-table, role-gate, audit, RPC, and PWA patterns already in the repo — small, conventional surface area.
* Starts now via `move_tally`; swaps to live moves with no formula change when the logger ships.

### Negative Consequences / Trade-offs

* Until the move logger (Pillar-2 Phase 1) exists, the **estimate** still depends on a manual/imported monthly move tally (the actual side is already first-class via the dispense ledger).
* A mobile pump-logging habit must be adopted by yard staff for the actual ledger to be complete and timely.
* The app computes operational variance and fuel payable for reference; the **ERP/accounting stays the AP system of record** — fuel payable is a feed, not the official ledger.
* New permissions and tables add to the role matrix and migration count.

## Pros and Cons of Options

### Estimate from the moves spine (chosen)

* Good, because container counts are entered once as operational events and fuel derives from them — no re-keying, and it strengthens the Pillar-2 spine.
* Good, because the same view works on an interim `move_tally` and later on live moves with no change.
* Bad, because a full live estimate waits on the move logger; the interim tally is still hand-entered.

### Re-enter counts per equipment (CSH way)

* Good, because it works today with zero dependency on the moves spine.
* Bad, because it reproduces the exact re-keying and drift that make the current workbook clunky.

### Per-dispense ledger + mobile logger (chosen) vs typed monthly matrix

* Good, because the matrix becomes a derived view; per-machine efficiency and anomaly detection become possible; capture happens at the pump in real time.
* Bad, because it requires a mobile-logging routine and more rows than a once-a-month matrix.

### Effective-dated rates (chosen) vs a single current value

* Good, because historical months stay correctly priced and every change is recorded (who/when/old→new).
* Bad, because lookups must select the rate effective for the period — slightly more query/logic than reading one cell.

## Related ADRs

* Extends [ADR-0015](0015-modular-terminal-depot-operating-system-north-star.md) — fuel is a derived module on the operational spine.
* Builds on [[Yard Operations — Pillar 2 (Move Logger + Yard)]] — reuses the `moves` and `equipment` event-log spine as the estimate's source.
* Relates to [ADR-0022](0022-gate-pass-is-container-eir-not-job-order.md) — the container/EIR/equipment spine fuel draws equipment + moves from.
* Reuses the config-table pattern (migration 0030) and the owner-tweakable role gates (`role_permissions`, `has_permission()`), as in [ADR-0024](0024-customer-filed-online-release-pullout-payment.md).

## References

* Source model: CSH `FUEL MONITORING_FEBRUARY 2026.xlsx` (3-layer variance + deliveries + per-line + tank reconciliation).
* Interim stopgap delivered 2026-06-22: `KTC FUEL MONITORING (template).xlsx` (enter-once Excel — CONFIG/EQUIPMENT/LINES + FUEL_OUT/FUEL_IN/VESSEL_LOG ledgers → derived report tabs). The DB module supersedes it.
* Patterns to reuse: `supabase/migrations/0030_pricing_rates.sql` (config + RLS read=authenticated/write=admin), `0035_staff_roles_and_gates.sql` (role_permissions + has_permission), `0040`/`0046` (audit events + `log_jo_event`/`log_security_event`), `src/admin/Settings.tsx` (rate editor), `src/app/AppChecker.tsx` + `AppLayout.tsx` (mobile capture).
* Phase 0 = `0135_fuel_module.sql` (applied 2026-06-22). Design doc: [[Fuel Monitoring (Yard Operations sub-module)]].
* Phasing — P0: schema + config + derived views + import stopgap history. P1: admin fuel desk (deliveries, config, reconciliation, reports). P2: mobile pump-logging PWA. P3: estimate from live moves (replaces `move_tally`). P4: per-machine efficiency + anomaly alerts. P5 (optional): fuel-payable handoff to ERP/AP.
