-- ============================================================
-- 0093 — multiple owners + ROOT-owner-only owner grants (owner, 2026-06-16)
--
-- Today there is one server-only owner. The owner wants 2–3 owners for
-- redundancy, but only the PRIMARY ("root") owner may mint or revoke owner
-- access — a secondary owner has every other owner power but CANNOT create
-- another owner. Model:
--   * is_root_owner — the one super-owner (seeded = the current owner). NEVER
--     changeable through the app (the guard always reverts it).
--   * is_owner — still server-protected: the ONLY app path that may change it is
--     set_owner_access(), which verifies the caller is root and sets a txn-local
--     flag the guard honours. Everything else reverts as before.
-- ============================================================

alter table public.customers add column if not exists is_root_owner boolean not null default false;

-- Seed: the current owner becomes the root owner.
update public.customers set is_root_owner = true where is_owner = true;

create or replace function public.is_root_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_root_owner from public.customers where user_id = auth.uid()), false);
$$;

-- ---------- guard: honour the root-owner owner-grant, always protect is_root_owner ----------
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_attempt  text[] := '{}';
  v_owner_ok boolean := coalesce(current_setting('ktc.allow_owner_change', true), '') = '1';
begin
  if auth.uid() is null then
    new.is_root_owner := old.is_root_owner;  -- protect even in trusted SQL context
    return new;
  end if;
  v_is_owner := coalesce((select is_owner from public.customers where user_id = auth.uid()), false);

  if not v_is_owner and new.staff_role is distinct from old.staff_role then
    v_attempt := v_attempt || 'staff_role';
    new.staff_role := old.staff_role;
  end if;

  if old.is_owner then
    if not v_is_owner then
      if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'; end if;
      if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'; end if;
      if new.status   is distinct from old.status   then v_attempt := v_attempt || 'status';   end if;
    end if;
    if not v_owner_ok then new.is_owner := old.is_owner; end if;  -- root revoke is allowed
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'; end if;
    if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'; end if;
    new.is_owner := old.is_owner;
    new.is_admin := old.is_admin;
    if not (old.status in ('rejected', 'approved') and new.status = 'pending') then
      if new.status is distinct from old.status then v_attempt := v_attempt || 'status'; end if;
      new.status     := old.status;
      new.decided_at := old.decided_at;
    end if;
  end if;

  -- is_owner is server-protected: only set_owner_access (root-verified) may change it.
  if not v_owner_ok then
    new.is_owner := old.is_owner;
  end if;
  -- is_root_owner is NEVER changeable through the app.
  new.is_root_owner := old.is_root_owner;

  if array_length(v_attempt, 1) is not null then
    perform public.log_security_event('protected_field_attempt', new.id,
      jsonb_build_object('fields', (select to_jsonb(array_agg(distinct f)) from unnest(v_attempt) f)));
  end if;
  return new;
end;
$$;

-- ---------- root-only RPC: grant / revoke owner access on another account ----------
create or replace function public.set_owner_access(p_target uuid, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_root boolean; v_email text;
begin
  if not public.is_root_owner() then
    raise exception 'Only the root owner can grant or revoke owner access.';
  end if;
  select is_root_owner, email into v_target_root, v_email from public.customers where id = p_target;
  if not found then raise exception 'Account not found.'; end if;
  if v_target_root then raise exception 'The root owner can''t be changed.'; end if;

  perform set_config('ktc.allow_owner_change', '1', true);  -- authorise this txn only
  update public.customers
     set is_owner = p_grant,
         is_admin = case when p_grant then true else is_admin end
   where id = p_target;

  perform public.log_security_event(case when p_grant then 'owner_granted' else 'owner_revoked' end,
    p_target, jsonb_build_object('email', v_email, 'by_root', auth.uid()));
end;
$$;
revoke all on function public.set_owner_access(uuid, boolean) from public, anon;
grant execute on function public.set_owner_access(uuid, boolean) to authenticated;
