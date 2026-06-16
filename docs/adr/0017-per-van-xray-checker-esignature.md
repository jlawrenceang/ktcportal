# ADR-0017: Confirm X-ray per container van, by the Checker only, with an immutable e-signature

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-16
* Category: Workflow | Security

## Context and Problem Statement

X-ray confirmation (ADR-0014 era, migration `0035`) was recorded once per whole Job Order, and `confirm_xray` was held by multiple roles. But under one C-number (entry) a Job Order can carry several container vans, and the BOC (Bureau of Customs) — not KTC — actually performs the X-ray; KTC's **checker** confirms that each van *entered the X-ray division*. Whole-order confirmation hid partial progress and let non-checkers mark X-ray done. We needed van-level confirmation, restricted to the checker, with a signature that survives staff-account changes for the printed slip.

## Decision Drivers

* Truthful operational state — partial progress (3 of 5 vans X-rayed) must be visible, not hidden behind an all-or-nothing flag.
* Single accountable role — confirming X-ray entry is the checker's job; operations only monitors; admins shouldn't be able to confirm it.
* Auditable e-signature — the slip should attribute "X-rayed by <name>" with a value that stays correct even if that staff account is later renamed or removed.
* Feed the completion gate — when the last van is confirmed, the X-ray service line rolls up as done (one half of the two-gate rule, ADR-0016).

## Considered Options

* **A — Keep whole-order X-ray confirmation.** Status quo; no partial visibility.
* **B — Per-van confirmation via a gated RPC, roll up to the service line on the last van, snapshot the signer's name (chosen).**
* **C — Per-van, but compute the signer name at print time** (join to the live staff row).

## Decision Outcome

Chosen option: **B.**

**Per-van stamp (`0087`).** `job_order_lines` gains `xray_done_at` / `xray_done_by`. `record_van_xray(p_line_id)` confirms one van: it checks `has_permission('confirm_xray')`, verifies the line is an X-ray service on an open order, stamps the van (idempotently via `coalesce`), then counts remaining un-X-rayed vans. When **zero remain**, it calls `record_service_done(jo, 'xray')`, rolling the X-ray *service line* up to done (which applies the two-gate completion check). A migration backfills already-X-rayed orders' vans from the old whole-JO `xray_performed_at`.

**Checker-only (`0087`, `0095`).** `0087` removed `confirm_xray` from operations (it monitors only). `0095` removed it from **admin** too and dropped the `process_job_orders` fallback in `record_service_done`'s X-ray branch, so no non-checker can mark X-ray done by any path. The owner still bypasses all gates as the failsafe.

**E-signature (`0088`).** `job_order_lines` gains `xray_done_by_name`; `record_van_xray` snapshots the confirming checker's `full_name` at sign time (immutable — `coalesce` keeps the first value), so the slip can show "X-rayed by <name>" correctly even if the account is later renamed or removed.

### Positive Consequences

* Partial X-ray progress is visible per van; the checker works a simple tap-to-confirm list.
* X-ray confirmation has exactly one accountable role; the e-signature is a stable audit record on the document.
* The last-van roll-up plugs cleanly into the two-gate completion machinery (ADR-0016).

### Negative Consequences / Trade-offs

* A new per-line stamp + name column on `job_order_lines`; non-X-ray lines carry them null.
* The immutable name snapshot can go stale (intentionally — that's the signature's point); the *live* `xray_done_by` UID is kept alongside for joins.
* Operations and admin genuinely cannot confirm X-ray — if the checker is unavailable, the owner (failsafe) must step in.

## Pros and Cons of Options

### A: Whole-order confirmation
* Good, because simplest.
* Bad, because no partial visibility and anyone with the gate could confirm.

### B: Per-van + checker-only + name snapshot (chosen)
* Good, because accurate progress, single accountability, durable signature.
* Bad, because extra columns and a hard dependency on the checker role.

### C: Per-van + name computed at print time
* Good, because no stored name column.
* Bad, because the signature changes if the account is renamed/removed — not a true signature.

## Related ADRs

* Required by [ADR-0016](0016-staff-roles-split-gates-two-gate-completion.md) — X-ray completion is one half of the two-gate rule.
* Supports [ADR-0019](0019-public-verify-qr-anti-forgery.md) — the e-signed, fully-X-rayed slip is what the verify QR confirms.

## References

* `supabase/migrations/0087_per_van_xray_and_two_gate_complete.sql` (`record_van_xray`, per-van columns, roll-up, backfill)
* `supabase/migrations/0088_xray_esignature.sql` (`xray_done_by_name`, name snapshot)
* `supabase/migrations/0095_only_checker_confirms_xray.sql` (admin loses `confirm_xray`; X-ray branch hardened)
* `src/admin/Checker.tsx` (per-van tap-to-confirm UI)
