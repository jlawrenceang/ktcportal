-- ============================================================
-- 0212 — Filing seeds the base charge + container identity
--        (ADR-0037 Phase A cutover · Stage 1.1; owner 2026-06-29)
--
-- The FIRST wire of the new charges spine into the live flow. Filing a job order
-- now, in addition to writing job_orders + job_order_lines (unchanged):
--   (1) find-or-creates the first-class `containers` row for each physical box
--       (ISO-6346 flagged) and links it onto job_order_lines.container_id, and
--   (2) creates the base 'service' charge(s) — one per distinct catalogued
--       service on the order — priced off the ONE price spine (per-consignee
--       override → service_rates → move_rates), snapshotted, bill_status='billed',
--       with a charge_audit 'created' entry (accountability).
--
-- ADDITIVE / NON-BREAKING: the OLD base/RPS/supplement payment path is untouched
-- and still live — this only POPULATES the new `charges` so the already-built
-- customer JobOrderCharges screen shows a transparent bill. The switch off the old
-- path happens at the Stage-2 atomic flip.
--
-- Wired into all three line-writing RPCs (file_job_order, admin_file_job_order,
-- update_job_order) so a pre-acceptance edit keeps the bill correct. The seed is
-- re-seed-safe and money-safe: if a base charge has already moved past pristine
-- (payment in flight, invoice recorded, or bundled into a payment order) it leaves
-- billing alone for staff to reconcile.
--
-- NOT covered here (follow-ups): re-X-ray children (request_rexray — billable vs
-- free), and the release/pull-out desk (Stage 1.6). RPS + add-ons land in 1.2/1.3.
-- ============================================================

