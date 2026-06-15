-- ============================================================
-- 0075 — customer edits their own order BEFORE KTC accepts it (owner, 2026-06-15)
--
-- Decision (2026-06-15): a customer may edit their order's details while it is
-- still `held` (unfiled draft) or `submitted` (filed, waiting in the queue).
-- Once KTC accepts it (`processing`) — and for every later/terminal status —
-- it is locked; on-hold uses the existing respond_to_hold reply path.
--
-- No broad UPDATE policy: a SECURITY DEFINER RPC checks ownership + the exact
-- editable window, then rewrites the editable fields + replaces the container
-- lines. Status is NOT changed, so a submitted order keeps its place in the
-- queue and its serving number ("edit keeps its number", 2026-06-11). The edit
-- is recorded on the timeline as an `edited` event.
-- ============================================================

create or replace function public.update_job_order(
  p_id            uuid,
  p_consignee_id  uuid,
  p_entry_number  text,
  p_vessel_visit  text,   -- listed vessel visit, or null/'' when entered manually
  p_vessel_name   text,
  p_voyage_number text,
  p_lines         jsonb   -- [{ container_number, service_request }, ...]
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row   public.job_orders%rowtype;
  v_count int := 0;
  e       jsonb;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;

  -- Editable only before KTC accepts the order.
  if v_row.status not in ('held','submitted') then
    raise exception 'This order can''t be edited anymore — KTC has accepted it. Reply on an on-hold order, or contact KTC admin.';
  end if;

  -- Validate (mirrors the filing form's required fields).
  if p_consignee_id is null then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.consignees where id = p_consignee_id) then
    raise exception 'Consignee not found.';
  end if;
  if length(coalesce(trim(p_entry_number), '')) = 0 then
    raise exception 'Enter the Entry Number (C-…).' using errcode = 'check_violation';
  end if;
  if coalesce(nullif(trim(p_vessel_name), ''), '') = ''
     or coalesce(nullif(trim(p_voyage_number), ''), '') = '' then
    raise exception 'Enter the vessel name and voyage number.' using errcode = 'check_violation';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;

  update public.job_orders
  set consignee_id  = p_consignee_id,
      entry_number  = upper(trim(p_entry_number)),
      vessel_visit  = nullif(trim(p_vessel_visit), ''),
      vessel_name   = upper(trim(p_vessel_name)),
      voyage_number = upper(trim(p_voyage_number))
  where id = p_id;

  -- Replace the container lines (nothing FKs to job_order_lines; cascade-safe).
  delete from public.job_order_lines where job_order_id = p_id;
  insert into public.job_order_lines (job_order_id, container_number, service_request)
  select p_id, upper(trim(j->>'container_number')), j->>'service_request'
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(), jsonb_build_object('by', 'customer'));
end;
$$;
revoke all on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) to authenticated;
