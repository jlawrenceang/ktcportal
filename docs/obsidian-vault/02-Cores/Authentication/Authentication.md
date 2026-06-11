---
title: Authentication Core
tags: [core, authentication, wave-1]
type: core
wave: 1
status: complete
owner: Owner
last_updated: 2026-06-07
---

# 🔑 Authentication Core

> **Maturity:** COMPLETE

## Purpose

Identity, sign-in/registration, the role model (owner / admin / broker), invite-only staff creation, and the RLS posture that backs access control.

## Runtime routes (key)

- `/login` — sign in / register (broker self-registration; staff sign in with username)
- `RoleLanding` (at `/`) — admins → `/admin`, brokers → broker home

## Role model

- `brokers` row carries `is_owner` + `is_admin` + `status`. `hasAdminAccess(b) = is_admin || is_owner` (`src/lib/types.ts`).
- **Owner:** `jlawrenceang@gmail.com`, server-only `is_owner`. Overrides everything, cannot be locked out/revoked. See [[Owner Failsafe]].
- **Staff/admin:** created only by the owner (see [[Administration]]).
- **Brokers:** self-register, start `pending` (see [[Brokers]]).

## Sign-in mechanics

- `src/lib/AuthContext.tsx` — `useAuth()` exposes `signIn`, `signUp`, `signOut`.
- Brokers sign in with email. Staff sign in with a **username** (no `@`), mapped to a synthetic `<username>@ktc-staff.local`.
- CAPTCHA token threaded through `signIn`/`signUp`; server-verified by Supabase Auth. See [[CAPTCHA Bot Protection]].

## Backend surface (key)

- `auth.users` / `auth.identities` (Supabase Auth)
- `brokers` table (role flags + status)
- `rpc('create_staff')` — SECURITY DEFINER, owner-gated, atomic auth-user + promote
- RLS policies on `brokers` (admins read all; brokers read own). See [[RLS Posture]].

## Done

- Email/password broker auth, username staff auth, owner failsafe, invite-only staff, server-side CAPTCHA.

## Partial / open

- Email confirmation + password reset deferred until Resend SMTP is configured (see [[Pending Items]]).

## Related

- [[Administration]] · [[Brokers]] · [[Owner Failsafe]] · [[CAPTCHA Bot Protection]] · [[RLS Posture]]
- ADR-0002, ADR-0004, ADR-0006
