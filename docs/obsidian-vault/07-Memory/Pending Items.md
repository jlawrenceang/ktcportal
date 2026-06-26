---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-26
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]]. (Completed items moved to [[Completed Milestones]] / `CHANGELOG.md`.)

## ST05 smoke test — open items (NOW)

Preflight **P1–P8 re-run green** through `0158` (2026-06-23; + new Lane L container rate matrix; server-side **Lane J-3** role-matrix check = **0 mismatch**, incl. `purchaser`/fuel + `review_consignee_requests` gates; read-only RPC backbone check of the release/JO guards).

- [ ] **Run manual Lanes A–K** with the owner on `portal.ktcterminal.com`.
- [x] **Defect D-01 (Low) — CLOSED 2026-06-25 (`0159`, v1.6.13):** the release-desk **hold/reject reason note is now server-enforced** — `verify_release_order`, `confirm_release_payment`, and `confirm_release_supplement_payment` RAISE on a blank reason on the reject/hold branch (`p_ok = false`), mirroring the JO side. Verified live: all three function bodies carry the guard.
- [x] **Tagalog copy for previously-untranslated strings DONE 2026-06-25 (v1.6.15):** 174 entries added (release desk, supplements, bulletin, JO lifecycle) — the strings that fell back to English are now translated (tl ~1,469 keys). English was first re-toned formal (v1.6.14). **Owner still reviews the wording before go-live** (both the formal English and the Tagalog).

## Fuel monitoring — DEFERRED after Phase 0 ([ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md))

Phase 0 (schema + derived views + `purchaser` role) is **live in prod and committed** (`9407d39`); the build is **paused** — portal/job-orders takes priority. The DB is ahead of the frontend, so:

- [ ] ⚠️ **Don't create a `purchaser` account until the frontend is wired** — the role exists in the DB but the React app has zero handling, so a purchaser would land in a broken shell.
- [ ] **Phase 1a — wire the role/permissions into the frontend:** add `view_fuel_reports` / `manage_fuel` / `log_fuel` to the `Permission` union (`src/lib/usePermissions.ts`); add a **`purchaser`** column + the 3 fuel rows to the Roles & Gates matrix (`src/admin/Settings.tsx`); add purchaser **routing / label / home / bottom-nav** (`App.tsx`, `AppHome.tsx`, `AppLayout.tsx`, `AdminShell.tsx`, `AdminBottomNav.tsx`).
- [ ] **Phase 1b — `/admin/fuel` desk:** deliveries, effective-dated rate/price editor (mirror `Settings.tsx` "Service rates & fees"), tank readings, the report views.
- [ ] **Phase 2+** — mobile pump logger (`/app/fuel`), estimate from live `moves` (replace `move_tally`), per-machine efficiency + anomaly alerts, optional ERP/AP payable handoff. Full plan: [[Fuel Monitoring (Yard Operations sub-module)]].
- [ ] **Migration lane discipline:** keep portal on `0142+`, fuel on `0151+` (buffer split set 2026-06-22 to avoid concurrent-work clashes).

## Rate matrix follow-ups

- [ ] **Set the 120 new `terminal_rates` cells** (empty/full × dry/reefer combos seeded `null`) with the owner — until then the calculator flags "rate not set" for them.
- [x] **DONE 2026-06-25 (v1.6.14):** the `Settings.tsx` "Current staff" label map now renders **`csr`** and **`purchaser`** correctly (previously fell through to "Admin").

## ST05 / trial run (NOW)

- [ ] **Manual Lanes A–K** on `portal.ktcterminal.com` (see the ST05 section above; preflight P1–P8 ✅ through `0158`). Owner walking lanes now.
- [ ] **P9 / data entry:** real X-Ray rate + the merged admin & print fee, bank/GCash details + QR upload (Settings, owner).
- [x] **Teardown done (2026-06-23):** test orders purged to a clean slate, `jo_number_seq` reset (safe at zero orders) so the first real order is `JO-000001`; 0 releases.

## Go-live gate (NEXT) — owner checklist in `docs/go-live-todo.md`

- [ ] **Google OAuth config** — finish the Supabase URL config (Site URL + redirect allow-list) + set the consent-screen app-name branding, then smoke the flow end-to-end (**ST05 Lane M**). Until enabled the button returns "provider not enabled."
- [ ] **Re-enable security before the staff dry-run** — Turnstile (Managed CAPTCHA) + MFA enrolment (owner + staff) + rotate the owner password (all down for testing).
- [ ] **Counsel sign-off on Customer Agreement v4** — final PH-counsel pass; NPC registration; dedicated DPO mailbox; confirm the **₱100k** liability-cap floor. Bump `AGREEMENT_VERSION` on material change. *(Server-side consent recording + the affirmative-re-acceptance clause are done — `0162` / Agreement v4; the in-app re-acceptance gate on a version bump is still unbuilt.)*
- [ ] **Lara document-verification guide** — owner supplies the content; wire it into Lara's waiting release slot (currently a holding answer). See [[Lara (Customer Assistant)]].
- [ ] Public-launch call (remove the prod-testing restriction).

