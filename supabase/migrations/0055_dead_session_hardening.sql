-- ============================================================
-- 0055 — dead-session hardening + eviction audit trail
-- (request 2026-06-13: "close out the small caveats, make it airtight").
--
-- Closes 0054's residual caveat: an evicted session's JWT stayed usable
-- against raw REST until expiry (≤1h). Eviction DELETES the session row
-- from auth.sessions — so session_alive() simply requires the JWT's
-- session to still exist. Woven into the five core RLS helpers
-- (current_broker_id / broker_is_approved / broker_is_pending / is_admin
-- / has_permission), which gate every job-order, consignee, admin and
-- staff policy: a dead JWT now gets nothing from any of them, instantly.
-- Bonus: sessions kicked by 0047's auto-suspend are cut off the same way.
--
-- Server/SQL contexts (service role, pg_cron, triggers) carry no
-- session_id claim → session_alive() = true, nothing breaks.
--
-- Known remainder (accepted): policies comparing raw auth.uid() — the
-- customer's OWN profile row and OWN storage folders — still honor a dead
-- JWT until expiry. Same-account data only; nothing cross-account.
--
-- Also: claim_session() now logs a 'session_evicted' security event when
-- it actually kicked another session (Logs → Security, owner-visible).
-- The watchdog only emails on 'protected_field_attempt', so routine
-- device switches never page the owner.
-- ============================================================

create or replace function public.session_alive()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when nullif(auth.jwt()->>'session_id', '') is null then true  -- trusted server / SQL context
    else exists (select 1 from auth.sessions s
                 where s.id = (auth.jwt()->>'session_id')::uuid)
  end;
$$;
revoke all on function public.session_alive() from public, anon, authenticated;

-- ---- weave into the core RLS helpers (latest bodies: 0021 + 0049) ----

create or replace function public.current_broker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.customers
  where user_id = auth.uid() and public.session_alive()
$$;

create or replace function public.broker_is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and coalesce(
    (select status = 'approved' or is_admin or is_owner from public.customers where user_id = auth.uid()),
    false)
$$;

create or replace function public.broker_is_pending()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and coalesce(
    (select status = 'pending' from public.customers where user_id = auth.uid()),
    false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive()
         and coalesce((select is_admin or is_owner from public.customers where user_id = auth.uid()), false)
         and public.aal_satisfied();
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and public.aal_satisfied() and coalesce((
    select case
      when c.is_owner then true
      when c.staff_role is null then false
      else coalesce((select rp.allowed from public.role_permissions rp
                     where rp.role = c.staff_role and rp.permission = p), false)
    end
    from public.customers c where c.user_id = auth.uid()
  ), false);
$$;

-- The client poll now also reflects ANY revocation (eviction, auto-suspend
-- kick, owner rescue), not just a lost claim race.
create or replace function public.is_current_session()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and coalesce(
    (select a.session_id = nullif(auth.jwt()->>'session_id', '')::uuid
       from public.active_sessions a
      where a.user_id = auth.uid()),
    true)
$$;

-- ---- eviction audit trail ----

create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_evicted int := 0;
begin
  if v_uid is null or v_sid is null then return; end if;

  -- MFA-enrolled accounts claim only once fully authenticated (aal2).
  if exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified')
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    return;
  end if;

  insert into public.active_sessions (user_id, session_id, claimed_at)
  values (v_uid, v_sid, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id, claimed_at = now();

  -- Evict every other session for this account (mechanism shared with 0047).
  begin
    delete from auth.refresh_tokens where user_id = v_uid::text and session_id <> v_sid;
    delete from auth.sessions where user_id = v_uid and id <> v_sid;
    get diagnostics v_evicted = row_count;
  exception when others then
    raise notice 'claim_session: eviction failed: %', sqlerrm;
  end;

  if v_evicted > 0 then
    perform public.log_security_event(
      'session_evicted',
      (select id from public.customers where user_id = v_uid),
      jsonb_build_object('evicted_sessions', v_evicted));
  end if;
end;
$$;
