---
title: Completed Milestones
tags: [memory, milestones]
type: memory
last_updated: 2026-06-16
---

# 🏁 Completed Milestones

Newest first.

## 2026-06-16 — Staff roles, two-gate completion, per-van X-ray, verify-QR

Migrations **0076–0104**, all applied to prod (main @ `1b2e824`). Session: [[2026-06-16 Staff Roles, Supplements, Per-Van X-Ray, Verify]].

- **Staff role matrix** — five staff roles (admin/operations/cashier/checker/csr) + owner/**root owner** on the owner-tunable [[Staff Roles & Gates]] gate matrix; split processing gates enforced in `staff_transition_order`; checker-only X-ray; root-only owner grants ([[Multi-Owner & Root Grants]]) + privilege-grant alerting.
- **[[Two-Gate Completion]]** — completion requires all services + base payment + RPS (if needed) + every supplement, all confirmed; auto-fires + raw-update backstop.
- **Per-van X-ray** + immutable e-signature; **[[Verify-QR Anti-Forgery|public verify-QR]]** anti-forgery; **[[Cashier Station]]** + walk-in payment; **[[Additional-Charge Supplements]]** + under-review.
- **Generalized priority queue** (one per JO), **[[Comment Visibility & Escalation]]**, staff JO-header edit.
- Earlier same-day: reworked rate calculator + per-line charge rules, **[[Support Tickets]]**, admin bottom-tab nav, **[[Staff Notifications]]**, consolidated customer email, atomic filing.

## 2026-06-13 — Doc governance + ST02 trial run

- ST02 preflight green (P1–P8); doc governance hardened to jta-sys parity; vault resynced; TOS north-star ADR-0015. Session: [[2026-06-13 Doc Governance + ST02 Trial Run]].

## 2026-06-07 — Deploy + CAPTCHA + Docs System

- Deployed to Vercel; custom domain **`portal.ktcterminal.com`** live (DNS on Vercel, valid HTTPS, SPA deep-links).
- **Cloudflare Turnstile CAPTCHA** on login + registration, **server-enforced** in Supabase Auth (verified `captcha_failed` without a token). Owner-safe (`create_staff` bypasses the auth API).
- Vercel CLI installed + linked.
- **Layered documentation system** mirroring jta-sys: constitution (`CLAUDE.md` + `AGENTS.md`), `docs/agent/*`, ADRs 0001–0006 + `/adr` command, and this Obsidian vault.
- Session: [[2026-06-07 Deploy + CAPTCHA + Docs System]].

## 2026-06-05 — Schema + Portals

- Initial schema: migrations `0001_init` … `0010_create_staff`, all applied + verified against the KTC DB.
- Imported **2,488 consignees** from `Customer.csv`.
- Owner seeded (`jla.ktcport@gmail.com`, `is_owner`).
- Broker portal (register w/ valid-ID upload, pending→approved gate, home) + admin portal (approvals, brokers, consignees, job orders, settings).
- Consignees: search, pagination, CRUD, duplicate guards, approval, accreditation (address/TIN/2303).
- Owner-only staff creation via `rpc('create_staff')` (username + password, no email) — verified end-to-end.

## Related

- [[Current State]] · [[Roadmap]] · [[Home]]
