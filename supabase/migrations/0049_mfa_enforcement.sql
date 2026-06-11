-- ============================================================
-- 0049 — TOTP MFA, enforced server-side (decision 2026-06-12).
--
-- Staff/owner can enroll an authenticator app (UI: /admin/security).
-- Enforcement is NOT frontend-only: once an account has a verified TOTP
-- factor, is_admin() and has_permission() return FALSE unless the session
-- actually passed the MFA challenge (JWT aal = 'aal2'). A stolen password
-- alone yields a session that can't read or do anything staff-gated.
--
-- Accounts with no enrolled factor are unaffected (aal_satisfied = true).
-- Rescue path if an authenticator is lost: delete the row from
-- auth.mfa_factors via the server connection (documented in the runbook).
-- ============================================================

-- Does this session meet the account's MFA bar?
create or replace function public.aal_satisfied()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from auth.mfa_factors f
                 where f.user_id = auth.uid() and f.status = 'verified')
      then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end;
$$;
revoke all on function public.aal_satisfied() from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_owner from public.customers where user_id = auth.uid()), false)
         and public.aal_satisfied();
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.aal_satisfied() and coalesce((
    select case
      when c.is_owner then true
      when c.staff_role is null then false
      else coalesce((select rp.allowed from public.role_permissions rp
                     where rp.role = c.staff_role and rp.permission = p), false)
    end
    from public.customers c where c.user_id = auth.uid()
  ), false);
$$;
