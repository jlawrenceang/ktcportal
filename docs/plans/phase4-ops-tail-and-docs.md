# Phase 4 — Ops tail + docs/localization

_Status: ACTIVE · 2026-06-29 · Owner-confirmed scope: "Both, ops first then docs." Continues the 2026-06-28 process/coherence-audit remediation (Phase 1 = T1 blockers shipped v1.6.75; Phase 2 = T2 ops gaps batches 2a–2e; Phase 3 = T3 polish batches 3a–3e2 — all committed on `phase-2-ops-gaps`)._

## Goal

Close the **remaining T2 ops gaps** that Phases 2–3 left, **then** do the **documentation + Tagalog localization** layer that documents/localizes everything Phases 1–4 built. After this the branch equals the audit catalog **except T4** (fuel desk / purchaser / gate module — intentionally deferred).

## Part 1 — leftover T2 ops gaps

| Batch | Items | Scope |
|---|---|---|
| **4a** | T2-18, T2-19, T2-20 | **Checker lanes (frontend-only).** Desktop X-ray Checker: lane/serving column on `XrayQueueTable` + default to lane order + lane chip on the card (mobile `AppChecker` already correct → extract shared `lib/serving.ts`); add "Request re-X-ray" on a completed order at both stations (T2-19); guard the **lookup** path against an unapproved re-X-ray child showing a live Confirm (T2-20; the queue already excludes them — KTC-26). |
| **4b** | T2-31, T2-07 | **Calculator un-gate + Lara copy (frontend-only).** Gate the calculator Generate on quantity alone, not a scheduled vessel (T2-31). Fix the Lara "you can still file now" pending-consignee node to approved-only + "track my request" (T2-07). |
| **4c** | T2-12 | ✅ **DONE.** The worklist (`needs_docs` filter, v1.6.53) + attach path (edit-modal 2303 uploader) already shipped; added the missing "remediation owner" nudge — a bar counting approved consignees missing their 2303, linking to the worklist. No migration (0120's no-block decision preserved). |
| ~~**4d**~~ | T2-01 | ⏸️ **DEFERRED to the go-live security hardening pass** (owner decision 2026-06-29). MFA recovery codes + owner-only clear-staff-factor + break-glass runbook belong with the MFA/Turnstile/owner-password re-enablement, where they can be tested end-to-end (MFA is currently off for testing). Recorded in the go-live checklist. |

**Part 1 status:** 4a/4b/4c shipped on the branch; 4d deferred. Ops tail complete.

### Explicitly NOT built (deferred — do not implement)

- **Terminal-tariff → billing bridge (T2-29/30)** — deferred by **ADR-0036** pending the gate/EIR module (no day-count source for storage). The calculator stays **estimate-only**; the release desk computes charges manually. Only the T2-31 vessel-lockout bug is in scope.
- **T2-17 credit BI-INV completion / T2-36 credit release** — credit flow deferred behind the `payment_terms` flag (ADR-0036).
- **T2-35 ERP/Frappe API** — deferred pending Titus's go-signal (ADR-0036).
- **T4 cluster** — fuel desk, purchaser frontend, gate/EIR module.

## Part 2 — docs + localization

| Batch | Items | Scope |
|---|---|---|
| **4e** | T2-32, T2-33, T2-34, T3-32–35, T2-21 | ✅ **DONE.** Customer release/consignee-request/Help manual + tours (4e-1); admin release section + desk tour; `manual-csr.md` (+tl) wired into GUIDES/ROLE_FLOWS/floorGuide; priority-lane + re-X-ray across admin/ops/checker + tour steps; operations landing reconciled (T2-21). **T3-36 moot** — vessel-request feature retired in phase-2e (0190). |
| **4f** | I18N-01–11 | ✅ **DONE.** `check-i18n-coverage.mjs` guard (the I18N-05 root-cause fix) + `npm run check:i18n` strict; **288** Tagalog entries added → 100% coverage, guard green. Owner reviews wording pre-go-live. |

**Phase 4 COMPLETE** (2026-06-29): 4a/4b/4c (ops tail), 4e/4f (docs + i18n) shipped on the branch; **4d (MFA) deferred** to the go-live security pass. Branch == audit catalog except T4 (fuel desk / purchaser / gate module) + the explicitly-deferred ADR-0036 calculator bridge / ERP API / credit flow.

## Per-batch loop

Each batch: build → (if DB) apply to **sandbox `zwvzadkgeyhkhyshkwhc`** first, behavioural re-test → `tsc --noEmit` / `check-i18n` / `check-security-invariants` as applicable → Jarvis review for any migration/security batch → apply to prod → version bump + CHANGELOG + ship. Frontend-only batches skip the migration steps. Next migration number = **0193** (latest on disk = 0192).
