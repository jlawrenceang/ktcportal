---
title: Roadmap
tags: [memory, roadmap, planning]
type: memory
last_updated: 2026-06-30
---

# 🧭 Roadmap (Phased)

**Authoritative sequencing for KTC work.** Ordered by what ships next. When a phase finishes, its items move to [[Completed Milestones]] and the next phase becomes *Now*.

Legend: **COMPLETED** · **NOW** · **NEXT** · **LATER** · **PARKED** · **NORTH STAR**.

> **Active focus (2026-06-22):** portal / job-orders. The **fuel-monitoring** module ([ADR-0025](../../adr/0025-fuel-monitoring-derived-variance-on-moves-spine.md)) was started as a parallel lane and is **parked after Phase 0** (schema live, no frontend) — see PARKED below.

> **Active focus (2026-06-30):** ADR-0037 cutover is live; the charges/payment-orders spine is the operational money path. v2.0.11 adds the internal Android staff-app lane: sandbox/live target guardrails, bundled APK, staff-only native gate, offline X-ray-confirmation outbox, `/app/device`, and dormant native push scaffolding (`0232`). Next work is **go-live execution**, not another billing cutover: run the all-roles/all-lanes smoke plus the Android Part 15 device smoke, finish owner/business checklist items, then launch.

## COMPLETED ✅ (through v1.1.0, 2026-06-13)

- Schema + 2,488-consignee import; customer + admin portals; onboarding + approval; owner failsafe + invite-only staff.
- Vercel deploy + `portal.ktcterminal.com`; Turnstile CAPTCHA (server-enforced); full email (Resend).
- Admin job-order processing + serving numbers + checker station + admin file-on-behalf; printable A6 slip.
- Payments (manual proof + review) + calculator + ERP invoice recording (PAID/BILLED); admin-configurable rates/fees + data-driven service catalogue.
- Roles & security: cashier/checker + role matrix, TOTP 2FA, single session, idle timeouts, auto-suspend + watchdog, CSP/headers, ID retention.
- Per-role manuals + tours; version provenance; layered docs system + Playwright (16/16).

## NOW - Go-live smoke + internal Android device check

1. **Run `docs/go-live-smoke-test.md`** end to end: public/customer/staff/RBAC/money invariants plus **Part 15 Android internal app** on a real device. The sandbox APK already builds; device camera/offline-sync/local-notification behavior still needs physical validation.
2. **Operational onboarding** - staff/broker test accounts, DEA/service rates, bank/GCash/QR payment details, and owner side-by-side smoke.
3. **ADR-0037 cutover done** - charges/payment-orders live; old billing path retired; v2.0.7-v2.0.11 hardening layered on top.

## NEXT — Launch gate (owner checklist: `docs/go-live-todo.md`)

1. **Native cloud push activation** - regenerate a valid Supabase `sbp_` PAT, deploy `send-native-push`, then set Firebase service-account secrets plus `native_push_url`/`native_push_secret` in Vault. Until then, native cloud push is configuration-pending, not a smoke failure.
2. **Counsel sign-off on Customer Agreement v4** (final PH pass; NPC registration; DPO mailbox; liability cap). Server-side consent enforcement is already live (`0162`).
3. **Public launch** - remove the prod-testing restriction after smoke sign-off.

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
