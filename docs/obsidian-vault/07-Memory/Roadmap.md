---
title: Roadmap
tags: [memory, roadmap, planning]
type: memory
last_updated: 2026-06-29
---

# 🧭 Roadmap (Phased)

**Authoritative sequencing for KTC work.** Ordered by what ships next. When a phase finishes, its items move to [[Completed Milestones]] and the next phase becomes *Now*.

Legend: **COMPLETED** · **NOW** · **NEXT** · **LATER** · **PARKED** · **NORTH STAR**.

> **Active focus (2026-06-22):** portal / job-orders. The **fuel-monitoring** module ([ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md)) was started as a parallel lane and is **parked after Phase 0** (schema live, no frontend) — see PARKED below.

> **Active focus (2026-06-29):** Phase-5 verification + **v1.7.0→v1.7.5 shipped**, and **[ADR-0037](../../adr/0037-jo-as-atomic-move-payment-orders-1-1-1-invoicing.md) Phase A is now BUILT** — the **anti-fraud X-ray billing spine**: backend migrations `0202`–`0211` (applied to prod, **additive** — nothing dropped, Jarvis-verified) + **10 new frontend screens** (typecheck-clean, additive). It is **NOT yet wired into the live flow** — the **old base/RPS/supplement payment model is still operational**. **Next major work = the ADR-0037 CUTOVER:** the surgical, large-blast-radius switch onto the `charges`/`payment_orders` spine (`file_job_order` creates the base charge + upserts containers; one-rule completion; monthly serving `YYMM-XXXX`; consignee-read RLS tightened to `search_consignees`; staff-cancel → admin-only; **then** the destructive drops of the old billing tables — atomic, together → Jarvis + e2e + a data-isolated break-test). The **user-facing manuals + demo tours + walkthrough video land WITH the cutover.** See [[2026-06-29 X-ray Phase A Anti-Fraud Billing Build (backend + frontend, cutover deferred)]] + [[target-architecture-jo-payment-invoice]]. Carry-over backlog: [[Pending Items]].

## COMPLETED ✅ (through v1.1.0, 2026-06-13)

- Schema + 2,488-consignee import; customer + admin portals; onboarding + approval; owner failsafe + invite-only staff.
- Vercel deploy + `portal.ktcterminal.com`; Turnstile CAPTCHA (server-enforced); full email (Resend).
- Admin job-order processing + serving numbers + checker station + admin file-on-behalf; printable A6 slip.
- Payments (manual proof + review) + calculator + ERP invoice recording (PAID/BILLED); admin-configurable rates/fees + data-driven service catalogue.
- Roles & security: cashier/checker + role matrix, TOTP 2FA, single session, idle timeouts, auto-suspend + watchdog, CSP/headers, ID retention.
- Per-role manuals + tours; version provenance; layered docs system + Playwright (16/16).

## NOW 🎯 — ADR-0037 cutover (pre-launch reshape) → trial run → go-live

1. **ADR-0037 cutover (next-up; pre-launch reshape).** Wire the live money path onto the now-**BUILT** `charges`/`payment_orders` spine, then drop the old billing tables (atomic) → Jarvis + e2e + a data-isolated break-test. The **user-facing manuals + demo tours + walkthrough video land with it.** See the active-focus callout above + [[Pending Items]].
2. **ST05 manual Lanes A–K** on live (owner) + **P9** rates/payment-details entry; preflight P1–P8 green through `0158`. See [[Pending Items]]. (Defect D-01 **closed** `0159`.)
3. ✅ **Teardown done (2026-06-23)** — test data purged + `jo_number_seq` reset so the first real order is `JO-000001`.

## NEXT — Launch gate (owner checklist: `docs/go-live-todo.md`)

3. **Google OAuth config** — Supabase URL config + consent-screen branding, then smoke (ST05 Lane M).
4. **Re-enable security** — Turnstile + MFA enrolment + owner password rotation (all down for testing).
5. **Counsel sign-off on Customer Agreement v4** (final PH pass; NPC registration; DPO mailbox; ₱100k cap). Server-side consent enforcement is already live (`0162`).
6. **Public launch** — remove the prod-testing restriction.

## LATER — Hardening & integrations

5. BOC Sheets mirror (blocked on Google service-account creds); bounded admin import if needed.
6. Implement the 4 Playwright mutation `fixme` lanes; wire Playwright into CI.
7. Per-customer accredited-consignee scoping; JO drafts + document attachments; status-change notifications.

## PARKED ⏸️ — Fuel monitoring (Phase 0 done)

**Derived-variance fuel module** on the [[Yard Operations — Pillar 2 (Move Logger + Yard)|moves]] spine ([ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md)). **Phase 0 is live in prod + committed** (schema, ledgers, effective-dated rates, 7 derived views, `purchaser` role). **Resume when the portal lane gives way:** wire the role + 3 fuel permissions into the frontend, then build the `/admin/fuel` desk → mobile pump logger → estimate-from-live-moves → efficiency/anomaly. Detail in [[Pending Items]] + [[Fuel Monitoring (Yard Operations sub-module)]]. It also pulls **Pillar 2** (the yard move logger) forward, since the fuel estimate reads the same `moves`/`equipment` spine.

## NORTH STAR ⭐ — Terminal + Depot Operating System

The endgame: create/upgrade KTC's existing TOS into an **Octopi-class, modular Navis-style terminal + depot operating system**. The portal so far solved **ancillary-services queuing** (one module); the next foundation is the **container/EIR data spine**, then gate / depot-M&R / yard / billing / EDI.

- Vision: [[Terminal & Depot Operating System (North Star)]]
- Decision: **ADR-0015** · Grounded brief: `docs/research/navis-tos-landscape-2026-06-13.md`
- Gating question: what is KTC's *existing* TOS today (decides create-vs-upgrade)?

## Related

- [[Current State]] · [[Pending Items]] · [[Completed Milestones]] · [[Release Waves]] · [[Home]]
