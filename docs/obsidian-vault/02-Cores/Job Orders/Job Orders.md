---
title: Job Orders Core
tags: [core, job-orders, wave-1]
type: core
wave: 1
status: live
owner: Customer
last_updated: 2026-06-10
---

# 📝 Job Orders Core

> **Maturity:** LIVE (customer submission + admin processing + printable slip)

## Purpose

The core transaction: an approved broker submits a Job Order requesting terminal services (X-ray inspection, DEA exam, OOG stripping, gate/yard requests) against an **approved** consignee. Each order has one or more lines.

## Runtime routes (key)

- `/job-order` — customer creates a job order; **bulk-paste** containers (uncapped); file → redirect to `/job-orders`
- `/job-orders` — customer's own orders, **collapsible cards** w/ status badges; Print slip on approved
- `/job-order/:id/print` — **printable A6 slip** (mini KTC Service Invoice; ON PROCESS watermark while processing)
- `/admin/job-orders` — admin queue + **processing actions** (excludes `held`)

## Model

- `job_orders` (header) + `job_order_lines` (lines) + `admin_note` (customer-visible, set on hold/reject).
- Service requests enumerated in `SERVICE_REQUESTS` (`src/lib/types.ts`) — X-ray / DEA variants / OOG stripping.
- Consignee is chosen from the **master list** via a searchable typeahead. Per-customer accreditation is disabled (ADR-0007) — only the account-approval gate applies.
- **Statuses:** `held` (unverified customer, queue-hidden) → `submitted` (on approval) → `processing` (=approved, admin action) → `completed`; or `on_hold` (admin needs info) / `rejected` (admin declined) / `cancelled`.

## Processing workflow (ADR-0014, migration `0029`)

- "Approve = start processing": admin advances `submitted → processing → completed`, or sets **on_hold** / **rejected** with a `admin_note` shown to the customer.
- **Caps** (`enforce_order_caps`, INSERT): pending = 10 `held`; verified = 10 open (`submitted`/`processing`/`on_hold`). JO numbers assigned by `ensure_jo_number` on first live status (atomic `nextval`).
- **Printable slip** available once approved (processing/completed); customer prints own (RLS), admin prints any.

## Backend surface (key)

- `job_orders`, `job_order_lines` tables (`0001_init`); statuses + `admin_note` + admin UPDATE policy (`0029`)
- RLS: customers see/insert their own (no UPDATE); admins see all + UPDATE (`is_admin()` incl. owner)
- `one<T>()` normalizer for to-one embeds when joining consignee/customer

## Done

- Schema + customer submission + history + bulk paste.
- Admin processing (approve/process · hold · reject w/ note · complete).
- Printable A6 job-order slip (invoice-style; price column reserved).

## Partial / open

- **Pricing** — slip has an Amount column + totals slot reserved; no price fields in the DB yet.
- Per-customer consignee scoping (only show consignees the customer is accredited for).
- Draft persistence, document attachments, customer edit/cancel of own order.

## Related

- [[Brokers]] · [[Consignees]] · [[Administration]]
- [[Job Order Submission]] — workflow
- [[Job Order Lifecycle]] — **full state/transition/numbering source of truth (finalize before final build)**
- ADR-0001, ADR-0005, ADR-0012 (held lifecycle), ADR-0014 (processing + printable slip)
