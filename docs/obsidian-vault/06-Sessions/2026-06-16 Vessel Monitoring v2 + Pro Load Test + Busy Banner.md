---
title: 2026-06-16 Vessel Monitoring v2 + Pro Load Test + Busy Banner
tags: [session, vessels, sync, loadtest, reliability]
date: 2026-06-16
---

# 2026-06-16 — Vessel Monitoring v2, Pro load test, server-busy banner

Continuation of the 2026-06-16 build. App version **v1.4.0**. Migrations through **0111**.

## Vessel schedule v2 (Google Sheet sync) — ADR-0023
Reworked the vessel schedule to match KTC's real **"VESSEL MONITORING"** Google Sheet (one running list) and wired a server-side sync.

- **`vessel-sync` Edge Function** — hourly (pg_cron→pg_net, `0107`) + on-demand **"Sync sheet"** button (`trigger_vessel_sync`, `0109`). **Pull** Sheet→`vessel_schedule`; **push** the app-computed **Last Free Day** back into a locked mirror column. Auth by a Google service account (Editor); **no Apps Script** in the sheet.
- **14-col layout** (`0110`, `format-vessel-sheet.mjs`): Shipping Line · Vessel · Voyage · Arrival(date+`1653H` time) · Last Discharge(date+time) · Last Free Day(auto) · Departure(date+time) · Berth · Week · Remarks · Cancelled. Visible friendly header over a **hidden canonical schema row**; Shipping Line + Cancelled dropdowns; locked header block + LFD column; date/time stored as literal text.
- **`vessel_visit` derived** (name+voyage+week/arrival), immutable on edit. **In-house line hiding** (`shipping_lines.internal`, Gothong/Philcement/New Asia) — backend SELECT policy hides them from customers, staff see all; toggle in Settings.
- Admin Vessel Schedule page + Settings reworked accordingly. See [[Vessel Schedule Monitoring]] (now built).

## Adversarial review (ultracode) → fixes in 0111
Multi-agent review of the v2 work: **15 confirmed findings**. Fixed the high/medium before release:
- **In-house leak** — exact `NOT IN` was case/space-sensitive; a free-text `gothong`/`Gothong ` leaked a vessel to customers → now `lower(btrim(...))`.
- **Derived-key collision** — folded `week` into `vessel_visit` so distinct weekly calls don't collapse.
- **Edit orphaning** — `vessel_visit` immutable on in-app edit.
- **`current_is_staff()`** — now ANDs `session_alive()`+`aal_satisfied()` (0049/0055 pattern).
- Lows deferred (sync time/week coercion, optimistic "Sync now", `internal` flag readable).

## Pro-tier load test (prod)
300 customers + full staff roster → 3000 `file_job_order` @ 300 in-flight + approvals, then scoped cleanup. **~136 successful filings/sec, p50 856ms / p99 5.2s, INTEGRITY CLEAN** (0 dup serving numbers / JO numbers, cap enforced exactly). The only ceiling was **GoTrue session-minting** (Pro doesn't raise it) — a synthetic-harness limit, not a production concern. See [[loadtest-and-prelaunch-hardening-2026-06-16]].

## Reliability — "servers are busy" banner
Wrapped the Supabase fetch to flag overload (429/502/503/504/network) → a debounced global **banner + Refresh button** instead of a raw error (`ServerBusyBanner`). A manual reload can't double-submit a filing; a true idempotency guard for auto-retry of writes is a future item.

## Open / next
- Vessel `shipping_lines` free-days need configuring in Settings for LFD to compute.
- Test vessel rows + sheet samples pending a clear (start-fresh) — needs explicit go-ahead (mass prod delete).
- Deferred lows from the review; idempotent filing-retry guard.
