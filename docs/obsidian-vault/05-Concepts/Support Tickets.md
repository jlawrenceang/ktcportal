---
title: Support Tickets
tags: [concept, support, csr, administration]
type: concept
last_updated: 2026-06-16
---

# 🎫 Support Tickets

A two-ended ticketing system for customer support, built in **`0083`**. Customers open threads at `/support`; staff work them in the inbox at `/admin/support`. **Live chat was deliberately NOT built** — the owner chose tickets-only; the escalation path is a deep-link hand-off.

## Model

- `support_tickets` + `support_messages` — SELECT-only RLS; **all writes via SECURITY DEFINER RPCs**: `open_ticket`, `post_ticket_message`, `set_ticket_status`, `log_ticket_escalation`.
- **5-open-ticket cap** per customer.
- Contact channels live in `support_contact`, edited in Settings.

## Customer side (`/support`)

- Threads + replies. **"Talk to an agent"** deep links (tel / sms / Viber / mailto) with a prefilled ticket reference — each click logged as an escalation.

## Staff side (`/admin/support`)

- Inbox is **CSR + Admin/Owner only**. Operations lost `manage_support` in `0086` — **all customer comms funnel through CSR** ([[Staff Roles & Gates]]).
- Gate = **`manage_support`**. Staff reply → a [[Staff Notifications|staff bell]] notification on the customer side.

## Relationship to JO comments

Distinct from JO-thread comments ([[Comment Visibility & Escalation]]): support tickets are account-level / general support; JO comments live on a specific order's timeline.

## Related

- [[Administration]] · [[Staff Roles & Gates]] · [[Staff Notifications]] · [[Comment Visibility & Escalation]]
- Migration `0083` (support tickets), `0086` (CSR-only inbox)
