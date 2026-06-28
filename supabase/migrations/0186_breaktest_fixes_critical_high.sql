-- ============================================================
-- 0186 — break-test remediation: CRITICAL + HIGH findings (owner, 2026-06-28)
--
-- Source: docs/audits/2026-06-28-breaktest-findings.md (Jarvis-verified).
-- Scope: KTC-01/02/03 (critical) + KTC-05/06/07/08/09/10/11/34 (high) + KTC-17.
-- KTC-04 was downgraded to LOW (verified not reproducing in prod) — not fixed here.
--
-- Each SECURITY DEFINER function below is recreated from its LATEST definition
-- VERBATIM with ONLY the documented change applied; every revoke/grant line is
-- preserved exactly. Latest sources: enforce_two_gate_complete/cancel_job_order
-- 0181, complete_on_payment_confirmed 0097, review_payment 0177,
-- record_office_payment 0178, review_supplement_payment/record_supplement_office_payment
-- 0101, resubmit_needs_info 0154, file_job_order 0163, request_consignee 0183,
-- resubmit_consignee 0185, guard_broker_protected_fields 0162.
-- ============================================================

-- ------------------------------------------------------------
-- KTC-01 — request_supplement inserts NULL into NOT NULL jo_supplements.amount.
-- A requested-but-unpriced charge has no amount yet; bill_supplement/add_supplement
-- already enforce amount>0, and the gates key off bill_status, so the NOT NULL is wrong.
-- ------------------------------------------------------------
alter table public.jo_supplements alter column amount drop not null;

-- ------------------------------------------------------------
-- KTC-02 — enforce_two_gate_complete contradicted jo_ready_to_complete: a FREE
-- re-X-ray child (is_rexray and not rexray_billable) could never complete because
-- this BEFORE-UPDATE-OF-status guard demanded payment_status='confirmed' with no
-- exemption. Mirror the jo_ready_to_complete (0181) exemption inline. (This is a
-- BEFORE trigger, so it must read new.* directly — delegating to jo_ready_to_complete
-- would read the pre-update row.) Billed-supplement + RPS clauses kept.
-- ------------------------------------------------------------
create or replace function public.enforce_two_gate_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not (public.jo_all_services_done(new.id)
            and (case
                   when new.is_rexray and not new.rexray_billable then true
                   else new.payment_status = 'confirmed'
                        and (new.rps_status <> 'needed' or new.rps_payment_status = 'confirmed')
                 end)
            and not exists (select 1 from public.jo_supplements s
                            where s.job_order_id = new.id and s.bill_status = 'billed' and s.payment_status <> 'confirmed')) then
      raise exception 'Cannot complete — services, base payment, RPS, and all billed charges must be cleared.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- KTC-03 — complete_on_payment_confirmed (BEFORE UPDATE OF payment_status,
