---
title: Staff Notifications
tags: [concept, notifications, administration, rbac]
type: concept
last_updated: 2026-06-16
---

# 🔔 Staff Notifications

The mirror of the customer notification bell (`0071`), but for **KTC staff** and **routed by permission** instead of by recipient. Built in **`0085`**. `StaffNotificationBell` sits in the admin top rail.

## How it routes

A single shared notification row carries a **`required_permission`**. RLS exposes it only to staff who hold that gate via `has_permission()`, so each role sees only the alerts it can act on — and the **owner passes every gate** ([[Staff Roles & Gates]]). One row is never fanned out per recipient; read state is tracked per staff member in a separate `staff_notification_reads` table (the `0077` pattern).

## Triggers

- **Payment proof submitted** (base / RPS / supplement) → `review_payments` (the cashier desk).
- **Support message** (new ticket / customer reply) → `manage_support` (CSR + admin/owner). See [[Support Tickets]].
- **Account submitted its valid ID** → `manage_approvals` (the approvals desk).

Writes go through the SECURITY DEFINER helper `notify_staff` (triggers only); staff only ever SELECT. `mark_staff_notifications_read` is idempotent across everything the caller may see. In-app notifications fire **regardless of the owner email switch** (`emails_enabled = false`, `0074`).

## Related

- [[Administration]] · [[Staff Roles & Gates]] · [[Support Tickets]] · [[Cashier Station]]
- Migration `0085` (staff notifications)