-- ---------- internal helper: seed container identity + base service charge(s) ----------
create or replace function public.seed_job_order_billing(p_jo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r           record;
  v_rate      numeric;
  v_vat       boolean;
  v_charge    uuid;
  v_consignee uuid;
begin
  select consignee_id into v_consignee from public.job_orders where id = p_jo;
  if not found then return; end if;

  -- (1) Container identity — find-or-create one row per distinct physical box on
  -- this order, then link the lines. Idempotent: only fills a null link, and the
  -- unique container_no means the same box is ONE row across every order.
  insert into public.containers (container_no, iso_valid, created_by)
  select distinct l.container_number,
         public.iso6346_valid(l.container_number),
         auth.uid()
    from public.job_order_lines l
   where l.job_order_id = p_jo
     and coalesce(l.container_number, '') <> ''
  on conflict (container_no) do nothing;

  update public.job_order_lines l
     set container_id = c.id
    from public.containers c
   where l.job_order_id = p_jo
     and c.container_no = l.container_number
     and l.container_id is null;

  -- (2) Base service charge(s). Money safety: if any base charge has already moved
  -- past pristine (a payment is in flight, an invoice was recorded, or it's bundled),
  -- leave billing as-is — staff reconcile. Otherwise (re)seed from the current lines
  -- so an edit before KTC accepts keeps the bill correct.
  if exists (
    select 1 from public.charges c
     where c.job_order_id = p_jo and c.charge_type = 'service'
       and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)
  ) then
    return;
  end if;

  delete from public.charges where job_order_id = p_jo and charge_type = 'service';

  for r in
    select l.service_request as svc, count(*)::numeric as qty
      from public.job_order_lines l
     where l.job_order_id = p_jo
       and coalesce(l.service_request, '') <> ''
     group by l.service_request
  loop
    v_rate := public.effective_rate(v_consignee, r.svc);
    select coalesce(sr.vatable, true) into v_vat
      from public.service_rates sr where sr.service = r.svc;
    insert into public.charges (job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
    values (p_jo, 'service', r.svc, r.qty, v_rate,
            case when v_rate is null then null else round(v_rate * r.qty, 2) end,
            coalesce(v_vat, true), 'billed', auth.uid())
    returning id into v_charge;
    perform public.log_charge_audit(v_charge, 'created',
      jsonb_build_object('type', 'service', 'label', r.svc, 'qty', r.qty, 'auto', true));
  end loop;
end;
$$;
revoke all on function public.seed_job_order_billing(uuid) from public, anon, authenticated;  -- internal only (definer-called)

-- ------------------------------------------------------------
-- file_job_order — recreated from 0187 VERBATIM + the seed call before return.
-- ------------------------------------------------------------
create or replace function public.file_job_order(
  p_consignee uuid, p_entry_number text, p_vessel_visit text,
  p_vessel_name text, p_voyage_number text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = 'public' as $function$
declare
  v_cust   uuid := public.current_broker_id();
  v_status text;
  v_jo     uuid;
  v_count  int := 0;
  e        jsonb;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not public.broker_is_approved() then
    raise exception 'Your account can''t file orders right now.';
  end if;
  if not public.has_recorded_consent() then
    raise exception 'Please accept the Customer Agreement before filing a job order.';
  end if;
  if p_consignee is null or not exists (select 1 from public.consignees where id = p_consignee) then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_entry_number), '')) = 0 then
    raise exception 'Enter the Entry Number (C-…).' using errcode = 'check_violation';
  end if;
  -- KTC-21: header length caps.
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
  -- KTC-22: reject a malformed (non-array) p_lines with a friendly message.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then
      v_count := v_count + 1;
      -- KTC-22: container number must be alphanumeric, reasonable length.
      if upper(trim(e->>'container_number')) !~ '^[A-Z0-9-]{4,20}$' then
        raise exception 'Container number "%" looks invalid — use 4–20 letters or digits.', trim(e->>'container_number')
          using errcode = 'check_violation';
      end if;
      -- KTC-09: only catalogued, active services may be filed.
      if not exists (select 1 from public.service_rates r where r.service = e->>'service_request' and r.active) then
        raise exception 'Unknown service "%". Please pick a service from the list.', coalesce(e->>'service_request', '')
          using errcode = 'check_violation';
      end if;
      -- KTC-22: friendly messages for size/fill/kind (table CHECKs stay as backstop).
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
  -- KTC-08: cap the order size (mirrors admin_file_job_order, 0141).
  if v_count > 100 then
    raise exception 'A job order can have at most 100 containers.' using errcode = 'check_violation';
  end if;

  v_status := case when public.broker_is_approved() then 'submitted' else 'held' end;

  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name, voyage_number, status)
  values (v_cust, p_consignee, upper(trim(p_entry_number)), nullif(trim(p_vessel_visit), ''),
          upper(trim(p_vessel_name)), upper(trim(p_voyage_number)), v_status)
  returning id into v_jo;

  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select v_jo, upper(trim(j->>'container_number')), j->>'service_request',
         nullif(trim(coalesce(j->>'size', '')), ''), nullif(trim(coalesce(j->>'fill', '')), ''), nullif(trim(coalesce(j->>'kind', '')), '')
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  -- 0212: seed container identity + the base service charge(s) (additive).
  perform public.seed_job_order_billing(v_jo);

  return v_jo;
end;
$function$;
revoke all on function public.file_job_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.file_job_order(uuid, text, text, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- update_job_order — recreated from 0187 VERBATIM + re-seed after the lines are
-- rewritten (an edit before KTC accepts must keep containers + the bill correct).
-- ------------------------------------------------------------
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
  -- KTC-21: header length caps.
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
  -- KTC-22: reject a malformed (non-array) p_lines with a friendly message.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then
      v_count := v_count + 1;
      -- KTC-22: container number must be alphanumeric, reasonable length.
      if upper(trim(e->>'container_number')) !~ '^[A-Z0-9-]{4,20}$' then
        raise exception 'Container number "%" looks invalid — use 4–20 letters or digits.', trim(e->>'container_number')
          using errcode = 'check_violation';
      end if;
      -- KTC-09: only catalogued, active services may be filed.
      if not exists (select 1 from public.service_rates r where r.service = e->>'service_request' and r.active) then
        raise exception 'Unknown service "%". Please pick a service from the list.', coalesce(e->>'service_request', '')
          using errcode = 'check_violation';
      end if;
      -- KTC-22: friendly messages for size/fill/kind (table CHECKs stay as backstop).
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

  -- 0212: re-seed container identity + the base service charge(s) to match the
  -- edited lines (pristine + money-safe; see seed_job_order_billing).
  perform public.seed_job_order_billing(p_id);

  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(),
          jsonb_build_object('by', 'customer', 'after_filing', v_row.status = 'submitted'));
