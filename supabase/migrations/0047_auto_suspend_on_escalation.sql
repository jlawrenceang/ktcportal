-- ============================================================
-- 0047 — auto-suspend + kick on privilege-escalation attempts
-- (request 2026-06-12: "if they try something unauthorized they get
-- kicked out").
--
-- A protected_field_attempt by a CUSTOMER on their own row (is_admin /
-- is_owner / status / staff_role crafted into a direct API call — the real
-- UI never sends those fields, so there are no accidental triggers) now:
--   1. reverts the change (as before),
--   2. sets the account to 'suspended' (terminal lock: RLS blocks filing,
--      the portal shows the locked panel, held orders are cancelled by the
--      existing suspension trigger),
--   3. revokes their auth sessions/refresh tokens (any still-valid JWT can
--      do nothing anyway — every policy re-checks status server-side),
--   4. logs the event with auto_suspended=true → the 15-min watchdog 🚨
--      emails the owner.
--
-- Attempts BY STAFF (e.g. an admin trying to touch the owner row) are
-- logged + alerted but NOT auto-revoked — the owner decides, so a false
-- positive can never lock out the ops floor.
-- ============================================================

create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_attempt text[] := '{}';
  v_kick boolean := false;
begin
  if auth.uid() is null then
    return new;  -- trusted server / SQL context
  end if;
  v_is_owner := coalesce((select is_owner from public.customers where user_id = auth.uid()), false);

  -- roles are owner-assigned (create_staff / Settings); never self-served
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
    new.is_owner   := old.is_owner;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'; end if;
    if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'; end if;
    new.is_owner := old.is_owner;
    new.is_admin := old.is_admin;
    -- permitted self-initiated status changes:
    --   rejected -> pending  (resubmit after rejection)
    --   approved -> pending  (re-verify after a legal-name change)
    -- block every other self-status-change.
    if not (old.status in ('rejected', 'approved') and new.status = 'pending') then
      if new.status is distinct from old.status then v_attempt := v_attempt || 'status'; end if;
      new.status     := old.status;
      new.decided_at := old.decided_at;
    end if;
  end if;

  new.is_owner := old.is_owner;  -- owner grant/revoke is server-only

  if array_length(v_attempt, 1) is not null then
    -- Auto-suspend ONLY a plain customer attacking their own row. Staff
    -- attempts are alerted but left for the owner to judge.
    v_kick := auth.uid() = new.user_id
              and old.staff_role is null and not old.is_admin and not old.is_owner;
    if v_kick then
      new.status          := 'suspended';
      new.decided_at      := now();
      new.decision_reason := 'Automatic suspension — unauthorized account-modification attempt. Contact KTC admin.';
      begin
        delete from auth.refresh_tokens where user_id = auth.uid()::text;
        delete from auth.sessions where user_id = auth.uid();
      exception when others then
        raise notice 'guard: session revocation failed: %', sqlerrm;
      end;
    end if;
    perform public.log_security_event('protected_field_attempt', new.id,
      jsonb_build_object(
        'fields', (select to_jsonb(array_agg(distinct f)) from unnest(v_attempt) f),
        'auto_suspended', v_kick));
  end if;
  return new;
end;
$$;