-- rps_payment_status) auto-completed an order even with a BILLED-unpaid supplement
-- outstanding, because it had no supplement clause (the status-only backstop never
-- fires on a payment-only SET). Add the same billed-unpaid-supplement guard.
-- Recreated from 0097 verbatim + the supplement clause.
-- ------------------------------------------------------------
create or replace function public.complete_on_payment_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('submitted','processing','on_hold')
     and public.jo_all_services_done(new.id)
     and new.payment_status = 'confirmed'
     and (new.rps_status <> 'needed' or new.rps_payment_status = 'confirmed')
     and not exists (select 1 from public.jo_supplements s
                     where s.job_order_id = new.id and s.bill_status = 'billed' and s.payment_status <> 'confirmed')
     and ((new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed')
          or (new.rps_payment_status = 'confirmed' and old.rps_payment_status is distinct from 'confirmed')) then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- KTC-05 — review_payment could CONFIRM a payment (+ bind the ERP invoice) on a
-- CANCELLED/REJECTED order. Recreated from 0177 verbatim + a terminal-status guard
-- (the order status is now read under the existing FOR UPDATE lock).
-- ------------------------------------------------------------
create or replace function public.review_payment(p_id uuid, p_confirm boolean, p_note text default null, p_kind text default 'base')
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_inv text; v_pad text; v_order_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to review payments.';
  end if;
  if p_kind = 'rps' then
    select rps_payment_status, status into v_status, v_order_status from public.job_orders where id = p_id for update;
  else
    select payment_status, service_invoice_no, invoice_pad_no, status into v_status, v_inv, v_pad, v_order_status
      from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
  if v_order_status in ('cancelled','rejected') then
    raise exception 'This order is % — its payment can no longer be reviewed.', v_order_status using errcode = 'check_violation';
  end if;
  if v_status <> 'submitted' then
    raise exception 'No submitted payment proof to review (current: %).', v_status;
  end if;
  if not p_confirm and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why (e.g. wrong amount, unclear slip).' using errcode = 'check_violation';
  end if;
  if p_confirm and p_kind <> 'rps'
     and (coalesce(trim(v_inv), '') = '' or coalesce(trim(v_pad), '') = '') then
    raise exception 'Record the ERP service invoice + BIR pad serial before confirming the payment.'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'rps' then
    update public.job_orders set rps_payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
           rps_payment_confirmed_at = case when p_confirm then now() else null end,
           rps_payment_note = case when p_confirm then null else trim(p_note) end
     where id = p_id;
  else
    update public.job_orders set payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
           payment_confirmed_at = case when p_confirm then now() else null end,
           payment_note = case when p_confirm then null else trim(p_note) end
     where id = p_id;
  end if;
end;
$$;

-- KTC-05 (cont.) — record_office_payment (walk-in) had the same gap. Recreated from
-- 0178 verbatim + the terminal-status guard.
create or replace function public.record_office_payment(p_id uuid, p_kind text default 'base', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_inv text; v_pad text; v_order_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to record payments.';
  end if;
  if p_kind not in ('base','rps') then raise exception 'Unknown payment kind %.', p_kind; end if;
  if p_kind = 'rps' then
    select rps_payment_status, status into v_status, v_order_status from public.job_orders where id = p_id for update;
  else
    select payment_status, service_invoice_no, invoice_pad_no, status into v_status, v_inv, v_pad, v_order_status
      from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
  if v_order_status in ('cancelled','rejected') then
    raise exception 'This order is % — its payment can no longer be recorded.', v_order_status using errcode = 'check_violation';
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
-- KTC-34 — supplement-payment RPCs had no order-status guard (sibling of KTC-05):
-- a supplement payment could be confirmed on a cancelled/rejected order. Recreated
-- from 0101 verbatim + the terminal-status guard (order status read under the
-- existing FOR UPDATE lock, now joined). revoke/grant preserved exactly.
-- ------------------------------------------------------------
create or replace function public.review_supplement_payment(p_supp uuid, p_confirm boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_jo uuid; v_order_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to review payments.';
  end if;
  select s.job_order_id, jo.status into v_jo, v_order_status
    from public.jo_supplements s join public.job_orders jo on jo.id = s.job_order_id
    where s.id = p_supp for update;
  if not found then raise exception 'Charge not found.'; end if;
  if v_order_status in ('cancelled','rejected') then
    raise exception 'This order is % — its payment can no longer be reviewed.', v_order_status using errcode = 'check_violation';
  end if;
  if not p_confirm and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why.' using errcode = 'check_violation';
  end if;
  update public.jo_supplements
    set payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
        payment_confirmed_at = case when p_confirm then now() else null end,
        payment_note = case when p_confirm then null else trim(p_note) end
    where id = p_supp;

  -- Settling the last outstanding charge re-completes the order.
  if p_confirm and public.jo_ready_to_complete(v_jo) then
    update public.job_orders set status = 'completed', completed_at = coalesce(completed_at, now())
      where id = v_jo and status in ('submitted','processing','on_hold');
  end if;

  insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, v_jo,
           case when p_confirm then 'payment_confirmed' else 'payment_rejected' end,
           case when p_confirm then 'Additional-charge payment confirmed'
                else 'Additional-charge payment needs attention — “' || trim(p_note) || '”' end
    from public.job_orders where id = v_jo;
end;
$$;
revoke all on function public.review_supplement_payment(uuid, boolean, text) from public, anon;
grant execute on function public.review_supplement_payment(uuid, boolean, text) to authenticated;

create or replace function public.record_supplement_office_payment(p_supp uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_jo uuid; v_order_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to record payments.';
  end if;
  select s.job_order_id, jo.status into v_jo, v_order_status
    from public.jo_supplements s join public.job_orders jo on jo.id = s.job_order_id
    where s.id = p_supp for update;
  if not found then raise exception 'Charge not found.'; end if;
  if v_order_status in ('cancelled','rejected') then
    raise exception 'This order is % — its payment can no longer be recorded.', v_order_status using errcode = 'check_violation';
  end if;
  update public.jo_supplements
    set payment_status = 'confirmed', payment_confirmed_at = now(), payment_note = null
    where id = p_supp;
  if public.jo_ready_to_complete(v_jo) then
    update public.job_orders set status = 'completed', completed_at = coalesce(completed_at, now())
      where id = v_jo and status in ('submitted','processing','on_hold');
  end if;
  perform public.log_jo_event(v_jo, 'supplement_office_paid', jsonb_build_object('supplement', p_supp));
end;
$$;
revoke all on function public.record_supplement_office_payment(uuid) from public, anon;
grant execute on function public.record_supplement_office_payment(uuid) to authenticated;

-- ------------------------------------------------------------
-- KTC-06 — resubmit_needs_info, when the customer swaps the CONTAINER set on hold,
-- left prior base payment + ERP invoice + X-ray completion intact (revenue leakage +
-- customs/X-ray bypass). Recreated from 0154 verbatim; the 'containers' branch now
-- also invalidates payment, invoice, and service/X-ray completion for the order.
-- ------------------------------------------------------------
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
    -- Changing the container set invalidates everything tied to the old containers:
    -- the base payment + ERP invoice (the amount was for the old set) and every
    -- service/X-ray completion (the new containers were never inspected).
    update public.job_orders
       set payment_status      = 'unpaid',
           payment_confirmed_at = null,
           payment_proof_path  = null,
           service_invoice_no  = null,
           invoice_pad_no      = null,
           invoice_recorded_at = null
     where id = p_id;
    delete from public.service_completions where job_order_id = p_id;
    update public.job_order_lines set xray_done_at = null, xray_done_by = null, xray_done_by_name = null
     where job_order_id = p_id;
  end if;

  update public.job_orders
     set status = 'submitted', customer_note = trim(p_note),
         needs_fields = null, last_customer_edit_at = now()
   where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- KTC-07 — cancel_job_order stranded a paid/pending supplement payment (the guard
-- release_orders got in 0131). Recreated from 0181 verbatim + the supplement guard.
-- ------------------------------------------------------------
create or replace function public.cancel_job_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.is_rexray then raise exception 'This is an internal KTC re-X-ray and can''t be cancelled here.'; end if;
  if v_row.status not in ('held','submitted','on_hold') then
    raise exception 'This order can''t be cancelled anymore — it''s already being processed. Please contact KTC admin.';
  end if;
  if exists (select 1 from public.jo_supplements s
             where s.job_order_id = p_id and s.payment_status in ('submitted','confirmed')) then
    raise exception 'This order has a paid or pending additional charge — contact KTC admin to settle or refund it before cancelling.';
  end if;
  update public.job_orders set status = 'cancelled' where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- KTC-08 + KTC-09 — file_job_order had no per-order container cap (KTC-08) and
-- accepted arbitrary non-catalogue service_request text (KTC-09). Recreated from
-- 0163 verbatim + a >100 container cap and a per-line check that the service exists
-- in the active service_rates catalogue. revoke/grant preserved exactly.
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
  if coalesce(nullif(trim(p_vessel_name), ''), '') = ''
     or coalesce(nullif(trim(p_voyage_number), ''), '') = '' then
    raise exception 'Enter the vessel name and voyage number.' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then
      v_count := v_count + 1;
      -- KTC-09: only catalogued, active services may be filed.
      if not exists (select 1 from public.service_rates r where r.service = e->>'service_request' and r.active) then
        raise exception 'Unknown service "%". Please pick a service from the list.', coalesce(e->>'service_request', '')
          using errcode = 'check_violation';
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
-- KTC-10 + KTC-11 — request_consignee mapped EVERY unique_violation to "name already
-- exists" (masking a code collision) and fired no staff notification despite the
-- filename. Recreated from 0183 verbatim + (KTC-10) branch the unique_violation on
-- the offending constraint and (KTC-11) notify the consignee-review desk on success.
-- ------------------------------------------------------------
create or replace function public.request_consignee(
  p_name text, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id(); v_id uuid; v_code text; v_constraint text;
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists — search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee — a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  -- KTC-11: tell the consignee-review desk a new request is waiting.
  perform public.notify_staff('review_consignee_requests', 'consignee',
    'New consignee "' || trim(p_name) || '" requested — needs review.', null, null);
  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;

-- KTC-10 (cont.) — resubmit_consignee had the same masking. Recreated from 0185
-- verbatim + the constraint-name branch. revoke/grant preserved exactly.
create or replace function public.resubmit_consignee(
  p_id uuid,
  p_name text default null, p_address text default null, p_tin text default null,
  p_doc_2303 text default null, p_doc_2307 text default null,
  p_customer_name text default null, p_address2 text default null,
  p_tel text default null, p_mobile text default null, p_email text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id(); v_hit boolean; v_constraint text;
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
     where id = p_id and requested_by = v_cust and status in ('needs_info', 'rejected');
    v_hit := found;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'consignees_name_lower_key' then
      raise exception 'A consignee with that name already exists — search for it in the list.'
        using errcode = 'check_violation';
    else
      raise exception 'Couldn''t save this consignee — a record conflict occurred (ref %). Please try again or contact KTC.', coalesce(v_constraint, 'unknown')
        using errcode = 'check_violation';
    end if;
  end;
  if not v_hit then raise exception 'Request not found or not editable.'; end if;
end;
$$;
revoke all on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_consignee(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- KTC-17 — guard_broker_protected_fields errored with 22P02 ("malformed array
-- literal") on `v_attempt := v_attempt || 'literal'` (text[] || unknown), aborting
-- BEFORE the protected_field_attempt audit + owner alert could log. Recreated from
-- 0162 verbatim with every append cast to ::text; behavior otherwise identical.
-- ------------------------------------------------------------
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner   boolean;
  v_attempt    text[] := '{}';
  v_owner_ok   boolean := coalesce(current_setting('ktc.allow_owner_change', true), '') = '1';
  v_consent_ok boolean := coalesce(current_setting('ktc.allow_consent_write', true), '') = '1';
begin
  if auth.uid() is null then
    new.is_root_owner := old.is_root_owner;
    return new;
  end if;

  -- Consent columns are server-stamped only: a client UPDATE can't change them.
  -- The consent RPCs set ktc.allow_consent_write=1 for their own txn; all else pinned.
  if not v_consent_ok then
    new.irr_version             := old.irr_version;             new.irr_accepted_at      := old.irr_accepted_at;
    new.terms_version           := old.terms_version;           new.terms_accepted_at    := old.terms_accepted_at;
    new.privacy_consent_version := old.privacy_consent_version; new.privacy_consented_at := old.privacy_consented_at;
  end if;

  v_is_owner := coalesce((select is_owner from public.customers where user_id = auth.uid()), false);

  if not v_is_owner and new.staff_role is distinct from old.staff_role then
    v_attempt := v_attempt || 'staff_role'::text;
    new.staff_role := old.staff_role;
  end if;

  if old.is_owner then
    if not v_is_owner then
      if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'::text; end if;
      if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'::text; end if;
      if new.status   is distinct from old.status   then v_attempt := v_attempt || 'status'::text;   end if;
    end if;
    if not v_owner_ok then new.is_owner := old.is_owner; end if;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'::text; end if;
    if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'::text; end if;
    new.is_owner := old.is_owner;
    new.is_admin := old.is_admin;
    if not (old.status in ('rejected', 'approved') and new.status = 'pending') then
      if new.status is distinct from old.status then v_attempt := v_attempt || 'status'::text; end if;
      new.status     := old.status;
      new.decided_at := old.decided_at;
    end if;
  end if;

  -- Changing is_admin is OWNER-only (staff are owner-invite-only). Blocks a
  -- plain admin from minting/altering admins via a raw row update.
  if new.is_admin is distinct from old.is_admin and not v_is_owner then
    v_attempt := v_attempt || 'is_admin'::text;
    new.is_admin := old.is_admin;
  end if;

  if not v_owner_ok then
    new.is_owner := old.is_owner;
  end if;
  new.is_root_owner := old.is_root_owner;

  if array_length(v_attempt, 1) is not null then
    perform public.log_security_event('protected_field_attempt', new.id,
      jsonb_build_object('fields', (select to_jsonb(array_agg(distinct f)) from unnest(v_attempt) f)));
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