end;
$function$;
revoke all on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- admin_file_job_order — recreated from 0187 VERBATIM + the seed call (walk-in /
-- file-on-behalf orders get the same base charge + container link).
-- ------------------------------------------------------------
create or replace function public.admin_file_job_order(
  p_customer_id uuid, p_consignee_id uuid, p_entry_number text, p_lines jsonb,
  p_vessel_visit text default null, p_vessel_name text default null, p_voyage_number text default null
)
returns jsonb language plpgsql security definer set search_path = 'public' as $function$
declare
  v_customer record;
  v_id uuid;
  v_jo text;
  v_line jsonb;
  v_container text;
  v_service text;
  v_count int := 0;
begin
  if not public.has_permission('file_job_orders') then
    raise exception 'You don''t have permission to file job orders on behalf of customers.';
  end if;

  select id, full_name, status, staff_role into v_customer
    from public.customers where id = p_customer_id;
  if not found then raise exception 'Customer not found.'; end if;
  if v_customer.staff_role is not null then
    raise exception 'That account is a staff account — pick a customer.';
  end if;
  if v_customer.status not in ('approved', 'pending') then
    raise exception 'This customer''s account is % — job orders can''t be filed for it.', v_customer.status;
  end if;

  if not exists (select 1 from public.consignees where id = p_consignee_id) then
    raise exception 'Consignee not found.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A job order can have at most 100 containers.' using errcode = 'check_violation';
  end if;

  insert into public.job_orders (customer_id, consignee_id, entry_number, status, vessel_visit, vessel_name, voyage_number)
  values (p_customer_id, p_consignee_id, nullif(trim(coalesce(p_entry_number, '')), ''), 'submitted',
          nullif(trim(coalesce(p_vessel_visit, '')), ''),
          nullif(trim(coalesce(p_vessel_name, '')), ''),
          nullif(trim(coalesce(p_voyage_number, '')), ''))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_container := upper(trim(coalesce(v_line->>'container_number', '')));
    v_service   := trim(coalesce(v_line->>'service_request', ''));
    if v_container = '' then continue; end if;
    if length(v_container) > 30 or length(v_service) > 80 or v_service = '' then
      raise exception 'Invalid container line.' using errcode = 'check_violation';
    end if;
    -- KTC-09: only catalogued, active services may be filed.
    if not exists (select 1 from public.service_rates r where r.service = v_service and r.active) then
      raise exception 'Unknown service "%". Please pick a service from the list.', v_service using errcode = 'check_violation';
    end if;
    insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
    values (v_id, v_container, v_service,
            nullif(trim(coalesce(v_line->>'size', '')), ''), nullif(trim(coalesce(v_line->>'fill', '')), ''), nullif(trim(coalesce(v_line->>'kind', '')), ''));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;

  -- 0212: seed container identity + the base service charge(s) (additive).
  perform public.seed_job_order_billing(v_id);

  select jo_number into v_jo from public.job_orders where id = v_id;
  return jsonb_build_object('id', v_id, 'jo_number', v_jo, 'customer_name', v_customer.full_name);
end;
$function$;
revoke all on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) to authenticated;

notify pgrst, 'reload schema';
