---
title: Owner Failsafe
tags: [concept, security, auth]
type: concept
---

# 🗝️ Owner Failsafe

A guarantee that the business owner can never be locked out of KTC.

## What it is

- The owner account `jlawrenceang@gmail.com` carries a **server-only** `is_owner = true` flag on its `customers` row.
- The owner **overrides every gate**, sees everything (admin RLS), and is treated as admin via `hasAdminAccess()`.
- The owner **cannot be revoked**: the Settings staff list hides "Revoke admin" on the owner row, and `guard_broker_protected_fields` reverts any app-side change to `is_owner`/`is_admin` (only the root-verified `set_owner_access()` may change it — ADR-0035/migration `0093`).
- **Email-keyed backstop (migration `0184`):** `is_owner()` and `is_admin()` also return true when `auth.email()` is the owner email — so even a **missing or flag-wrong** `customers` row (e.g. the auth user was deleted, cascading the row away, or a bad migration zeroed the flags) cannot strip the owner's backend access. MFA is still required (the backstop defeats data corruption, not the owner's own 2FA).

## Why

If an admin misconfigures access — or the owner's profile row is corrupted — the owner must still get in and fix it. `is_owner` is not user-editable from the app; it is a server/database fact, now backed by the email failsafe.

## Recovery / break-glass

If the owner ever can't reach the back office:

1. **Sign in normally** (`jlawrenceang@gmail.com` + password + 2FA). With `0184`, this grants owner access even if the profile row is wrong. Forgot the password? Use the standard reset-by-email.
2. **Restore the profile row** if the UI still shows the customer/pending view: run `supabase/seed-owner.sql` from the Supabase SQL Editor or over `DATABASE_URL` — it re-sets `is_owner/is_admin/status='approved'` on the owner row. Requires DB credentials only the owner holds (no public recovery endpoint — by design; a secret-question backdoor was rejected as a second master key that would bypass 2FA).
3. **If the profile row was deleted entirely** (rare — only an auth-user delete does this): sign up once with the owner email to recreate the row, then run `seed-owner.sql` to promote it.

> No secondary admin/owner fallback currently exists (`jla.ktcport@gmail.com` is now a rejected customer, not an admin). A second owner for redundancy was offered and deferred — see ADR-0004.

## How staff creation stays owner-safe

- Staff are created only by the owner via `rpc('create_staff')` (see [[Authentication]]).
- That RPC **bypasses the auth API** (direct SQL into `auth.users`/`auth.identities`), so even with CAPTCHA enforced on login, the owner can always create staff. See [[CAPTCHA Bot Protection]].

## Related

- [[Authentication]] · [[Administration]] · [[Operational Invariants]]
- ADR-0004
