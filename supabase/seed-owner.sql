-- ============================================================
-- Seed the OWNER (failsafe super-admin).
-- The owner overrides & sees everything and cannot be locked out or demoted
-- from the app — only this SQL (server context) can grant/revoke owner.
--
-- Prerequisite: the owner must have SIGNED UP once (so their broker row exists).
-- Run this in the KTC Supabase project SQL Editor.
-- ============================================================

update public.brokers
set is_owner   = true,
    is_admin   = true,
    status     = 'approved',
    decided_at = now()
where email = 'jla.ktcport@gmail.com';

-- Verify:
-- select email, is_owner, is_admin, status from public.brokers order by is_owner desc, is_admin desc;
