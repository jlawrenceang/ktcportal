-- ============================================================
-- Seed the OWNER (failsafe super-admin).
-- The owner overrides & sees everything and cannot be locked out or demoted
-- from the app — only this SQL (server context) can grant/revoke owner.
--
-- SECURITY: run this ONLY as the service role / postgres superuser (Supabase
-- Dashboard SQL Editor or the DATABASE_URL connection). It must never be
-- callable from the app: no function wraps it, and the is_owner column is
-- locked by guard_broker_protected_fields against any client-side change.
--
-- Prerequisite: the owner must have SIGNED UP once (so their customers row
-- exists). Table renamed brokers -> customers in migration 0021.
-- ============================================================

update public.customers
set is_owner   = true,
    is_admin   = true,
    status     = 'approved',
    decided_at = now()
where email = 'jlawrenceang@gmail.com';

-- Verify:
-- select email, is_owner, is_admin, status from public.customers order by is_owner desc, is_admin desc;
