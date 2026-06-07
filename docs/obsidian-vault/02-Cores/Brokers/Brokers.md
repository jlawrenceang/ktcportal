---
title: Brokers Core
tags: [core, brokers, wave-1]
type: core
wave: 1
status: complete
owner: Admin
last_updated: 2026-06-07
---

# 🧑‍💼 Brokers Core

> **Maturity:** COMPLETE

## Purpose

External broker accounts — registration, identity verification (valid ID), admin approval gate, and the broker landing experience.

## Runtime routes (key)

- `/login` (register tab) — email + password + full name + valid-ID upload
- `/` — broker home (`src/pages/Home.tsx`) once approved; shows "Your Broker ID: BR-#####"
- Broker shell: `src/components/Shell.tsx` (nav: Home / New Job Order / Accreditation / My Job Orders)

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
