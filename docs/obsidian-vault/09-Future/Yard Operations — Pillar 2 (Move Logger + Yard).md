# Yard Operations — Pillar 2 (Move Logger + Yard System)

**Owner:** Lawrence (sole builder, no in-house IT). **Principle:** simple & maintainable beats clever; ship each phase before the next; prefer **derived data** over hand-maintained state; keep **planned vs actual** strictly separate.

Source roadmap: owner upload `terminalyardsystemroadmap1.md` (2026-06-21). This is the second pillar of the KTC system, on the **same Supabase database** as the portal (Pillar 1). It is the concrete start of the container/EIR data spine ([ADR-0015](../../adr/0015-modular-terminal-depot-operating-system-north-star.md) north star; [ADR-0022](../../adr/0022-gate-pass-is-container-eir-not-job-order.md) gate pass = container/EIR, not the JO).

## The one idea that makes it work
`moves` is an **event log** and the single source of truth. **Current location, container aging, bay occupancy, per-equipment move counts are all DERIVED** (Postgres views) from the latest moves — never stored by hand. That kills most human error before it starts.

## Data model
**Reference:** `shipping_lines` (code, name) · `bays` (code `A-01`, zone, capacity) · `equipment` (code `RTG-02`, type, status) · `operators` (name, code/PIN for shared-tablet login).

**`containers`:** `van_number` (PK, ISO no.), `shipping_line_id`, `size_type` (20GP/40HC…), `status` (in-yard/gated-out), `first_seen_at`.

**`moves`** (the heart):
- `id` — **client-generated UUID** (offline-safe upserts)
- `van_number`, `move_type` (`lift_on`/`lift_off`/`reposition`/`gate_in`/`gate_out`)
- `bay_from` (null for gate-in), `bay_to` (null for gate-out / lift to vessel)
- `equipment_id`, `shipping_line_id`, `operator_id`
- `occurred_at` (real device time = the truth), `synced_at` (server received)
- `shift_id`, `device_id`, `job_order_id` (nullable — links a billable move to a JO), `billable` (bool)
- Every move captures the **three essentials: van number, bay, shipping line.**

**Derived (views):** current location = `bay_to` of latest move per van · aging = `now()` − `occurred_at` of the move into the current bay · bay occupancy % by shipping line · moves per equipment per day (= the lift-on/lift-off billing number).

**Billable rule (decided):** `lift_on`/`lift_off` = billable; yard repositions = not.

## Offline sync (Phase 1 onward)
Tablet writes each move to **IndexedDB** immediately (operator never waits). Each move's **device UUID** is its PK → **upsert** makes batch re-syncs idempotent (no dupes). Sync on reconnect and/or a "Sync now" button at shift turnover (~12h). **No real conflicts** — every move is an independent timestamped event; only impossible sequences (e.g. lift from a bay the container isn't in) get **flagged to a review queue**, not blocked. Tooling: hand-rolled IndexedDB+upsert first; reach for **PowerSync** only if it gets painful.

## Key decisions (made)
- **Move logger = offline-first PWA** on tablets (mounted in RTGs). Minimal taps: equipment → move type (lift/drop) → container no. → bay → shipping line → **confirmation screen** → submit.
- **Bay = dropdown, not GPS** (GPS only ~10–20 m, can't tell bays apart).
- **Error prevention:** confirmation screen + Supabase validation (no container in two bays at once; a lift must come from the container's current bay; unknown van numbers → review queue).

## Phases (ship in order)
0. **Foundations** — schema + seed reference data + derived views (`current_inventory`, `container_aging`, `bay_occupancy`, `equipment_moves_daily`) + validation. Deliverable: a correct empty DB you can hand-log into and watch inventory/aging update.
1. **Move logger** — offline-first PWA. Delivers per-equipment move counts (billing numbers) immediately.
2. **Live inventory + aging** — derived from moves; trustworthy aging independent of the existing TOS.
3. **Yard map** — read-only visual map; per-bay breakdown by shipping line (e.g. 60% Maersk / 40% Evergreen).
4. **Billing tie-in** — link billable moves to `job_order_id` so lift-on/lift-off charges flow from operational data.
5. **Planning tool** — drag-and-drop **simulation** sandbox (produces a worklist; does NOT execute — keeps plan vs actual separate).
6. **Optimization** — use vessel schedules + berthing to suggest bay placements minimizing total moves. Advanced; only after 1–3 are solid.

## Relationship to Pillar 1 (the portal)
Same Supabase DB. The portal handles customer-facing **Job Orders** (special services) + the **release/pull-out** flow ([ADR-0024](../../adr/0024-customer-filed-online-release-pullout-payment.md)). The yard system is the **operational spine**: `job_order_id` on a billable move is the bridge — lift charges flow from real moves into the JO/billing instead of being re-counted by hand.
