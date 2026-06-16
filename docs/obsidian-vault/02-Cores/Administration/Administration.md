---
title: Administration Core
tags: [core, administration, wave-1]
type: core
wave: 1
status: live
owner: Owner
last_updated: 2026-06-16
---

# 🛡️ Administration Core

> **Maturity:** LIVE — multi-role back office on an owner-tunable permission matrix

## Purpose

The internal staff portal: approvals, customer + consignee management, job-order processing across stations (operations / checker / cashier / CSR), payment review, rates/fees config, support inbox, owner-only staff & access settings, and ops/health tooling.

## Roles & stations

Staff capabilities run on the [[Staff Roles & Gates]] matrix (`role_permissions` + `has_permission`, owner-tunable in Settings → **Roles & Gates**). Roles: **admin · operations · cashier · checker · csr** (+ owner/root owner). Each lands where its role works (`RoleLanding`).

- **Operations** (`/admin/job-orders`) — accept orders, assess RPS, mark DEA/OOG done, monitor X-ray, **tag additional charges**, complete; **edit JO headers** (`staff_edit_job_order`, `0103`); manage the vessel schedule.
- **Checker** (`/admin/checker`) — **per-van X-ray entry confirmation only** (`record_van_xray`, `confirm_xray`; tablet-first tap list). View only otherwise.
- **Cashier** ([[Cashier Station]], `/admin/cashier`) — focused payments desk: review online proofs, **record walk-in/office payments**, review supplement payments (4 sections incl. additional charges), record the ERP invoice (= PAID), complete once paid; edit JO headers.
- **CSR** (`/admin/support`) — file JOs for customers + work the [[Support Tickets|support inbox]]; never changes order status.
- **Admin / owner** (`/admin`) — full back office (admin holds every gate **except `confirm_xray`**, `0095`).

## Runtime routes (key)

- `/admin` — dashboard · `/admin/approvals` — account approvals
- `/admin/customers[/:id]` — customer management · `/admin/consignees` — consignees (see [[Consignees]])
- `/admin/job-orders` — JO queue + gated transitions (excludes `held`)
- `/admin/new-job-order` — file on behalf · `/admin/checker` — X-ray station · `/admin/cashier` — [[Cashier Station]]
- `/admin/vessel-schedule` · `/admin/support` — [[Support Tickets|support inbox]]
- `/admin/logs` · `/admin/security` · `/admin/settings` · `/admin/manual`
- Admin shell: top rail (logo + role badge + [[Staff Notifications|staff bell]]) + `AdminBottomNav` (floating bottom tabs, permission-gated, mirrors the customer nav).

## Job-order processing (gated transitions)

The old admin-only direct UPDATE is gone — explicit actions go through **`staff_transition_order`** with the **split gates** (`accept_orders` / `hold_reject_orders` / `complete_orders`, `0086`/`0097`). Completion obeys [[Two-Gate Completion]]. See [[Job Order Lifecycle]].

## Settings (owner-only unless gated)

- **Create staff** — `rpc('create_staff', {username, password, full_name, role})` (role ∈ admin/operations/cashier/checker/csr); username login, no email.
- **Roles & Gates** — toggle each role × permission ([[Staff Roles & Gates]]).
- **Owner access** — root-only `set_owner_access` grants/revokes secondary owners ([[Multi-Owner & Root Grants]]).
- **Service rates & fees**, **terminal tariff**, **per-line charge rules**, **RPS move rates**, **payment details (bank/GCash/QR)**, **support contact channels**, **bulletins**.

## Notifications & ops

- **[[Staff Notifications]]** (`0085`) — permission-routed staff bell: payment proof → `review_payments`, support message → `manage_support`, account ID → `manage_approvals`; owner sees all.
- **Privilege-grant alerting** (`0092`) + **System health** / Logs / 15-min ops watchdog.

## Deployment / ops

- Vercel project `ktc-joborderform` → `portal.ktcterminal.com` (DNS on Vercel). `vercel.json` ships full security headers. See `docs/agent/runtime-data-safety.md` and [[Current State]].

## Related

- [[Authentication]] · [[Brokers]] · [[Consignees]] · [[Job Orders]] · [[Owner Failsafe]]
- [[Staff Roles & Gates]] · [[Multi-Owner & Root Grants]] · [[Two-Gate Completion]] · [[Cashier Station]] · [[Support Tickets]] · [[Staff Notifications]]
- ADR-0001, ADR-0004, ADR-0006, ADR-0014
