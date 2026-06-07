---
title: Administration Core
tags: [core, administration, wave-1]
type: core
wave: 1
status: complete
owner: Owner
last_updated: 2026-06-07
---

# 🛡️ Administration Core

> **Maturity:** COMPLETE (core controls) — dashboard/job-order processing maturing

## Purpose

The internal staff portal: broker approvals, consignee management, job-order processing, and owner-only staff/access settings. Plus deployment/ops.

## Runtime routes (key)

- `/admin` — dashboard
- `/admin/approvals` — broker approval queue
- `/admin/brokers` — broker management
- `/admin/consignees` — consignee management (see [[Consignees]])
- `/admin/job-orders` — job-order processing (see [[Job Orders]])
- `/admin/settings` — owner-only staff & access
- Admin shell: `src/admin/AdminShell.tsx` (Owner/Admin badge)

## Staff & access (Settings — owner-only)

- **Create staff account** — full name + username + password → `rpc('create_staff', {p_username, p_password, p_full_name})`. No email needed; staff sign in with the username. See [[Owner Failsafe]].
- **Grant admin to an existing email** — promote a signed-up account.
- **Current staff list** — revoke admin (owner row not revocable).

## Backend surface (key)

- `rpc('create_staff')` — SECURITY DEFINER, owner-gated, atomic auth-user creation + broker promotion (token columns `''`, not NULL)
- `brokers` updates for approval / admin-grant / revoke
- RLS: admins read all brokers/consignees/job orders

## Deployment / ops

- Vercel project `ktc-joborderform` → `portal.ktcterminal.com` (DNS on Vercel). Vercel CLI installed + linked. See `docs/agent/runtime-data-safety.md` and [[Current State]].

## Done

- Approval queue, broker + consignee management, owner-only staff creation, deployment live.

## Partial / open

- Admin dashboard metrics + job-order processing workflow maturing.
- Resend SMTP (email confirmations / password resets) deferred to go-live.

## Related

- [[Authentication]] · [[Brokers]] · [[Consignees]] · [[Job Orders]] · [[Owner Failsafe]]
- ADR-0001, ADR-0004, ADR-0006
