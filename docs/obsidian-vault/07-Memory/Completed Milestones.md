---
title: Completed Milestones
tags: [memory, milestones]
type: memory
last_updated: 2026-06-23
---

# 🏁 Completed Milestones

Newest first.

## 2026-06-23 — JO lifecycle overhaul, tiered storage, dropdown-only vessel, clickable consignees (v1.6.12)

Portal migrations **0151–0158** (single contiguous lane, all applied to prod); `APP_VERSION` = **v1.6.12**. Session: [[2026-06-23 JO Lifecycle Overhaul + Storage Tiers + Consignee UI + Vessel Dedup]].

- **JO lifecycle** (`0151`–`0156`) — **reject is terminal**; **on-hold is field-targeted** (`needs_fields`: staff tick which of consignee/entry/vessel/containers must be re-entered, `0154`); rejecting a **consignee** (`0152`) / suspending or rejecting a **customer** (`0153`) cancels open JOs **except** paid/invoiced; customer **serving-number notification retired** (`0151`); unified **Balance/Paid** payment pill; admin-seeded additional-charge **dropdown** (`additional_charge_types`, `0155`); admin + print fee **merged** (`0156`); **dual-view (Cards/List)** JO lists + admin compact tiles → detail modal; derived **"✓ Cleared for release"** badge.
- **Rate calculator** (`0157`) — per-service granularity (`terminal_rate_config`) + **tiered foreign storage** (`storage_tiers`: cumulative per-day bands for Import/Export/Transhipment × size after free days; domestic flat per-day by size; empties use laden rates) + **Transhipment** trade option; Inbound/Outbound for domestic + colour-coded Foreign/Domestic origin pill; Settings tariff editor rebuilt.
- **Vessel** (`0158`) — removed the manual-entry escape hatch app-wide (dropdown-only); **de-duplicated `vessel_schedule`** (vessel_visit key date↔week flip) + a trigger enforcing one row per (vessel_name, voyage_number).
- **Consignees admin** — clickable rows → detail modal (address, TIN, BIR 2303/2307 viewers, requester name + email, dates, Print CIS); review/edit/delete in the modal.
- **Settings** — tabbed (Pricing & tariff / Operations / Access & staff / System).
- **ST05** — preflight P1–P8 re-run green through `0158` (+ Lane L container rate matrix; server-side Lane J-3 role-matrix = 0 mismatch); read-only RPC backbone check of the release/JO guards. Manual Lanes A–K + **Defect D-01** (blank release-desk reason) open — see [[Pending Items]].
- **Data** — test orders purged to a clean slate; `jo_number_seq` reset (first real JO = `JO-000001`); 0 releases.

## 2026-06-22 — Consignee/vessel requests, CIS-as-accreditation, rate matrix, fuel Phase 0

Portal migrations **0132–0141**; fuel lane **0135/0140/0150** (all applied to prod). Session: [[2026-06-22 Consignee+Vessel Requests, CIS, Rate Matrix, Fuel Phase 0]].

- **Customer-requested consignees & vessels** — `request_consignee` (`0132`) + `request_vessel` (`0137`) create **pending, file-now** records; recoverable **"needs info"** review state (`0138`, new `review_consignee_requests` gate for CSR); customer **My Requests** + admin dashboard pending tile; consignee request requires address + TIN + 2303 (`0139`); vessel +1-day picker allowance (`0139`).
- **Customer Information Sheet = consignee accreditation** — `0133` modeled it on the broker account and gated all filing; **`0136` reverted** that. One customer pool; the CIS lives on the **consignee** (file-now, missing BIR docs flagged not blocked). **Print CIS** = the filled sheet as PDF.
- **Container rate matrix** (`0141`, 4 phases) — `terminal_rates` × **empty/full** × **dry/reefer** (160 combos, 120 new cells `null` → "rate not set"); `job_order_lines` gain size/fill/kind; **redesigned calculator** + admin tariff editor. Live billing untouched (`service_rates`); the X-ray JO stays **operational/unpriced**.
- **Fuel monitoring Phase 0** ([[ADR-0025]]) — backend-only derived-variance module on the moves spine (`equipment` + dispense/delivery ledgers + effective-dated rates + 7 views + RLS + audit), non-admin **`purchaser`** role (`0150`), trigger-ACL fix (`0140`). Applied to prod + committed (`9407d39`), then **deferred** — no frontend. See [[Fuel Monitoring (Yard Operations sub-module)]].
- **UI** — modal standardization (portal modals → `<body>`, no tabbar/footer overlap) + Taglish for the new screens.

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
