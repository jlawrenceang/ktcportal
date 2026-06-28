# Phase 4 — Ops tail + docs/localization

_Status: ACTIVE · 2026-06-29 · Owner-confirmed scope: "Both, ops first then docs." Continues the 2026-06-28 process/coherence-audit remediation (Phase 1 = T1 blockers shipped v1.6.75; Phase 2 = T2 ops gaps batches 2a–2e; Phase 3 = T3 polish batches 3a–3e2 — all committed on `phase-2-ops-gaps`)._

## Goal

Close the **remaining T2 ops gaps** that Phases 2–3 left, **then** do the **documentation + Tagalog localization** layer that documents/localizes everything Phases 1–4 built. After this the branch equals the audit catalog **except T4** (fuel desk / purchaser / gate module — intentionally deferred).

## Part 1 — leftover T2 ops gaps

| Batch | Items | Scope |
|---|---|---|
| **4a** | T2-18, T2-19, T2-20 | **Checker lanes (frontend-only).** Desktop X-ray Checker: lane/serving column on `XrayQueueTable` + default to lane order + lane chip on the card (mobile `AppChecker` already correct → extract shared `lib/serving.ts`); add "Request re-X-ray" on a completed order at both stations (T2-19); guard the **lookup** path against an unapproved re-X-ray child showing a live Confirm (T2-20; the queue already excludes them — KTC-26). |
| **4b** | T2-31, T2-07 | **Calculator un-gate + Lara copy (frontend-only).** Gate the calculator Generate on quantity alone, not a scheduled vessel (T2-31). Fix the Lara "you can still file now" pending-consignee node to approved-only + "track my request" (T2-07). |
| **4c** | T2-12 | **2303 backfill worklist (consignee compliance).** Make the picker's cosmetic "docs pending" an actionable admin worklist + attach path (or a grandfather flag). Migration if a flag/RPC is needed. |
| **4d** | T2-01 | **MFA recovery (security; gated on go-live MFA).** Recovery codes at enrolment + an owner-only clear-staff-factor action + a documented owner break-glass. Touches the owner failsafe — Jarvis-review mandatory. **Confirm with owner before building** (interacts with the go-live security re-enablement). |

### Explicitly NOT built (deferred — do not implement)

- **Terminal-tariff → billing bridge (T2-29/30)** — deferred by **ADR-0036** pending the gate/EIR module (no day-count source for storage). The calculator stays **estimate-only**; the release desk computes charges manually. Only the T2-31 vessel-lockout bug is in scope.
- **T2-17 credit BI-INV completion / T2-36 credit release** — credit flow deferred behind the `payment_terms` flag (ADR-0036).
- **T2-35 ERP/Frappe API** — deferred pending Titus's go-signal (ADR-0036).
- **T4 cluster** — fuel desk, purchaser frontend, gate/EIR module.

## Part 2 — docs + localization

| Batch | Items | Scope |
|---|---|---|
| **4e** | T2-32, T2-33, T2-34, T3-32–36, T2-21 | **Manuals + tours.** Release module customer + admin manual sections + tours (T2-32/33); `manual-csr.md` (+tl) + GUIDES/ROLE_FLOWS (T2-34); priority-lane / re-X-ray / consignee-request / Help+Lara / vessel-review doc + tour steps (T3-32–36); reconcile the operations manual landing/tabs (T2-21). |
| **4f** | I18N-01–11 | **Tagalog localization.** Add the missing `tl` keys (tour ~55% English, ADR-0035 priority/re-X-ray/charge cluster, release desk, customer banners, cashier/consignee/settings labels). **I18N-05 root-cause guard** — a CI/precommit check that diffs `t()` first-args + TourStep literals against `Object.keys(tl)` and fails on new untranslated strings (the highest-leverage item — stops recurrence). |

## Per-batch loop

Each batch: build → (if DB) apply to **sandbox `zwvzadkgeyhkhyshkwhc`** first, behavioural re-test → `tsc --noEmit` / `check-i18n` / `check-security-invariants` as applicable → Jarvis review for any migration/security batch → apply to prod → version bump + CHANGELOG + ship. Frontend-only batches skip the migration steps. Next migration number = **0193** (latest on disk = 0192).
