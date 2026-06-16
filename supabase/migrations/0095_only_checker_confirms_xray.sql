-- ============================================================
-- 0095 — only the Checker (+ owner) confirms X-ray; admin cannot (owner, 2026-06-16)
--
-- Operations already lost confirm_xray (0087, monitors only). Now admin loses it
-- too: confirming X-ray entry is the Checker's job (the owner bypasses every gate
-- as the failsafe). record_van_xray already gates on confirm_xray; this also
-- drops the process_job_orders fallback in record_service_done's X-ray branch so
-- no non-checker can mark X-ray done by another path.
-- ============================================================

update public.role_permissions set allowed = false
  where role = 'admin' and permission = 'confirm_xray';

create or replace function public.record_service_done(p_id uuid, p_line text, p_performed_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_line = 'xray' then
    if not public.has_permission('confirm_xray') then
      raise exception 'Only the X-ray checker can confirm X-ray.';
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
