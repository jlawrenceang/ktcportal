-- ============================================================
-- 0222 — Close two money-integrity edges flagged by Jarvis (cutover verify)
--
-- F1 (MEDIUM): a REVERSED (credit-note) charge could be re-confirmed via a Payment
--   Order — create_payment_order didn't exclude payment_status='reversed' from
--   bundling, and confirm_payment_order confirmed every charge "<> 'confirmed'"
--   (which includes 'reversed'), silently undoing a credit note. Exclude 'reversed'
--   in BOTH the bundle check and the confirm loop (reversed is terminal).
--
-- F2 (MEDIUM): editing a JO after its base charge left "pristine" under-billed the
--   added containers — update_job_order only guarded on JO status, so a customer could
--   submit a payment proof (charge -> 'submitted') then add a container; the money-safe
--   re-seed (correctly) skips, leaving the new line X-rayed-but-unbilled. Block the edit
--   once any charge is past pristine (mirrors the 0219 cancel guard) — contact admin.
-- ============================================================

-- F1a — create_payment_order: never bundle a confirmed OR reversed charge.
create or replace function public.create_payment_order(p_consignee uuid, p_charge_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_cust uuid; n int;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to create a payment order.'; end if;
  if p_charge_ids is null or array_length(p_charge_ids,1) is null then raise exception 'Select at least one charge.'; end if;
  select count(distinct s.cust), min(s.cust) into n, v_cust
    from (
      select coalesce(j.customer_id, r.customer_id) as cust
        from public.charges c
        left join public.job_orders j     on j.id = c.job_order_id
        left join public.release_orders r on r.id = c.release_order_id
       where c.id = any(p_charge_ids)
    ) s;
  if n <> 1 then raise exception 'All charges in a payment order must belong to the same customer.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c where c.id = any(p_charge_ids)
             and (c.bill_status <> 'billed' or c.payment_status in ('confirmed','reversed') or c.payment_order_id is not null)) then
    raise exception 'One or more charges can''t be bundled (already paid/reversed, unbilled, or in another payment order).' using errcode='check_violation';
  end if;
  insert into public.payment_orders (po_number, customer_id, consignee_id, created_by)
  values ('PO-' || lpad(nextval('payment_order_seq')::text, 6, '0'), v_cust, p_consignee, auth.uid())
  returning id into v_po;
  update public.charges set payment_order_id = v_po where id = any(p_charge_ids);
  return v_po;
end;
$$;
revoke all on function public.create_payment_order(uuid, uuid[]) from public, anon;
grant execute on function public.create_payment_order(uuid, uuid[]) to authenticated;

-- F1b — confirm_payment_order: confirm only the still-payable charges (never a reversed one).
create or replace function public.confirm_payment_order(p_po uuid, p_or_no text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to confirm collection.'; end if;
  if length(coalesce(trim(p_or_no),'')) = 0 then raise exception 'Enter the collection OR number.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c
               left join public.job_orders j     on j.id = c.job_order_id
               left join public.release_orders r on r.id = c.release_order_id
              where c.payment_order_id = p_po and coalesce(j.status, r.status) in ('cancelled','rejected')) then
    raise exception 'A bundled charge belongs to a cancelled or rejected order.' using errcode='check_violation';
  end if;
  if exists (select 1 from public.charges where payment_order_id = p_po
             and (invoice_state <> 'final' or coalesce(trim(erp_invoice_no),'')='' or coalesce(trim(bir_invoice_no),'')='')) then
    raise exception 'Every charge needs its FINAL ERP + BIR invoice before collection.' using errcode='check_violation';
  end if;
  update public.payment_orders set collection_or_no = upper(trim(p_or_no)), status = 'collected',
         payment_status = 'confirmed', payment_confirmed_at = now()
   where id = p_po and status in ('open','submitted');
  if not found then raise exception 'This payment order can''t be collected.'; end if;
  for c in select id from public.charges where payment_order_id = p_po and payment_status not in ('confirmed','reversed') loop
    update public.charges set payment_status = 'confirmed', payment_confirmed_at = now() where id = c.id;
    perform public.log_charge_audit(c.id, 'payment_confirmed', jsonb_build_object('payment_order', p_po, 'or_no', upper(trim(p_or_no))));
  end loop;
end;
$$;
revoke all on function public.confirm_payment_order(uuid, text) from public, anon;
grant execute on function public.confirm_payment_order(uuid, text) to authenticated;

-- F2 — update_job_order: block an edit once any charge has moved past pristine
-- (recreated from 0212 verbatim + the charge-in-flight guard).
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
  -- 0222 (Jarvis F2): once billing has moved, editing would under-bill the new lines.
  if exists (select 1 from public.charges c
             where c.job_order_id = p_id
               and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)) then
    raise exception 'This order already has billing in progress — please contact KTC admin to change it.'
      using errcode = 'check_violation';
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
  if length(trim(p_entry_number)) > 40 then
    raise exception 'Entry Number is too long (max 40 characters).' using errcode = 'check_violation';
  end if;
  if coalesce(nullif(trim(p_vessel_name), ''), '') = ''
     or coalesce(nullif(trim(p_voyage_number), ''), '') = '' then
    raise exception 'Enter the vessel name and voyage number.' using errcode = 'check_violation';
  end if;
  if length(trim(p_vessel_name)) > 80 then
    raise exception 'Vessel name is too long (max 80 characters).' using errcode = 'check_violation';
  end if;
  if length(trim(p_voyage_number)) > 80 then
    raise exception 'Voyage number is too long (max 80 characters).' using errcode = 'check_violation';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then
      v_count := v_count + 1;
      if upper(trim(e->>'container_number')) !~ '^[A-Z0-9-]{4,20}$' then
        raise exception 'Container number "%" looks invalid — use 4–20 letters or digits.', trim(e->>'container_number')
          using errcode = 'check_violation';
      end if;
      if not exists (select 1 from public.service_rates r where r.service = e->>'service_request' and r.active) then
        raise exception 'Unknown service "%". Please pick a service from the list.', coalesce(e->>'service_request', '')
          using errcode = 'check_violation';
      end if;
      if coalesce(nullif(trim(e->>'size'), ''), '20') not in ('20','40') then
        raise exception 'Pick a valid container size (20 or 40).' using errcode = 'check_violation';
      end if;
      if coalesce(nullif(trim(e->>'fill'), ''), 'full') not in ('empty','full') then
        raise exception 'Pick a valid load (empty or full).' using errcode = 'check_violation';
      end if;
      if coalesce(nullif(trim(e->>'kind'), ''), 'dry') not in ('dry','reefer') then
        raise exception 'Pick a valid container type (dry or reefer).' using errcode = 'check_violation';
      end if;
    end if;
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

  perform public.seed_job_order_billing(p_id);

  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(),
          jsonb_build_object('by', 'customer', 'after_filing', v_row.status = 'submitted'));
end;
$function$;
revoke all on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
