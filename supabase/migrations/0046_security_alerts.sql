-- ============================================================
-- 0046 — owner alerting, upgraded: ANY error and BREACH ATTEMPTS email the
-- owner (request 2026-06-12).
--
--   * security_events — owner-readable log of suspicious/sensitive actions:
--       - protected_field_attempt: someone tried to change is_owner /
--         is_admin / status / staff_role and the guard reverted it
--         (previously a SILENT revert — now it's evidence)
--       - role_gate_changed: any edit to the role_permissions matrix (audit)
--   * guard_broker_protected_fields now records what it reverts.
--   * Watchdog runs every 15 MINUTES (was hourly) and alerts on:
--       - any failed cron run            (dedupe key ops-cron, 6h)
--       - any failed outbound call       (dedupe key ops-outbound, 6h)
--       - ANY client error (was ≥10/h)   (dedupe key client-errors, 6h)
--       - ANY security event             (dedupe key security, 1h)
--     One combined email per run, per-category dedupe so a noisy category
--     can't mute a new one.
--   * system_health() includes security events (owner sees them; admins get
--     an empty list).
-- ============================================================

-- ---------- 1) security events ----------
create table if not exists public.security_events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  actor      uuid,            -- auth.uid() of whoever did it
  target     uuid,            -- affected customers.id, when applicable
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at);
alter table public.security_events enable row level security;

drop policy if exists "owner reads security events" on public.security_events;
create policy "owner reads security events" on public.security_events
  for select to authenticated
  using (coalesce((select is_owner from public.customers where user_id = auth.uid()), false));
-- writes via definer functions only

create or replace function public.log_security_event(p_kind text, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.security_events (kind, actor, target, detail)
  values (p_kind, auth.uid(), p_target, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.log_security_event(text, uuid, jsonb) from public, anon, authenticated;

-- ---------- 2) guard trigger: same protections, now with evidence ----------
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean;
  v_attempt text[] := '{}';
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
    perform public.log_security_event('protected_field_attempt', new.id,
      jsonb_build_object('fields', (select to_jsonb(array_agg(distinct f)) from unnest(v_attempt) f)));
  end if;
  return new;
end;
$$;

-- Role-gate edits are owner-only by policy, but log them anyway (audit trail).
create or replace function public.audit_role_gate_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_security_event('role_gate_changed', null,
    jsonb_build_object('role', coalesce(new.role, old.role),
                       'permission', coalesce(new.permission, old.permission),
                       'allowed', new.allowed, 'op', tg_op));
  return coalesce(new, old);
end;
$$;
drop trigger if exists role_permissions_audit on public.role_permissions;
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_role_gate_change();

-- ---------- 3) health snapshot includes security events ----------
create or replace function public.system_health()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_is_owner boolean;
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  v_is_owner := coalesce((select is_owner from public.customers where user_id = auth.uid()), false);
  perform public.reconcile_outbound();
  return jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule,
        'last_run', d.start_time, 'status', d.status, 'message', left(d.return_message, 300)
      ) order by j.jobname)
      from cron.job j
      left join lateral (
        select * from cron.job_run_details where jobid = j.jobid
        order by start_time desc limit 1
      ) d on true
    ), '[]'::jsonb),
    'outbound_failures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', f.kind, 'label', f.label, 'status', f.status_code, 'error', f.error_msg, 'at', f.created_at
      ) order by f.created_at desc)
      from (select * from public.outbound_requests
            where created_at > now() - interval '7 days'
              and (status_code >= 400 or error_msg is not null)
            order by created_at desc limit 20) f
    ), '[]'::jsonb),
    'outbound_24h', (select count(*) from public.outbound_requests where created_at > now() - interval '24 hours'),
    'client_errors_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
    'client_errors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'message', e.message, 'path', e.path, 'at', e.created_at, 'user_id', e.user_id
      ) order by e.created_at desc)
      from (select * from public.app_errors order by created_at desc limit 20) e
    ), '[]'::jsonb),
    'security_events', case when v_is_owner then coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'actor', s.actor, 'detail', s.detail, 'at', s.created_at
      ) order by s.created_at desc)
      from (select * from public.security_events order by created_at desc limit 20) s
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- ---------- 4) watchdog: every 15 min, alert on ANYTHING ----------
create or replace function public.check_ops_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cron_fails int; v_out_fails int; v_errs int; v_sec int;
  v_email text; v_name text; v_body text := '';
  v_send boolean := false;
begin
  perform public.reconcile_outbound();

  select count(*) into v_cron_fails
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where d.start_time > now() - interval '70 minutes'
      and d.status = 'failed'
      and j.jobname <> 'ops-watchdog';
  select count(*) into v_out_fails
    from public.outbound_requests
    where created_at > now() - interval '70 minutes'
      and (status_code >= 400 or error_msg is not null);
  select count(*) into v_errs
    from public.app_errors where created_at > now() - interval '20 minutes';
  select count(*) into v_sec
    from public.security_events
    where created_at > now() - interval '20 minutes'
      and kind = 'protected_field_attempt';

  -- per-category sections, each with its own dedupe window
  if v_sec > 0 and not exists (select 1 from public.ops_alerts
      where key = 'security' and last_sent > now() - interval '1 hour') then
    v_body := v_body || '&bull; <strong>🚨 ' || v_sec || ' blocked privilege-escalation attempt(s)</strong> — someone tried to change a protected field (admin flag / role / status). The change was reverted; the actor is in Settings &rarr; System health.<br/>';
    insert into public.ops_alerts (key, last_sent) values ('security', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_cron_fails > 0 and not exists (select 1 from public.ops_alerts
      where key = 'ops-cron' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_cron_fails || ' failed cron run(s)</strong> (expiry / mirror / archive / carry-over)<br/>';
    insert into public.ops_alerts (key, last_sent) values ('ops-cron', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_out_fails > 0 and not exists (select 1 from public.ops_alerts
      where key = 'ops-outbound' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_out_fails || ' failed outbound call(s)</strong> (emails / BOC mirror)<br/>';
    insert into public.ops_alerts (key, last_sent) values ('ops-outbound', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_errs > 0 and not exists (select 1 from public.ops_alerts
      where key = 'client-errors' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_errs || ' client error(s)</strong> in the last 20 minutes<br/>';
    insert into public.ops_alerts (key, last_sent) values ('client-errors', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;

  if v_send then
    select email, full_name into v_email, v_name
      from public.customers where is_owner limit 1;
    perform public.send_portal_email(
      v_email, v_name,
      case when v_sec > 0 then '🚨 KTC portal security alert' else 'KTC portal watchdog: something needs a look' end,
      case when v_sec > 0 then 'Security alert' else 'System health alert' end,
      'The portal watchdog found:<br/><br/>' || v_body || '<br/>Details are in Settings &rarr; System health.',
      'https://portal.ktcterminal.com/admin/settings', 'Open System health');
  end if;

  -- housekeeping (cheap; idempotent)
  delete from public.app_errors        where created_at < now() - interval '30 days';
  delete from public.outbound_requests where created_at < now() - interval '30 days';
  delete from public.security_events   where created_at < now() - interval '90 days';
  begin
    delete from cron.job_run_details where end_time < now() - interval '14 days';
  exception when others then null;
  end;
end;
$$;
revoke all on function public.check_ops_alerts() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('ops-watchdog-hourly');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('ops-watchdog');
exception when others then null;
end $$;
select cron.schedule('ops-watchdog', '*/15 * * * *', $job$ select public.check_ops_alerts(); $job$);
