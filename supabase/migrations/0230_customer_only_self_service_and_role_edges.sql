-- 0230 - customer-only self-service guards + role-edge hardening
--
-- The older "broker" helper intentionally returns the signed-in customers row
-- even for staff/admin accounts. That is useful for account/profile surfaces,
-- but customer self-service write RPCs must fail closed for back-office roles.
-- Keep current_broker_id unchanged and introduce a stricter helper only for
-- customer-owned business actions.

create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id
  from public.customers
  where user_id = auth.uid()
    and public.session_alive()
    and coalesce(is_admin, false) is false
    and coalesce(is_owner, false) is false
    and staff_role is null
$$;
revoke all on function public.current_customer_id() from public, anon;
grant execute on function public.current_customer_id() to authenticated;

-- Customer submits a charge proof. Parent-aware from 0228, now customer-only.
create or replace function public.submit_charge_payment(p_charge uuid, p_proof text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_cust uuid := public.current_customer_id();
begin
  if v_cust is null then raise exception 'Only customer accounts can submit payment proof.'; end if;
  update public.charges c
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof,''), payment_submitted_at = now(), payment_note = null
   where c.id = p_charge and c.bill_status = 'billed' and c.payment_status in ('unpaid','rejected')
     and c.payment_order_id is null
     and (
       exists (select 1 from public.job_orders j where j.id = c.job_order_id and j.customer_id = v_cust)
       or exists (select 1 from public.release_orders r where r.id = c.release_order_id and r.customer_id = v_cust)
     );
  if not found then raise exception 'This charge is not awaiting your payment.'; end if;
  perform public.log_charge_audit(p_charge, 'payment_submitted', null);
end;
$function$;
revoke all on function public.submit_charge_payment(uuid, text) from public, anon;
grant execute on function public.submit_charge_payment(uuid, text) to authenticated;

-- Customer files a job order. Body is the 0228 live body with only the identity
-- helper and approved-status check tightened.
create or replace function public.file_job_order(
  p_consignee uuid, p_entry_number text, p_vessel_visit text,
  p_vessel_name text, p_voyage_number text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = 'public' as $function$
declare
  v_cust   uuid := public.current_customer_id();
  v_jo     uuid;
  v_count  int := 0;
  e        jsonb;
begin
  if v_cust is null then raise exception 'Only customer accounts can file job orders.'; end if;
  if not exists (select 1 from public.customers where id = v_cust and status = 'approved') then
    raise exception 'Your account can''t file orders right now.';
  end if;
  if not public.has_recorded_consent() then
    raise exception 'Please accept the Customer Agreement before filing a job order.';
  end if;
  if p_consignee is null or not exists (select 1 from public.consignees where id = p_consignee) then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_entry_number), '')) = 0 then
    raise exception 'Enter the Entry Number.' using errcode = 'check_violation';
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
        raise exception 'Container number "%" looks invalid; use 4-20 letters or digits.', trim(e->>'container_number')
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
  if v_count > 200 then
    raise exception 'A job order can have at most 200 containers.' using errcode = 'check_violation';
  end if;

  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name, voyage_number, status)
  values (v_cust, p_consignee, upper(trim(p_entry_number)), nullif(trim(p_vessel_visit), ''),
          upper(trim(p_vessel_name)), upper(trim(p_voyage_number)), 'submitted')
  returning id into v_jo;

  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select v_jo, upper(trim(j->>'container_number')), j->>'service_request',
         nullif(trim(coalesce(j->>'size', '')), ''), nullif(trim(coalesce(j->>'fill', '')), ''), nullif(trim(coalesce(j->>'kind', '')), '')
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  perform public.seed_job_order_billing(v_jo);
  return v_jo;
end;
$function$;
revoke all on function public.file_job_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.file_job_order(uuid, text, text, text, text, jsonb) to authenticated;

-- Customer edits/cancels only their own order, and only as a customer role.
create or replace function public.cancel_job_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_customer_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.is_rexray then raise exception 'This is an internal KTC re-X-ray and can''t be cancelled here.'; end if;
  if v_row.status not in ('held','submitted','on_hold') then
    raise exception 'This order can''t be cancelled anymore; it''s already being processed. Please contact KTC admin.';
  end if;
  if exists (select 1 from public.charges c
             where c.job_order_id = p_id
               and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)) then
    raise exception 'This order already has billing in progress; please contact KTC admin to cancel.'
      using errcode = 'check_violation';
  end if;
  update public.job_orders set status = 'cancelled' where id = p_id;
