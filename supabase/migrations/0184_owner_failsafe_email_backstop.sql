-- ============================================================
-- 0184 — owner failsafe: email-keyed backstop (owner, 2026-06-28)
--
-- The non-negotiable: the owner "overrides everything, cannot be locked out."
-- But is_owner()/is_admin() decide access purely from the is_owner/is_admin
-- COLUMN on the caller's customers row (0118 / 0055). customers.user_id is
-- already UNIQUE NOT NULL (0001), so the duplicate-row vector doesn't exist —
-- the remaining lockout vector is a MISSING or FLAG-WRONG owner row:
--   * the owner's auth.users row is deleted (customers cascades away, 0001), or
--   * a bad migration / manual edit zeroes is_owner/is_admin.
-- In either case today the real owner loses ALL access with no in-app recovery.
--
-- Fix: OR-in a hardcoded owner-email backstop. The email is read from the JWT
-- (auth.email()), which GoTrue sets from auth.users — a stranger cannot set their
-- auth email to an existing confirmed address without controlling that inbox, so
-- it can't be spoofed (and the email is already public in seed-owner.sql).
--
-- MFA is intentionally KEPT (aal_satisfied()): this backstop defeats customers-
-- row corruption, NOT the owner's own 2FA. Worst case (row corrupt AND the email
-- ever changes) the one-command recovery is still scripts/../seed-owner.sql.
-- ============================================================

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and public.aal_satisfied()
     and (
       coalesce((select is_owner from public.customers where user_id = auth.uid()), false)
       or lower(coalesce(auth.email(), '')) = 'jlawrenceang@gmail.com'
     );
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and public.aal_satisfied()
     and (
       coalesce((select is_admin or is_owner from public.customers where user_id = auth.uid()), false)
       or lower(coalesce(auth.email(), '')) = 'jlawrenceang@gmail.com'
     );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
