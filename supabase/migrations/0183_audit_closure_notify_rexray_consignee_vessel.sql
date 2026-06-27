-- 0183: audit closure (sub-batch B) — staff-notify on ops requests, supplement-reopen fix,
-- re-X-ray edit guard + suffix race, pending-consignee lockdown, vessel free-text join,
-- priority-grant guard, resubmit error handling. (Parked fuel-module gaps #316/#547/#558/
-- #569 are scoped to the Phase-1 fuel desk — latent, no live UI.)

-- (#437) ops REQUESTS now ping the staff who must act next (cashier bills / admin approves).
create or replace function public.request_supplement(p_jo uuid, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_n int; v_id uuid; v_status text;
begin
  if not public.has_permission('request_supplement') then
    raise exception 'You don''t have permission to request a charge.';
  end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'Describe the charge / service.'; end if;
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected','held') then raise exception 'Can''t add a charge to a % order.', v_status; end if;
  select count(*) into v_n from public.jo_supplements where job_order_id = p_jo;
  if v_n >= 26 then raise exception 'Too many supplements on this order.'; end if;
  insert into public.jo_supplements (job_order_id, suffix, label, amount, bill_status, created_by)
    values (p_jo, chr(65 + v_n), trim(p_label), null, 'requested', auth.uid())
    returning id into v_id;
  perform public.log_jo_event(p_jo, 'supplement_requested', jsonb_build_object('label', trim(p_label)));
  perform public.notify_staff('bill_supplement', 'supplement',
    'Charge requested on ' || coalesce((select coalesce(jo_number, entry_number) from public.job_orders where id = p_jo), 'an order') || ' — set the amount to bill it.', p_jo, null);
  return v_id;
end;
$$;

-- (#426) billing/adding a charge on a COMPLETED order no longer flips it back to processing
-- (which fired a wrong "approved / now processing" notice + a spurious serving number).
-- has_open_supplement (0182) + jo_ready_to_complete (0181) already gate the release.
create or replace function public.bill_supplement(p_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_jo uuid; v_label text;
begin
  if not public.has_permission('bill_supplement') then
    raise exception 'You don''t have permission to bill a charge.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a charge amount greater than zero.'; end if;
  select s.job_order_id, s.label into v_jo, v_label from public.jo_supplements s
    where s.id = p_id and s.bill_status = 'requested' for update;
  if not found then raise exception 'Charge request not found (or already billed).'; end if;
  update public.jo_supplements set amount = p_amount, bill_status = 'billed' where id = p_id;
  perform public.log_jo_event(v_jo, 'supplement_billed', jsonb_build_object('label', v_label, 'amount', p_amount));
  insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, v_jo, 'rps',
           'An additional charge (' || v_label || ') was added to ' || coalesce(jo_number, 'your job order') ||
           ' — please settle it to proceed.'
    from public.job_orders where id = v_jo;
end;
$$;

create or replace function public.add_supplement(p_jo uuid, p_label text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_n int; v_suffix text; v_id uuid; v_status text;
begin
  if not public.has_permission('bill_supplement') then
    raise exception 'You don''t have permission to add a charge.';
  end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'Enter a charge label.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a charge amount greater than zero.'; end if;
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected','held') then raise exception 'Can''t add a charge to a % order.', v_status; end if;
  select count(*) into v_n from public.jo_supplements where job_order_id = p_jo;
  if v_n >= 26 then raise exception 'Too many supplements on this order.'; end if;
  v_suffix := chr(65 + v_n);
  insert into public.jo_supplements (job_order_id, suffix, label, amount, bill_status, created_by)
    values (p_jo, v_suffix, trim(p_label), p_amount, 'billed', auth.uid())
    returning id into v_id;
  perform public.log_jo_event(p_jo, 'supplement_added',
    jsonb_build_object('suffix', v_suffix, 'label', trim(p_label), 'amount', p_amount));
  insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, p_jo, 'rps',
           'An additional charge (' || trim(p_label) || ') was added to ' || coalesce(jo_number, 'your job order') ||
           ' — please settle it to proceed.'
    from public.job_orders where id = p_jo;
  return v_id;
end;
$$;

-- (#437 + #514) re-X-ray request pings the admin + takes an advisory lock so concurrent
-- requests can't mint the same suffix and collide on the unique jo_number.
create or replace function public.request_rexray(p_parent uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_p record; v_n int; v_child uuid;
begin
  if not public.has_permission('request_rexray') then
    raise exception 'You don''t have permission to request a re-X-ray.';
  end if;
  select * into v_p from public.job_orders where id = p_parent;
  if not found then raise exception 'Order not found.'; end if;
  if v_p.is_rexray then raise exception 'Can''t re-X-ray a re-X-ray.'; end if;
  if v_p.status <> 'completed' then raise exception 'Re-X-ray is only for a completed order.'; end if;
  perform pg_advisory_xact_lock(hashtext('rexray:' || p_parent::text));
  select count(*) into v_n from public.job_orders where parent_job_order_id = p_parent;
  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name,
                                 voyage_number, status, jo_number, is_rexray, parent_job_order_id,
                                 rexray_status, rexray_billable)
  values (v_p.customer_id, v_p.consignee_id, v_p.entry_number, v_p.vessel_visit, v_p.vessel_name,
          v_p.voyage_number, 'submitted', coalesce(v_p.jo_number, '') || chr(65 + v_n), true, p_parent,
          'requested', false)
  returning id into v_child;
  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select v_child, container_number, service_request, size, fill, kind
    from public.job_order_lines where job_order_id = p_parent;
  perform public.notify_staff('approve_rexray', 'rexray',
    'Re-X-ray requested on ' || coalesce(v_p.jo_number, v_p.entry_number, 'an order') || ' — needs admin approval.', v_child, null);
  return v_child;
end;
$$;

-- (#258) a customer can't EDIT an internal KTC re-X-ray child (cancel was guarded in 0181).
create or replace function public.update_job_order(
  p_id uuid, p_consignee_id uuid, p_entry_number text,
  p_vessel_visit text, p_vessel_name text, p_voyage_number text, p_lines jsonb
)
returns void language plpgsql security definer set search_path = 'public' as $function$
declare
  v_row   public.job_orders%rowtype;
  v_count int := 0;
  e       jsonb;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if coalesce(v_row.is_rexray, false) then
    raise exception 'This is an internal KTC re-X-ray and can''t be edited here.';
  end if;
  if v_row.status not in ('held', 'submitted') then
    raise exception 'This order can''t be edited anymore — KTC has accepted it. Reply on an on-hold order, or contact KTC admin.';
  end if;
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
      voyage_number = upper(trim(p_voyage_number)),
      last_customer_edit_at = case when v_row.status = 'submitted' then now() else last_customer_edit_at end
  where id = p_id;
  delete from public.job_order_lines where job_order_id = p_id;
  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select p_id, upper(trim(j->>'container_number')), j->>'service_request',
         nullif(trim(coalesce(j->>'size', '')), ''), nullif(trim(coalesce(j->>'fill', '')), ''), nullif(trim(coalesce(j->>'kind', '')), '')
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;
  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(),
          jsonb_build_object('by', 'customer', 'after_filing', v_row.status = 'submitted'));
end;
$function$;

-- (#481) pending accounts are verify-only (0163) — they can't inject consignee requests.
create or replace function public.request_consignee(
  p_name text, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id(); v_id uuid; v_code text;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not public.broker_is_approved() then
    raise exception 'Your account can''t request consignees until it''s approved.';
  end if;
  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'Enter the consignee name.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_address), '') = '' then
    raise exception 'Enter the business address.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_tin), '') = '' then
    raise exception 'Enter the TIN / VAT Reg #.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_doc_2303), '') = '' then
    raise exception 'Attach the BIR 2303 (Certificate of Registration).' using errcode = 'check_violation';
  end if;
  begin
    insert into public.consignees (name, address, tin, doc_2303_path, doc_2307_path,
                                   customer_name, address2, tel, mobile, email,
                                   status, requested_by, requested_at)
    values (trim(p_name), trim(p_address), trim(p_tin), trim(p_doc_2303),
            nullif(trim(coalesce(p_doc_2307, '')), ''),
            nullif(trim(coalesce(p_customer_name, '')), ''),
            nullif(trim(coalesce(p_address2, '')), ''),
            nullif(trim(coalesce(p_tel, '')), ''),
            nullif(trim(coalesce(p_mobile, '')), ''),
            nullif(trim(coalesce(p_email, '')), ''),
            'pending', v_cust, now())
    returning id, code into v_id, v_code;
  exception when unique_violation then
    raise exception 'A consignee with that name already exists — search for it in the list.'
      using errcode = 'check_violation';
  end;
  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;

-- (#492) resubmit maps a name collision to a friendly message (was the raw constraint error).
create or replace function public.resubmit_consignee(
  p_id uuid,
  p_name text default null, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id(); v_hit boolean;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  begin
    update public.consignees
       set name          = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
           address       = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
           tin           = coalesce(nullif(trim(coalesce(p_tin, '')), ''), tin),
           doc_2303_path = coalesce(nullif(trim(coalesce(p_doc_2303, '')), ''), doc_2303_path),
           doc_2307_path = coalesce(nullif(trim(coalesce(p_doc_2307, '')), ''), doc_2307_path),
           customer_name = coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), customer_name),
           address2      = coalesce(nullif(trim(coalesce(p_address2, '')), ''), address2),
           tel           = coalesce(nullif(trim(coalesce(p_tel, '')), ''), tel),
           mobile        = coalesce(nullif(trim(coalesce(p_mobile, '')), ''), mobile),
           email         = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
           status = 'pending', note = null, requested_at = now()
     where id = p_id and requested_by = v_cust and status = 'needs_info';
    v_hit := found;
  exception when unique_violation then
    raise exception 'A consignee with that name already exists — search for it in the list.'
      using errcode = 'check_violation';
  end;
  if not v_hit then raise exception 'Request not found or not editable.'; end if;
end;
$$;

-- (#525) priority grant requires a 'requested' state + raises on not-found (was a silent no-op).
create or replace function public.review_priority(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('approve_priority') then
    raise exception 'You don''t have permission to approve priority.';
  end if;
  if p_approve then
    update public.job_orders set priority_status = 'granted'
      where id = p_id and priority_status = 'requested';
    if not found then raise exception 'Priority request not found or already decided.'; end if;
    update public.serving_numbers set vacated_at = now()
      where job_order_id = p_id and vacated_at is null;
    perform public.assign_serving_numbers(p_id);
  else
    update public.job_orders set priority_status = null
      where id = p_id and priority_status = 'requested';
    if not found then raise exception 'Priority request not found.'; end if;
  end if;
end;
$$;

-- (#327) vessel free-day join is case/whitespace-insensitive — a shipping-line spelling
-- variant no longer misses, so last_free_day computes and the call expires from the picker.
create or replace view public.vessel_schedule_v with (security_invoker = true) as
select id, vessel_visit, vessel_name, voyage_number, shipping_line,
       actual_arrival, arrival_time, finish_discharging, discharge_time,
       departure, departure_time, berth, week, cancelled, remarks,
       created_at, updated_at, free_days_import, free_days_export, line_internal,
       last_free_day,
       (not cancelled and (last_free_day is null or last_free_day + 1 >= current_date)) as is_current
from (
  select v.id, v.vessel_visit, v.vessel_name, v.voyage_number, v.shipping_line,
         v.actual_arrival, v.arrival_time, v.finish_discharging, v.discharge_time,
         v.departure, v.departure_time, v.berth, v.week, v.cancelled, v.remarks,
         v.created_at, v.updated_at, sl.free_days_import, sl.free_days_export,
         coalesce(sl.internal, false) as line_internal,
         case when v.finish_discharging is not null and sl.free_days_import is not null
              then v.finish_discharging + sl.free_days_import else null::date end as last_free_day
  from public.vessel_schedule v
  left join public.shipping_lines sl on lower(btrim(sl.name)) = lower(btrim(v.shipping_line))
) e;

notify pgrst, 'reload schema';
