---
title: Administration Core
tags: [core, administration, wave-1]
type: core
wave: 1
status: live
owner: Owner
last_updated: 2026-07-01
---

# Administration Core

> **Maturity:** LIVE - multi-role back office on an owner-tunable permission matrix.

## Purpose

The internal staff portal: approvals, customer + consignee management, job-order processing across stations, charge/payment-order billing, release desk, support inbox, owner-only staff/access settings, and ops/health tooling.

## Roles & stations

Staff capabilities run on [[Staff Roles & Gates]] (`role_permissions` + `has_permission`). Roles: **admin**, **operations**, **cashier**, **checker**, **csr**, plus owner/root owner.

- **Operations** (`/app/operations`, full page `/admin/job-orders`) - accept orders, hold/reject, assess RPS, mark DEA/OOG done, monitor X-ray, request priority/re-X-ray, add operational charges where permitted, edit JO headers, manage vessel schedule.
- **Checker** (`/app/checker`, full page `/admin/checker`) - per-van X-ray entry confirmation only (`record_van_xray`, `confirm_xray`). View-only otherwise.
- **Cashier** (`/app/payment-orders`, full page `/admin/payment-orders`) - money-only desk: record final charge invoices, confirm/reject charge proofs, bundle charges into Payment Orders, collect Payment Orders, and handle release payment/OR work. No order-status power.
- **CSR** (`/app/support`, full page `/admin/support`) - file JOs for customers, work support inbox, review consignee requests, request priority, and verify release documents where gated.
- **Admin / owner** (`/admin`) - full back office. Admin does not hold `confirm_xray`; owner bypasses through the failsafe.

Retired: `/admin/cashier` and `/app/cashier`.

## Runtime routes

- `/admin` - dashboard.
- `/admin/approvals`, `/admin/customers[/:id]`, `/admin/consignees` - account and master-data administration.
- `/admin/job-orders`, `/admin/new-job-order`, `/admin/checker` - JO operations.
- `/admin/payment-orders`, `/admin/charges`, `/admin/reconciliation`, `/admin/charge-audit` - charge/payment-order spine.
- `/admin/releases` - release/pull-out desk.
- `/admin/vessel-schedule`, `/admin/support`, `/admin/logs`, `/admin/security`, `/admin/settings`, `/admin/manual`.
- Staff app routes: `/app`, `/app/device`, `/app/operations`, `/app/checker`, `/app/payment-orders`, `/app/support`.

## Job-order processing

Explicit status changes go through `staff_transition_order`. Completion normally auto-fires from the service/charge readiness rule; manual complete is only a ready-state fallback.

## Settings

Owner/admin settings cover staff creation, roles/gates, root-owner access, pricing/rates, charge types, payment details, support contact channels, bulletins, notification routing, and system controls.

## Related

- [[Authentication]] - [[Brokers]] - [[Consignees]] - [[Job Orders]] - [[Owner Failsafe]]
- [[Staff Roles & Gates]] - [[Multi-Owner & Root Grants]] - [[Two-Gate Completion]] - [[Cashier Station]] - [[Support Tickets]] - [[Staff Notifications]]
- ADR-0035, ADR-0037, and `docs/smoke-test-08-go-live.md`.