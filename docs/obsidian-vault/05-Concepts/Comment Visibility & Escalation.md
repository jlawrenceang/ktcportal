---
title: Comment Visibility & Escalation
tags: [concept, job-orders, support, moderation]
type: concept
last_updated: 2026-06-16
---

# 💬 Comment Visibility & Escalation

Job-Order comments are a two-way thread between the customer and KTC, but staff also need a place for **internal notes** the customer must never see, and a way to **escalate** a customer comment as a complaint. Built in **`0102`** (on top of the `0070`/`0072` JO timeline + moderation).

## Where comments live

JO comments are `job_order_events` rows with `event = 'comment'`. Customers **never** query `job_order_events` directly — its SELECT RLS is staff-only (`view_job_orders`); customers only ever read the thread through the **`jo_timeline`** SECURITY DEFINER reader (which also filters by ownership). That indirection is what makes per-row visibility safe.

## Two new columns (comment rows only)

- **`visibility`** — `public` (shown to customer + staff) or `staff_only` (internal note, **never** returned to the customer). System/lifecycle events keep the `public` default and are unaffected.
- **`flagged`** — a complaint/escalation marker, surfaced to **staff only**.

## RPCs

- **`add_jo_comment`** (customer, pre-existing) — a normal `public` comment, reviewed by CSR.
- **`add_jo_staff_note(jo, text)`** — staff post an internal `staff_only` comment. Gate `view_job_orders OR manage_support`.
- **`flag_jo_comment(id, flagged)`** — staff flag/unflag a comment as a complaint. Same gate.

## `jo_timeline` rebuild

The reader now returns `visibility` + `flagged` and **hides `staff_only` rows from the customer** (`WHERE v_staff OR visibility = 'public'`). Staff actor names resolve to the real `full_name`; to the customer, staff appear as "KTC". The `JoTimeline` component gained a `staff` prop (internal-note checkbox + flag button).

## CSR flow

Per the owner spec: the customer files comments; **CS reviews** and replies; the reply posts the customer comment + the CS answer. Comments can be categorized **staff-only** and **escalated/flagged** as complaints. All customer comms funnel through the **csr** role (+ admin/owner) — see [[Staff Roles & Gates]].

## Related

- [[Job Order Lifecycle]] · [[Job Orders]] · [[Staff Roles & Gates]] · [[Support Tickets]]
- Migrations `0070`/`0072` (timeline + moderation), `0102` (visibility + escalation)
