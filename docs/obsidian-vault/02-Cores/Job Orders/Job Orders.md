---
title: Job Orders Core
tags: [core, job-orders, wave-1]
type: core
wave: 1
status: in-progress
owner: Broker
last_updated: 2026-06-07
---

# 📝 Job Orders Core

> **Maturity:** IN PROGRESS (broker submission live; admin processing being built)

## Purpose

The core transaction: an approved broker submits a Job Order requesting terminal services (X-ray inspection, DEA exam, OOG stripping, gate/yard requests) against an **approved** consignee. Each order has one or more lines.

## Runtime routes (key)

- `/job-order` — broker creates a job order (`src/pages`)
- `/job-orders` — broker's own job orders (history)
- `/admin/job-orders` — admin view/processing

## Model

- `job_orders` (header) + `job_order_lines` (lines).
- Service requests enumerated in `SERVICE_REQUESTS` (`src/lib/types.ts`) — X-ray / DEA / OOG stripping, etc.
- Job orders may only target **approved** consignees (invariant; see [[Operational Invariants]]).

## Backend surface (key)

- `job_orders`, `job_order_lines` tables (migration `0001_init.sql`)
- RLS: brokers see their own; admins see all
- `one<T>()` normalizer for to-one embeds when joining consignee/broker

## Done

- Schema + broker submission surface + broker history.

## Partial / open

- Admin processing/status workflow on `/admin/job-orders` (statuses, decisions) — building out.
- Per-broker consignee scoping (only show consignees the broker is accredited for).

## Related

- [[Brokers]] · [[Consignees]] · [[Administration]]
- [[Job Order Submission]] — workflow
- ADR-0001, ADR-0005
