---
title: Brokers Core
tags: [core, brokers, wave-1]
type: core
wave: 1
status: complete
owner: Admin
last_updated: 2026-06-25
---

# 🧑‍💼 Brokers Core

> ⚠️ **STALE (2026-06-07) — historical reference; current staffing via [[Administration]].** The `brokers` table was renamed to **`customers`** (migration 0021). Staff roles now run on an **owner-tunable permission matrix** (migration 0035: `role_permissions` table + `has_permission()` gates); `is_admin`/`is_owner` columns remain for backward compat and owner/admin detection. The system is now a **single customer pool** with **consignee-based CIS accreditation** (migration 0136 reverted the broker-level gate). Read **broker = customer**. For current staffing, roles, and access control, see [[Administration]] (role matrix), [[Staff Roles & Gates]] (gates detail), and [[Current State]] (live snapshot).

> **Maturity:** COMPLETE

## Purpose

External broker accounts — registration, identity verification (valid ID), admin approval gate, and the broker landing experience.

## Runtime routes (key)

- `/login` (register tab) — email + password + full name + valid-ID upload
- `/` — broker home (`src/pages/Home.tsx`) once approved; shows "Your Broker ID: BR-#####"
- Broker shell: `src/components/Shell.tsx` (nav: Home / New Job Order / My Job Orders — the Accreditation link was removed 2026-06-09, ADR-0007)

## Lifecycle

1. **Register** — `signUp(email, password, { fullName, idFile })`. Valid ID uploads to the `valid-ids` storage bucket; `brokers` row created `pending`.
2. **Pending** — un-approved non-admin brokers see the pending-approval panel in `Shell.tsx`; broker features are gated off.
3. **Approved** — admin approves in the Admin portal (see [[Administration]]); broker gains full access.

See the full chain in [[Broker Onboarding]].

## Backend surface (key)

- `brokers` table — `id, user_id, broker_code, customer_id, company_name, full_name, email, valid_id_path, status, decided_at, is_admin, is_owner`
- `valid-ids` storage bucket (admin-viewable via signed URLs)
- `broker_code` default (migration `0005_broker_code.sql`)
- `useBroker()` — **must** filter `.eq('user_id', uid)` (admin RLS returns all rows)

## Done

- Self-registration with valid-ID upload, pending→approved gate, broker home + ID display.

## Partial / open

- Broker email confirmation deferred behind Resend SMTP.

## Related

- [[Authentication]] · [[Administration]] · [[Job Orders]] · [[Consignees]]
- [[Broker Onboarding]] — workflow
- ADR-0001, ADR-0005
