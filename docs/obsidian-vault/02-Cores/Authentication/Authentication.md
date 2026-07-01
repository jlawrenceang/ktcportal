---
title: Authentication Core
tags: [core, authentication, wave-1]
type: core
wave: 1
status: live
owner: Owner
last_updated: 2026-06-28
---

# 🔑 Authentication Core

> **Maturity:** LIVE — multi-role gate matrix, 2FA, single session, root owner

## Purpose

Identity, sign-in/registration, the role model (root owner / owner / 6 staff roles / customer), invite-only staff creation, and the RLS posture that backs access control.

## Runtime routes (key)

- `/login` — sign in / register (broker self-registration; staff sign in with username)
- `RoleLanding` (at `/`) — admins → `/admin`, brokers → broker home

## Role model

- `customers` row carries `is_root_owner` + `is_owner` + `is_admin` + **`staff_role`** + `status`. `hasAdminAccess(b) = is_admin || is_owner` (`src/lib/types.ts`).
- **Root owner / owner:** server-only; root mints/revokes secondary owners (`set_owner_access`). Override everything, cannot be locked out. See [[Owner Failsafe]], [[Multi-Owner & Root Grants]].
- **Staff roles:** `admin · operations · cashier · checker · csr · purchaser` (`purchaser` is the DB-only fuel desk, `0150` — frontend deferred), created only by the owner. Capabilities run on the owner-tunable [[Staff Roles & Gates]] matrix (`role_permissions` + `has_permission`) — restricted roles are **NOT** `is_admin`.
- **Customers:** self-register, start `pending` (see [[Brokers]]).
- **2FA / sessions:** TOTP 2FA enforced for admin/owner (server aal2); single session per account (last-login-wins, dead-session RLS cut-off); idle timeouts (customer 30 min / staff 60 min).

## Sign-in mechanics

- `src/lib/AuthContext.tsx` — `useAuth()` exposes `signIn`, `signUp`, `signOut`.
- Brokers sign in with email. Staff sign in with a **username** (no `@`), mapped to a synthetic `<username>@ktc-staff.local`.
- CAPTCHA token threaded through `signIn`/`signUp`; server-verified by Supabase Auth. See [[CAPTCHA Bot Protection]].
- **"Continue with Google" (`0161`, v1.6.21)** — Supabase OAuth; the email comes back already verified (email-confirmation step skipped). Google gives a name + email but not the contact number + Agreement consent the form collects, so a new Google customer is routed once through a **`FinishRegistration`** gate (in `ProtectedRoute`) to provide both, recorded server-side via **`complete_oauth_registration(p_contact, p_version)`**. The gate is **scoped to Google-provider users with no recorded consent** — email/password customers are unaffected. Owner must enable the Google provider + finish the Supabase URL config (`docs/go-live-todo.md`).
- **Disposable-email block (`0164`)** — `handle_new_user` rejects signups from the 7,578-domain throwaway blocklist (the DB trigger is the wall; the form hint is advisory). Real providers + Google OAuth emails pass.

## Backend surface (key)

- `auth.users` / `auth.identities` (Supabase Auth)
- `brokers` table (role flags + status)
- `rpc('create_staff')` — SECURITY DEFINER, owner-gated, atomic auth-user + promote
- RLS policies on `brokers` (admins read all; brokers read own). See [[RLS Posture]].

## Done

- Email/password customer auth, **Google OAuth sign-in** (`0161`, with the `FinishRegistration` consent gate), username staff auth, owner failsafe + root-owner grants, invite-only staff (5 roles), owner-tunable gate matrix, server-side CAPTCHA, **disposable-email block** (`0164`), TOTP 2FA, single session, idle timeouts, privilege-grant alerting. Email confirmation + password reset wired (Resend).

## Related

- [[Administration]] · [[Brokers]] · [[Owner Failsafe]] · [[Multi-Owner & Root Grants]] · [[Staff Roles & Gates]] · [[CAPTCHA Bot Protection]] · [[RLS Posture]]
- ADR-0002, ADR-0004, ADR-0006
