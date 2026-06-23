-- 0154: Reject becomes terminal; on-hold becomes field-targeted "needs info". (Item 3c)

-- 1) needs_fields: which JO fields staff asked the customer to re-enter
--    (subset of consignee/entry/vessel/containers). NULL = general hold / none.
alter table public.job_orders add column if not exists needs_fields text[];

-- 2) Reject is now TERMINAL — no customer resubmit. staff_transition_order forces
--    rejected_recoverable=false on every reject (so resubmit_rejected always blocks),
--    and clears needs_fields whenever an order leaves on_hold. Corrections happen
--    only through the field-targeted needs-info flow below.
create or replace function public.staff_transition_order(p_id uuid, p_status text, p_note text default null, p_recoverable boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cur  text;
  v_gate text := case p_status
    when 'processing' then 'accept_orders'
    when 'completed'  then 'complete_orders'
    when 'on_hold'    then 'hold_reject_orders'
    when 'rejected'   then 'hold_reject_orders'
    else null end;
begin
  if v_gate is null then raise exception 'Unsupported transition to %.', p_status; end if;
  if not public.has_permission(v_gate) then raise exception 'You don''t have permission for this action.'; end if;
  select status into v_cur from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if p_status = 'processing' and v_cur not in ('submitted','on_hold') then
    raise exception 'Only a submitted or on-hold order can be accepted.';
  elsif p_status in ('on_hold','rejected') and v_cur not in ('submitted','processing','on_hold') then
    raise exception 'This order can''t be held or rejected now.';
  elsif p_status = 'completed' then
    if v_cur not in ('submitted','processing','on_hold') then
      raise exception 'Only an open order can be completed.';
    end if;
    if not public.jo_ready_to_complete(p_id) then
      raise exception 'Can''t complete yet — every service, the base payment, and any RPS charge must all be cleared.';
    end if;
  end if;
  update public.job_orders
  set status = p_status,
      admin_note = coalesce(p_note, admin_note),
      rejected_recoverable = case when p_status = 'rejected' then false else rejected_recoverable end,
      needs_fields = case when p_status = 'on_hold' then needs_fields else null end
  where id = p_id;
end;
$$;

-- 3) Field-targeted hold: staff flag which fields the customer must re-enter.
--    Empty/unknown field set -> general hold (note only).
create or replace function public.hold_job_order(p_id uuid, p_note text, p_fields text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur text; v_clean text[];
begin
  if not public.has_permission('hold_reject_orders') then
    raise exception 'You don''t have permission for this action.';
  end if;
  if length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer what is needed.';
  end if;
  select status into v_cur from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_cur not in ('submitted','processing','on_hold') then
    raise exception 'This order can''t be held now.';
  end if;
  select array(select x from unnest(coalesce(p_fields, '{}')) x
               where x in ('consignee','entry','vessel','containers')) into v_clean;
  update public.job_orders
     set status = 'on_hold',
         admin_note = trim(p_note),
         needs_fields = case when array_length(v_clean, 1) is null then null else v_clean end
   where id = p_id;
end;
$$;

-- 4) Field-targeted resubmit: the customer may change ONLY the flagged fields;
--    values for unflagged fields are IGNORED server-side (locked).
create or replace function public.resubmit_needs_info(
  p_id uuid, p_note text,
  p_consignee_id uuid default null, p_entry_number text default null,
  p_vessel_visit text default null, p_vessel_name text default null,
  p_voyage_number text default null, p_lines jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype; v_fields text[]; v_count int := 0; e jsonb;
begin
  if length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Please describe what you updated or clarified.' using errcode = 'check_violation';
  end if;
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.status <> 'on_hold' then
    raise exception 'Only orders on hold can be resubmitted this way.';
  end if;
  v_fields := coalesce(v_row.needs_fields, '{}');

  if 'consignee' = any(v_fields) then
    if p_consignee_id is null then raise exception 'Select a consignee.' using errcode = 'check_violation'; end if;
    if not exists (select 1 from public.consignees where id = p_consignee_id) then raise exception 'Consignee not found.'; end if;
    update public.job_orders set consignee_id = p_consignee_id where id = p_id;
  end if;
  if 'entry' = any(v_fields) then
    if length(coalesce(trim(p_entry_number), '')) = 0 then raise exception 'Enter the Entry Number (C-…).' using errcode = 'check_violation'; end if;
    update public.job_orders set entry_number = upper(trim(p_entry_number)) where id = p_id;
  end if;
  if 'vessel' = any(v_fields) then
    if coalesce(nullif(trim(p_vessel_name), ''), '') = '' or coalesce(nullif(trim(p_voyage_number), ''), '') = '' then
      raise exception 'Enter the vessel name and voyage number.' using errcode = 'check_violation';
    end if;
    update public.job_orders set vessel_visit = nullif(trim(p_vessel_visit), ''),
      vessel_name = upper(trim(p_vessel_name)), voyage_number = upper(trim(p_voyage_number)) where id = p_id;
  end if;
  if 'containers' = any(v_fields) then
    for e in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
      if length(coalesce(trim(e->>'container_number'), '')) > 0 then v_count := v_count + 1; end if;
    end loop;
    if v_count = 0 then raise exception 'Add at least one container.' using errcode = 'check_violation'; end if;
    delete from public.job_order_lines where job_order_id = p_id;
    insert into public.job_order_lines (job_order_id, container_number, service_request)
      select p_id, upper(trim(j->>'container_number')), j->>'service_request'
      from jsonb_array_elements(p_lines) j
      where length(coalesce(trim(j->>'container_number'), '')) > 0;
  end if;

  update public.job_orders
     set status = 'submitted', customer_note = trim(p_note),
         needs_fields = null, last_customer_edit_at = now()
   where id = p_id;
end;
$$;
