---
title: Vessel Schedule Monitoring (BUILT 2026-06-16)
tags: [vessels, import, built]
type: built
requested: 2026-06-11
built: 2026-06-16
---

# 🚢 Vessel Schedule Monitoring — ✅ BUILT (2026-06-16)

> **Built in v1.4.0 — see [[2026-06-16 Vessel Monitoring v2 + Pro Load Test + Busy Banner]] and ADR-0023.**
> The shipped design went further than the CSV-upload proposal below: instead of
> a staff upload, ops keep editing their **live Google Sheet** and a server-side
> `vessel-sync` Edge Function syncs it hourly (+ a manual "Sync sheet" button),
> pulling the schedule in and pushing the **computed Last Free Day** back as a
> mirror. In-house lines are hidden from customers. Migrations `0107`–`0111`.
> The original proposal is kept below for history.

---

**Ask (original):** a vessel-schedule board in the portal, updated by **uploading a sheet**
(staff upload CSV/XLSX → vessel schedules update). Feasible — it's the
"bounded admin import" pattern from decision #11 (validated, idempotent,
logged; NOT live two-way sync).

## Proposed shape

1. **`vessel_schedules` table** — vessel name, voyage no, ETA, ETB, ETD,
   berth, status (expected/arrived/departed), remarks, `imported_at`.
   RLS: read = any authenticated (customers can check schedules too);
   write = staff with a new `manage_vessels` gate (fits the 0035 role matrix).
2. **Admin upload page** — staff upload the schedule sheet (CSV first; same
   client-side parser pattern as the consignee CSV import) → **preview +
   validate** (bad rows surfaced, nothing silently dropped) → confirm →
   **upsert keyed on vessel + voyage** (idempotent; re-uploading the same
   sheet is safe).
3. **Schedule board** — a read-only "Vessel Schedules" page (customer +
   staff), sorted by ETA, searchable; chips for expected/arrived/departed.
4. **Tie-in (later):** the deferred JO fields **vessel/voyage** (gap #2) can
   become a dropdown fed by this table, and the BOC mirror can gain a second
   tab for schedules.

## Open before building
- Exact sheet columns KTC receives (sample file needed) + update cadence.
- Who uploads (admin only, or a `vessel` gate for ops staff)?
- Keep history of past voyages or overwrite?

## Related
- [[Job Order Lifecycle]] (#2 deferred JO fields) · [[BOC Sheets Mirror]]
- Decision #11 (bounded imports, no live two-way sync)
