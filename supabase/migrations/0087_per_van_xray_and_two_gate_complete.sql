-- ============================================================
-- 0087 — per-container-van X-ray + only-Checker confirm + two-gate auto-complete
--        (owner, 2026-06-16)
--
-- Under one C-number (entry) a Job Order can hold several container vans. The
-- Checker now confirms X-ray PER VAN (not per order), so partial progress is
-- visible. Operations only MONITORS X-ray (no confirm_xray) and communicates
-- with the Checker.
--
-- When a JO's last X-ray van is confirmed, the X-ray *service line* rolls up as
-- done (record_service_done). Completion is TWO-GATED: an order reaches
-- 'completed' only when every service line is done AND payment is confirmed —
-- whichever of the two happens last triggers it (the X-ray roll-up via
-- jo_ready_to_complete; the payment side via a BEFORE-update trigger).
-- ============================================================

-- 1) Only the Checker confirms X-ray; Operations monitors.
update public.role_permissions set allowed = false
  where role = 'operations' and permission = 'confirm_xray';

-- 2) Per-van X-ray stamp on each container line.
alter table public.job_order_lines add column if not exists xray_done_at timestamptz;
alter table public.job_order_lines add column if not exists xray_done_by uuid;

-- 3) Confirm ONE van's X-ray. When the JO's last X-ray van is done, roll the
--    X-ray service line up to done (record_service_done applies the two-gate
--    completion rule). Gated to confirm_xray (Checker / Admin / Owner).
create or replace function public.record_van_xray(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jo        uuid;
  v_svc       text;
  v_status    text;
  v_remaining int;
begin
  if not public.has_permission('confirm_xray') then
    raise exception 'You don''t have permission to confirm X-ray.';
  end if;
  select l.job_order_id, l.service_request into v_jo, v_svc
    from public.job_order_lines l where l.id = p_line_id;
  if v_jo is null then raise exception 'Container line not found.'; end if;
  if public.service_line_of(v_svc) <> 'xray' then
    raise exception 'This container does not need X-ray.';
  end if;
  select status into v_status from public.job_orders where id = v_jo for update;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — only open orders can be confirmed.', v_status;
  end if;

  update public.job_order_lines
    set xray_done_at = coalesce(xray_done_at, now()),
        xray_done_by = coalesce(xray_done_by, auth.uid())
    where id = p_line_id;

  select count(*) into v_remaining
    from public.job_order_lines l
    where l.job_order_id = v_jo
      and public.service_line_of(l.service_request) = 'xray'
      and l.xray_done_at is null;

  if v_remaining = 0 then
    perform public.record_service_done(v_jo, 'xray', now());
  elsif v_status = 'submitted' then
    update public.job_orders set status = 'processing' where id = v_jo;
  end if;
end;
$$;
revoke all on function public.record_van_xray(uuid) from public, anon;
grant execute on function public.record_van_xray(uuid) to authenticated;

-- 4) Service-done completion now obeys the two-gate rule (services + payment).
--    Recreated from 0040 with jo_ready_to_complete in place of jo_all_services_done.
create or replace function public.record_service_done(p_id uuid, p_line text, p_performed_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_line = 'xray' then
    if not (public.has_permission('confirm_xray') or public.has_permission('process_job_orders')) then
      raise exception 'You don''t have permission to confirm X-ray completion.';
    end if;
  else
    if not public.has_permission('process_job_orders') then
      raise exception 'You don''t have permission to mark services done.';
    end if;
  end if;
  if p_line not in ('xray','dea','oog','other') then
    raise exception 'Unknown service line %', p_line;
  end if;
  select status into v_status from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — only open orders can be confirmed.', v_status;
  end if;

  insert into public.service_completions (job_order_id, service_line, completed_at, completed_by)
  values (p_id, p_line, coalesce(p_performed_at, now()), auth.uid())
  on conflict (job_order_id, service_line) do nothing;
  perform public.log_jo_event(p_id, 'service_done', jsonb_build_object('line', p_line));

  if p_line = 'xray' then
    update public.job_orders set xray_performed_at = coalesce(xray_performed_at, p_performed_at, now())
      where id = p_id;
  end if;

  if public.jo_ready_to_complete(p_id) then
    update public.job_orders set status = 'completed' where id = p_id;
  elsif v_status = 'submitted' then
    update public.job_orders set status = 'processing' where id = p_id;
  end if;
end;
$$;

-- 5) The other half of the gate: payment confirmed + all services done →
--    auto-complete, in the same update (BEFORE trigger, no recursion).
create or replace function public.complete_on_payment_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed'
     and new.status in ('submitted','processing','on_hold')
     and public.jo_all_services_done(new.id) then
    new.status := 'completed';
  end if;
  return new;
end;
$$;
drop trigger if exists job_orders_complete_on_payment on public.job_orders;
create trigger job_orders_complete_on_payment before update of payment_status on public.job_orders
  for each row execute function public.complete_on_payment_confirmed();

-- 6) Backfill: orders already X-rayed (whole-JO) → mark their X-ray vans done.
update public.job_order_lines l
  set xray_done_at = jo.xray_performed_at
  from public.job_orders jo
  where l.job_order_id = jo.id
    and jo.xray_performed_at is not null
    and public.service_line_of(l.service_request) = 'xray'
    and l.xray_done_at is null;
