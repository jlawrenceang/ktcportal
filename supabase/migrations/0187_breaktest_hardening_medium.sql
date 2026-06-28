-- ============================================================
-- 0187 — break-test remediation: MEDIUM + LOW findings (owner, 2026-06-28)
--
-- Source: docs/audits/2026-06-28-breaktest-findings.md.
-- Scope (security + data-integrity hardening for the open medium/low items):
--   KTC-13 · KTC-14 · KTC-15 · KTC-16 · KTC-21 · KTC-22 · KTC-09 (residuals)
--   KTC-27 · KTC-31 · KTC-33.
-- (KTC-25/26 are frontend-only — see src/. KTC-32 deliberately NOT touched.)
--
-- Every SECURITY DEFINER function below is recreated from its LATEST definition
-- VERBATIM with ONLY the documented change applied; each revoke/grant line is
-- preserved exactly. Latest sources used:
--   record_office_payment 0186 · record_rps_assessment 0062 · record_van_xray 0181
--   file_job_order 0186 · update_job_order 0183 (NOT 0141 — 0183 is the latest,
--   it added the re-X-ray edit guard) · admin_file_job_order 0141 ·
--   request_rexray 0183 · resubmit_rejected 0034.
-- RLS policies recreated by their exact current names:
--   payment_info "payment info readable" 0036 · shipping_lines
--   "read shipping lines" 0057 · role_permissions "read role permissions" 0035.
-- ============================================================

-- ------------------------------------------------------------
-- KTC-13 — terminal-reject bypass on legacy (pre-0154) rejected orders.
-- (a) Backfill: every reject is terminal now (staff_transition_order forces
--     rejected_recoverable=false since 0154); close the legacy rows too.
-- (b) Retire resubmit_rejected: it has NO live UI caller (grep of src/ is clean),
--     so the safe move is to keep the signature + grant but make the body always
--     raise — a stale cached client gets a clear message instead of a missing-
--     function error. (create-or-replace preserves the 0034 grant.)
-- ------------------------------------------------------------
update public.job_orders set rejected_recoverable = false where status = 'rejected';