end;
$$;
revoke all on function public.cancel_job_order(uuid) from public, anon;
grant execute on function public.cancel_job_order(uuid) to authenticated;

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
    where id = p_id and customer_id = public.current_customer_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if coalesce(v_row.is_rexray, false) then
    raise exception 'This is an internal KTC re-X-ray and can''t be edited here.';
  end if;
  if v_row.status not in ('held', 'submitted') then
    raise exception 'This order can''t be edited anymore; KTC has accepted it. Reply on an on-hold order, or contact KTC admin.';
  end if;
  if exists (select 1 from public.charges c
             where c.job_order_id = p_id
               and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)) then
    raise exception 'This order already has billing in progress; please contact KTC admin to change it.'
      using errcode = 'check_violation';
  end if;
  if p_consignee_id is null then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.consignees where id = p_consignee_id) then
    raise exception 'Consignee not found.';
  end if;
  if length(coalesce(trim(p_entry_number), '')) = 0 then
    raise exception 'Enter the Entry Number.' using errcode = 'check_violation';
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
        raise exception 'Container number "%" looks invalid; use 4-20 letters or digits.', trim(e->>'container_number')
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
  if v_count > 200 then
    raise exception 'A job order can have at most 200 containers.' using errcode = 'check_violation';
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

-- Customer release filing and release payment actions.
create or replace function public.file_release_order(p_consignee uuid, p_bl text, p_doc_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cust uuid := public.current_customer_id();
begin
  if v_cust is null or not exists (select 1 from public.customers where id = v_cust and status = 'approved') then
    raise exception 'Your account must be approved to file a release.';
  end if;
  if coalesce(trim(p_bl), '') = '' then raise exception 'A BL number is required.'; end if;
  if length(p_bl) > 60 then raise exception 'BL number is too long.'; end if;
  insert into public.release_orders (release_number, customer_id, consignee_id, bl_number, doc_path, status)
  values ('RO-' || lpad(nextval('release_no_seq')::text, 6, '0'),
          v_cust, p_consignee, upper(trim(p_bl)), nullif(p_doc_path, ''), 'submitted')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.resubmit_release_doc(p_id uuid, p_doc_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id();
begin
  update public.release_orders
     set doc_path = nullif(p_doc_path, ''), status = 'submitted', staff_note = null
   where id = p_id and customer_id = v_cust and status = 'on_hold';
  if not found then raise exception 'This release can''t be resubmitted.'; end if;
end;
$$;

create or replace function public.submit_release_payment(p_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id();
begin
  update public.release_orders
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof_path, ''),
         payment_submitted_at = now(), payment_note = null
   where id = p_id and customer_id = v_cust and status = 'payable'
     and payment_status in ('unpaid', 'rejected');
  if not found then raise exception 'This release is not ready for payment.'; end if;
end;
$$;
revoke all on function public.file_release_order(uuid, text, text) from public, anon;
revoke all on function public.resubmit_release_doc(uuid, text) from public, anon;
revoke all on function public.submit_release_payment(uuid, text) from public, anon;
grant execute on function public.file_release_order(uuid, text, text) to authenticated;
grant execute on function public.resubmit_release_doc(uuid, text) to authenticated;
grant execute on function public.submit_release_payment(uuid, text) to authenticated;

-- Customer support tickets are customer-only, even if a staff profile has
-- accepted the agreement for its own account page.
create or replace function public.open_ticket(p_subject text, p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cust   uuid := public.current_customer_id();
  v_cat    text := coalesce(nullif(trim(p_category), ''), 'other');
  v_ticket uuid;
  v_open   int;
begin
  if v_cust is null then
    raise exception 'Only customers can open support tickets.';
  end if;
  if not public.has_recorded_consent() then
    raise exception 'Please accept the Customer Agreement before contacting support.';
  end if;
  if length(coalesce(trim(p_subject), '')) = 0 then
    raise exception 'Please enter a subject.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  if v_cat not in ('account','accreditation','job_order','payment',
                   'app_system','customer_service','operations','other') then
    raise exception 'Unknown category %.', v_cat;
  end if;

  select count(*) into v_open
  from public.support_tickets
  where customer_id = v_cust and status = 'open';
  if v_open >= 5 then
    raise exception 'You already have 5 open support tickets. Please close one before opening another.';
  end if;

  insert into public.support_tickets (customer_id, subject, category)
  values (v_cust, left(trim(p_subject), 200), v_cat)
  returning id into v_ticket;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (v_ticket, auth.uid(), false, left(trim(p_body), 4000));

  return v_ticket;
end;
$$;
revoke all on function public.open_ticket(text, text, text) from public, anon;
grant execute on function public.open_ticket(text, text, text) to authenticated;

-- Customer consignee requests.
create or replace function public.request_consignee(
  p_name text, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id(); v_id uuid; v_code text; v_constraint text;
begin
  if v_cust is null then raise exception 'Only customer accounts can request consignees.'; end if;
  if not exists (select 1 from public.customers where id = v_cust and status = 'approved') then
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists; search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee; a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  perform public.notify_staff('review_consignee_requests', 'consignee',
    'New consignee "' || trim(p_name) || '" requested; needs review.', null, null);
  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;
revoke all on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.resubmit_consignee(
  p_id uuid,
  p_name text default null, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_customer_id(); v_hit boolean; v_constraint text;
begin
  if v_cust is null then raise exception 'Only customer accounts can resubmit consignees.'; end if;
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
     where id = p_id and requested_by = v_cust and status in ('needs_info', 'rejected');
    v_hit := found;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists; search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee; a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  if not v_hit then raise exception 'Request not found or not editable.'; end if;
end;
$$;
revoke all on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