## JO modernization + port-services billing — ✅ BUILT (2026-06-16)

*Grounded in `docs/reference/` (X-ray JO, RPS, Service Invoice samples). The cluster anticipated below is now live; see [[Job Order Lifecycle]] + [[Staff Roles & Gates]].*

- [x] **`operations` role** ✅ (`0056`) — ops floor: file/process JOs, manage vessel schedule, **assess RPS**, monitor X-ray, tag charges, complete. Plus a **`csr`** role (`0086`) and split processing gates. Roles are data-driven on the `role_permissions` matrix.
- [x] **Vessel schedule + JO vessel/voyage** ✅ (`0057`+, `/admin/vessel-schedule`, `manage_vessel_schedule`); staff edit JO vessel/voyage (`0103`).
- [x] **RPS assessment-driven per-move billing** ✅ (`0062`/`0063`) — `rps_status` (not_assessed/not_needed/needed) + `rps_moves` + `move_rates` (seeded Shifting/Trucking/Lift On/Stripping/Stuffing); own RPS payment; **folded into the completion gate** (`0097`). Base pays now, RPS settled as assessed.
- [x] **Additional-charge supplements** ✅ (`0101`) — JO-####-A/B/C extra charges with own payment + under-review re-completion. See [[Additional-Charge Supplements]].
- [ ] Confirm the **combined X-Ray + DEA** flat figure (₱2,918) + RPS-per-move totals against live rates with the owner.

## Payments / pricing open decisions

- [ ] **Invoice generation trigger** — when is the cashier's Service Invoice produced (on `completed`? "ready for payment"? on demand)? Invoice lives in the **ERP**; app records `OR-INV-`/`BI-INV-` + pad no. as PAID/BILLED.
- [ ] **Payment ↔ cashier handoff** — does an admin-confirmed online payment proof replace the cashier visit for the official BIR invoice/OR, or still require it?

## Integrations / automation

- [ ] **BOC Sheets mirror** — blocked on Google service-account creds (`scripts/setup-boc-mirror.mjs`). One-way app→Sheet only (no two-way sync — bypasses RLS/caps/guards).
- [ ] **Bounded admin import** (staff template sheet → validated RPC upsert) if staff data-entry need materializes; decide fields/who/cadence. Prefer import-to-staging + admin confirm.
- [ ] **Regenerate a real `sbp_` personal access token** — `SUPABASE_ACCESS_TOKEN` in `.env.local` is a secret API key; the 4 Management-API scripts fail until then (see `docs/agent/tooling-inventory.md`).

## Deferred features

- [ ] JO operational fields: container size, plug-in/out timestamps (deferred; vessel/voyage now captured).
- [ ] Per-customer accredited-consignee scoping (ADR-0007 keeps the open master list; revisit on chokepoints).
- [ ] JO draft persistence (document attachments now exist via the JO timeline).
- [ ] **Guard gate-scan module** — log gate-in/gate-out from the verify-QR screen (`gate_events`). Foundation laid in `0089`/`0090`; deferred. See [[Gate Module (gate-in-out)]], [[Verify-QR Anti-Forgery]].
- [ ] Refresh AdminTour fully for the bottom-nav (role tours added; **Lara + dashboard work-surface steps added v1.6.31**; bottom-nav polish pending).

## Testing / CI (LATER)

- [ ] Implement the 4 Playwright mutation `fixme` lanes (registration→approval, consignee CRUD, JO submit, staff creation).
- [ ] Wire Playwright into CI (GitHub Actions) once a workflow exists.
- [ ] Process the 2,488 imported consignees through accreditation over time.

## Ops notes

- Turnstile secret lives only in Supabase; site key in Vercel env (`VITE_TURNSTILE_SITE_KEY`). Env changes need a redeploy.
- Session pooler (`:5432`) can exhaust mid-session → use transaction pooler (`:6543`) for one-off scripts.
- ID purge cron is ACTIVE (Vault has `service_role_key` + `project_url`; verified 2026-06-13). All 6 crons green.

## Docs backlog

- [ ] **Write the 5 recommended ADRs** (flagged in the 2026-06-26 doc-sync) for this run's non-obvious, easy-to-naively-undo decisions: Lara's **non-LLM** choice, **server-side agreement-consent enforcement** (`0162`), **pending → verify-only lockdown** (`0163`), the **disposable-email block** (`0164`), and **Google-OAuth + the scoped `FinishRegistration` consent gate** (`0161`). Docs-only; protects the patterns from a naive undo.

## Related

- [[Roadmap]] · [[Current State]] · [[Home]]