create or replace function public.resubmit_rejected(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Rejected orders are closed — please file a new order.'
    using errcode = 'check_violation';
end;
$$;

-- ------------------------------------------------------------
-- KTC-14 + KTC-15 — record_rps_assessment (0062) could (KTC-15) set/modify the
-- RPS charge on a cancelled/rejected/completed order, and (KTC-14) a prior RPS
-- payment confirm survived a re-assessment. Recreated from 0062 verbatim + a
-- status FOR UPDATE guard (open orders only) and a payment-state reset on every
-- (re)assessment. revoke/grant preserved exactly.
-- ------------------------------------------------------------
create or replace function public.record_rps_assessment(p_jo uuid, p_needed boolean, p_path text, p_moves jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('assess_rps') then
    raise exception 'You don''t have permission to assess RPS.';
  end if;
  -- KTC-15: only an open order can be (re)assessed.
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — RPS can only be assessed on an open order.', v_status
      using errcode = 'check_violation';
  end if;
  update public.job_orders
     set rps_status = case when p_needed then 'needed' else 'not_needed' end,
         rps_path = p_path,
         rps_assessed_at = now(),
         rps_assessed_by = auth.uid(),
         -- KTC-14: a (re)assessment invalidates any prior RPS payment so a stale
         -- confirm can't carry over to the new charge.
         rps_payment_status = 'unpaid',
         rps_payment_proof_path = null,
         rps_payment_submitted_at = null,
         rps_payment_confirmed_at = null,
         rps_payment_note = null
   where id = p_jo;
  delete from public.rps_moves where job_order_id = p_jo;
  if p_needed and p_moves is not null then
    insert into public.rps_moves (job_order_id, move_type, qty)
    select p_jo, key, value::int from jsonb_each_text(p_moves) where coalesce(value, '0')::int > 0;
  end if;
end;
$$;
revoke all on function public.record_rps_assessment(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.record_rps_assessment(uuid, boolean, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- KTC-14 (cont.) — record_office_payment (0186) confirmed an RPS payment on an
-- order with NO RPS assessed; a later real assessment then inherited the stale
-- confirm. Recreated from 0186 verbatim + a guard requiring rps_status='needed'
-- on the rps branch (the order row is already locked FOR UPDATE).
-- ------------------------------------------------------------
create or replace function public.record_office_payment(p_id uuid, p_kind text default 'base', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_inv text; v_pad text; v_order_status text; v_rps_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to record payments.';
  end if;
  if p_kind not in ('base','rps') then raise exception 'Unknown payment kind %.', p_kind; end if;
  if p_kind = 'rps' then
    select rps_payment_status, rps_status, status into v_status, v_rps_status, v_order_status
      from public.job_orders where id = p_id for update;
  else
    select payment_status, service_invoice_no, invoice_pad_no, status into v_status, v_inv, v_pad, v_order_status
      from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
  if v_order_status in ('cancelled','rejected') then
    raise exception 'This order is % — its payment can no longer be recorded.', v_order_status using errcode = 'check_violation';
  end if;
  -- KTC-14: no RPS payment without an RPS assessment that calls for one.
  if p_kind = 'rps' and coalesce(v_rps_status, '') <> 'needed' then
    raise exception 'No RPS has been assessed for this order — assess RPS first.' using errcode = 'check_violation';
  end if;
  if v_status = 'confirmed' then raise exception 'This payment is already confirmed.'; end if;
  if p_kind <> 'rps' and (coalesce(trim(v_inv), '') = '' or coalesce(trim(v_pad), '') = '') then
    raise exception 'Record the ERP service invoice + BIR pad serial before confirming the payment.'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'rps' then
    update public.job_orders set rps_payment_status='confirmed', rps_payment_confirmed_at=now(), rps_payment_note=null where id=p_id;
  else
    update public.job_orders set payment_status='confirmed', payment_confirmed_at=now(), payment_note=null where id=p_id;
  end if;
  perform public.log_jo_event(p_id, 'payment_office', jsonb_build_object('kind', p_kind, 'note', nullif(trim(coalesce(p_note,'')),'')));
end;
$$;

-- ------------------------------------------------------------
-- KTC-16 — record_van_xray (0181) let a checker X-ray (and auto-promote) a
-- never-accepted (submitted) order, bypassing the ops accept gate. Recreated
-- from 0181 verbatim; now requires an ACCEPTED status (processing/on_hold) and
-- drops the submitted -> processing auto-promotion. re-X-ray approval guard kept.
-- ------------------------------------------------------------
create or replace function public.record_van_xray(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jo uuid; v_svc text; v_status text; v_remaining int;
  v_is_rexray boolean; v_rexray_status text;
  v_signer text := (select full_name from public.customers where user_id = auth.uid());
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
  select status, is_rexray, rexray_status into v_status, v_is_rexray, v_rexray_status
    from public.job_orders where id = v_jo for update;
  -- KTC-16: the order must be ACCEPTED by operations first — a still-submitted
  -- order can't be X-rayed (and is no longer auto-promoted here).
  if v_status not in ('processing','on_hold') then
    raise exception 'This order is % — operations must accept it before X-ray.', v_status;
  end if;
  if coalesce(v_is_rexray, false) and coalesce(v_rexray_status, '') <> 'approved' then
    raise exception 'This re-X-ray hasn''t been approved by an admin yet.';
  end if;
  update public.job_order_lines
    set xray_done_at      = coalesce(xray_done_at, now()),
        xray_done_by      = coalesce(xray_done_by, auth.uid()),
        xray_done_by_name = coalesce(xray_done_by_name, v_signer)
    where id = p_line_id;
  select count(*) into v_remaining
    from public.job_order_lines l
    where l.job_order_id = v_jo
      and public.service_line_of(l.service_request) = 'xray'
      and l.xray_done_at is null;
  if v_remaining = 0 then
    perform public.record_service_done(v_jo, 'xray', now());
  end if;
end;
$$;

-- ------------------------------------------------------------
-- KTC-21 + KTC-22 + KTC-09 (residual) — file_job_order (0186) had no length caps
-- on the header fields (KTC-21), leaked raw Postgres errors with no per-line
-- pre-validation (KTC-22). Recreated from 0186 verbatim + entry/vessel/voyage
-- length caps, a p_lines array typeof guard, and a per-line container-number
-- format + size/fill/kind check (friendly messages). The KTC-08 cap and KTC-09
-- service whitelist from 0186 are kept. revoke/grant preserved exactly.
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

  return v_jo;
end;
$function$;
revoke all on function public.file_job_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.file_job_order(uuid, text, text, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- KTC-21 + KTC-22 + KTC-09 (residual) — update_job_order had the same gaps as
-- file_job_order. Recreated from 0183 (the LATEST def — it carries the re-X-ray
-- edit guard) verbatim + the identical header caps, array typeof guard, and
-- per-line container/service/size/fill/kind pre-validation. revoke/grant kept.
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
  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(),
          jsonb_build_object('by', 'customer', 'after_filing', v_row.status = 'submitted'));
end;
$function$;
revoke all on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- KTC-09 (residual) — admin_file_job_order (0141) inserted service_request
-- verbatim with no catalogue check. Recreated from 0141 verbatim + the same
-- active-service_rates whitelist as file_job_order. revoke/grant preserved.
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

  select jo_number into v_jo from public.job_orders where id = v_id;
  return jsonb_build_object('id', v_id, 'jo_number', v_jo, 'customer_name', v_customer.full_name);
end;
$function$;
revoke all on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- KTC-27 — request_rexray (0183) copied ALL parent service lines (DEA/OOG too),
-- so a multi-service order's re-X-ray child needed non-X-ray services re-done.
-- Recreated from 0183 verbatim; now copies only X-ray lines and raises if the
-- parent has none.
-- ------------------------------------------------------------
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
  -- KTC-27: a re-X-ray only makes sense if the parent had an X-ray service.
  if not exists (select 1 from public.job_order_lines
                 where job_order_id = p_parent and public.service_line_of(service_request) = 'xray') then
    raise exception 'This order has no X-ray containers to re-X-ray.';
  end if;
  perform pg_advisory_xact_lock(hashtext('rexray:' || p_parent::text));
  select count(*) into v_n from public.job_orders where parent_job_order_id = p_parent;
  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name,
                                 voyage_number, status, jo_number, is_rexray, parent_job_order_id,
                                 rexray_status, rexray_billable)
  values (v_p.customer_id, v_p.consignee_id, v_p.entry_number, v_p.vessel_visit, v_p.vessel_name,
          v_p.voyage_number, 'submitted', coalesce(v_p.jo_number, '') || chr(65 + v_n), true, p_parent,
          'requested', false)
  returning id into v_child;
  -- KTC-27: only the X-ray lines are carried into the re-X-ray child.
  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select v_child, container_number, service_request, size, fill, kind
    from public.job_order_lines
    where job_order_id = p_parent and public.service_line_of(service_request) = 'xray';
  perform public.notify_staff('approve_rexray', 'rexray',
    'Re-X-ray requested on ' || coalesce(v_p.jo_number, v_p.entry_number, 'an order') || ' — needs admin approval.', v_child, null);
  return v_child;
end;
$$;

-- ------------------------------------------------------------
-- KTC-31 — payment_info (KTC payee bank/GCash) was readable by ANY authenticated
-- user, incl. pending. Re-gate the SELECT policy (0036) to approved customers +
-- staff. (Write policy untouched.)
-- ------------------------------------------------------------
drop policy if exists "payment info readable" on public.payment_info;
create policy "payment info readable" on public.payment_info
  for select to authenticated
  using (public.broker_is_approved() or public.current_is_staff());

-- ------------------------------------------------------------
-- KTC-33 — shipping_lines + role_permissions were world-readable to any
-- authenticated user (incl. pending) via using(true). Gate shipping_lines to
-- approved customers + staff; role_permissions to staff only (customers never
-- read it — usePermissions only queries it for staff roles). Write policies kept.
-- ------------------------------------------------------------
drop policy if exists "read shipping lines" on public.shipping_lines;
create policy "read shipping lines" on public.shipping_lines
  for select to authenticated
  using (public.broker_is_approved() or public.current_is_staff());

drop policy if exists "read role permissions" on public.role_permissions;
create policy "read role permissions" on public.role_permissions
  for select to authenticated
  using (public.current_is_staff());

notify pgrst, 'reload schema';
