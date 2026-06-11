---
title: Owner Failsafe
tags: [concept, security, auth]
type: concept
---

# 🗝️ Owner Failsafe

A guarantee that the business owner can never be locked out of KTC.

## What it is

- The owner account `jlawrenceang@gmail.com` carries a **server-only** `is_owner = true` flag on its `brokers` row.
- The owner **overrides every gate**, sees everything (admin RLS), and is treated as admin via `hasAdminAccess()`.
- The owner **cannot be revoked**: the Settings staff list hides "Revoke admin" on the owner row, and staff cannot demote the owner.

## Why

If an admin misconfigures access, the owner must still get in and fix it. `is_owner` is not user-editable from the app — it is a server/database fact.

## How staff creation stays owner-safe

- Staff are created only by the owner via `rpc('create_staff')` (see [[Authentication]]).
- That RPC **bypasses the auth API** (direct SQL into `auth.users`/`auth.identities`), so even with CAPTCHA enforced on login, the owner can always create staff. See [[CAPTCHA Bot Protection]].

## Related

- [[Authentication]] · [[Administration]] · [[Operational Invariants]]
- ADR-0004
