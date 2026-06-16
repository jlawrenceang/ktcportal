# ADR-0023 — Vessel schedule via a Google Sheet ↔ app sync (with computed Last Free Day mirror)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Supersedes:** the "upload a CSV" proposal in `docs/obsidian-vault/09-Future/Vessel Schedule Monitoring.md`
- **Related:** ADR-0015 (modular TOS north star), migrations `0057`–`0059` (vessel_schedule + free-days), `0107`–`0111`

## Context

Operations already maintain a live **"VESSEL MONITORING"** Google Sheet (one running list: vessel · voyage · arrival/last-discharge/departure each as a date + military time `1653H` · shipping line · week). The portal needs that schedule so customers can file Job Orders against the right vessel and so the **Last Free Day of Storage** (finish-discharging + the shipping line's import free-days) is visible. The earlier plan was a staff CSV upload; ops preferred to keep editing their existing sheet rather than re-upload.

Constraint (decision #11, CLAUDE.md): **Supabase must stay source of truth** — a sheet bypasses RLS / caps / numbering. So no live two-way sync of authoritative data.

## Decision

A **server-side Edge Function (`vessel-sync`)** brokers a narrow, one-way-plus-mirror sync, authenticated by a Google **service account** (Editor on the sheet). **No Apps Script lives in the sheet** — all logic is in the repo.

- **Pull (Sheet → app):** hourly (pg_cron→pg_net, `0107`) and on-demand (permission-gated `trigger_vessel_sync` RPC behind a "Sync sheet" button, `0109`; the cron secret stays in Vault, never in the browser). Upserts `vessel_schedule`; only adds/updates, never deletes (`cancelled=TRUE` retires a visit).
- **Push (app → Sheet):** the same run writes the **app-computed Last Free Day** back into one **locked mirror column** so ops + cashiers see it in the sheet. The app never reads that column back in — it stays source of truth.
- **Sheet shape (`format-vessel-sheet.mjs`):** a visible friendly header over a **hidden canonical schema row** (the sync matches the hidden names; header-row detection keys on `voyage_number` to avoid friendly-label collisions), date/time columns kept as literal text, Shipping Line + Cancelled dropdowns, and a locked header block + LFD column.
- **`vessel_visit` is derived** (name + voyage + week/arrival discriminator), not entered — immutable on in-app edit so a rename can't orphan linked JOs.
- **In-house lines** (`shipping_lines.internal`, e.g. Gothong/Philcement/New Asia) are **hidden from customers** by a backend SELECT policy (case-insensitive match) and shown to staff via `current_is_staff()` (hardened with `session_alive()`/`aal_satisfied()`).

## Consequences

- **Good:** ops keep their familiar tool; the app gets validated, idempotent data; Last Free Day is computed once (in the view) and mirrored, never duplicated; the whole contract is versioned in the repo, not in fragile in-sheet macros.
- **Cost / caveats:** the Google service account must stay **Editor** (the mirror writes). Dual-entry — for any vessel present in the sheet, the hourly sync wins over in-app edits. Free-days per line must be configured in Settings for LFD to compute. The derived key folds `week` in to keep distinct weekly calls from colliding; same vessel+voyage+week twice in one sheet would still collapse (acceptable — that's not a real second call).
- **Verified:** adversarial review (15 findings) + a Pro-tier prod load test (~136 filings/sec at 300 in-flight, zero integrity failures) before release; the in-house leak, derived-key collision, and staff-gate hardening were fixed in `0111`.
