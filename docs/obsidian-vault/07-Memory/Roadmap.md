---
title: Roadmap
tags: [memory, roadmap, planning]
type: memory
last_updated: 2026-06-13
---

# 🧭 Roadmap (Phased)

**Authoritative sequencing for KTC work.** Ordered by what ships next. When a phase finishes, its items move to [[Completed Milestones]] and the next phase becomes *Now*.

Legend: **COMPLETED** · **NOW** · **NEXT** · **LATER** · **NORTH STAR**.

## COMPLETED ✅ (through v1.1.0, 2026-06-13)

- Schema + 2,488-consignee import; customer + admin portals; onboarding + approval; owner failsafe + invite-only staff.
- Vercel deploy + `portal.ktcterminal.com`; Turnstile CAPTCHA (server-enforced); full email (Resend).
- Admin job-order processing + serving numbers + checker station + admin file-on-behalf; printable A6 slip.
- Payments (manual proof + review) + calculator + ERP invoice recording (PAID/BILLED); admin-configurable rates/fees + data-driven service catalogue.
- Roles & security: cashier/checker + role matrix, TOTP 2FA, single session, idle timeouts, auto-suspend + watchdog, CSP/headers, ID retention.
- Per-role manuals + tours; version provenance; layered docs system + Playwright (16/16).

## NOW 🎯 — Trial run → go-live

1. **ST02 manual Lanes 1–8** on live (owner) + **P9** rates/payment-details entry. See [[Pending Items]] / `docs/smoke-test-02-portal.md`.
2. **ST02 teardown** — reset `jo_number_seq`/`broker_code_seq` so the first real order is `JO-000001`.

## NEXT — Launch gate

3. **Counsel sign-off on Customer Agreement v2** (DPO, NPC registration, liability cap).
4. **Public launch** — remove the prod-testing restriction.

## LATER — Hardening & integrations

5. BOC Sheets mirror (blocked on Google service-account creds); bounded admin import if needed.
6. Implement the 4 Playwright mutation `fixme` lanes; wire Playwright into CI.
7. Per-customer accredited-consignee scoping; JO drafts + document attachments; status-change notifications.

## NORTH STAR ⭐ — Terminal + Depot Operating System

The endgame: create/upgrade KTC's existing TOS into an **Octopi-class, modular Navis-style terminal + depot operating system**. The portal so far solved **ancillary-services queuing** (one module); the next foundation is the **container/EIR data spine**, then gate / depot-M&R / yard / billing / EDI.

- Vision: [[Terminal & Depot Operating System (North Star)]]
- Decision: **ADR-0015** · Grounded brief: `docs/research/navis-tos-landscape-2026-06-13.md`
- Gating question: what is KTC's *existing* TOS today (decides create-vs-upgrade)?

## Related

- [[Current State]] · [[Pending Items]] · [[Completed Milestones]] · [[Release Waves]] · [[Home]]
