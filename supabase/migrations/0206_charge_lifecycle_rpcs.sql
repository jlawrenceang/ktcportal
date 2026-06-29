-- ============================================================
-- 0206 — Charge lifecycle RPCs: the anti-fraud billing core
--        (ADR-0037 Phase A addendum; owner 2026-06-29)
--
-- The uniform money pipeline over `charges` (0203). All NEW functions — the live
-- file_job_order / completion paths are untouched until the M4 cutover.
--   • amounts computed SERVER-SIDE (effective_rate) + snapshotted → no client price tampering
--   • add-ons are maker-checker (propose → approve by a DIFFERENT person)        [authorization]
--   • a charge confirms ONLY against a FINAL ERP+BIR invoice — every charge type  [compliance]
--   • every transition is logged to charge_audit (who/what/when)                  [accountability]
--   • reversal is explicit (credit-note + audit), never a silent delete
-- ============================================================

-- broaden charge_type to the catalogued-service category (xray/dea/oog = 'service')
alter table public.charges drop constraint if exists charges_charge_type_check;
alter table public.charges add constraint charges_charge_type_check
  check (charge_type in ('service','rps','addon'));

-- ---------- audit trail (accountability) ----------
create table if not exists public.charge_audit (
  id        uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charges(id) on delete cascade,
  action    text not null,              -- created|approved|invoice_recorded|payment_submitted|payment_confirmed|payment_rejected|reversed|bundled
  actor     uuid,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index if not exists charge_audit_charge_idx on public.charge_audit (charge_id, at);
create index if not exists charge_audit_actor_idx  on public.charge_audit (actor, at desc);

alter table public.charge_audit enable row level security;
revoke all on table public.charge_audit from anon, authenticated;     -- write: definer RPCs only
drop policy if exists "staff reads charge audit" on public.charge_audit;
create policy "staff reads charge audit" on public.charge_audit
  for select to authenticated using (public.is_admin() or public.has_permission('review_payments'));
grant select on table public.charge_audit to authenticated;

-- ---------- effective rate: per-consignee override else the single spine ----------
create or replace function public.effective_rate(p_consignee uuid, p_service text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rate from public.consignee_rate_overrides o
       where o.consignee_id = p_consignee and o.service = p_service and o.active),
    (select rate from public.service_rates r where r.service = p_service and r.active),
    (select rate from public.move_rates m where m.move_type = p_service and m.active)
  );
$$;

-- ---------- internal audit helper (not client-callable) ----------
create or replace function public.log_charge_audit(p_charge uuid, p_action text, p_detail jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.charge_audit (charge_id, action, actor, detail) values (p_charge, p_action, auth.uid(), p_detail);
$$;

-- ============================================================
-- RPCs (SECURITY DEFINER — the only write paths)
-- ============================================================

-- Staff add a charge. 'service'/'rps' bill immediately (rate from the spine);
-- 'addon' is PROPOSED (maker-checker) and needs approval before it bills.
create or replace function public.add_charge(
  p_jo uuid, p_type text, p_label text, p_qty numeric default 1, p_unit_rate numeric default null, p_vatable boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_consignee uuid; v_rate numeric; v_amount numeric; v_bill text;
begin
  if not (public.is_admin() or public.has_permission('accept_orders') or public.has_permission('complete_orders')) then
    raise exception 'You don''t have permission to add charges.';
  end if;
  if p_type not in ('service','rps','addon') then raise exception 'Unknown charge type.'; end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'A charge label is required.' using errcode='check_violation'; end if;
  if length(p_label) > 120 then raise exception 'Charge label is too long.' using errcode='check_violation'; end if;
  if coalesce(p_qty,0) <= 0 or p_qty > 100000 then raise exception 'Enter a valid quantity.' using errcode='check_violation'; end if;
  select consignee_id into v_consignee from public.job_orders where id = p_jo;
  if not found then raise exception 'Job order not found.'; end if;
  -- rate: explicit (ad-hoc add-on) else the spine; amount snapshotted now.
  v_rate := coalesce(p_unit_rate, public.effective_rate(v_consignee, p_label));
  v_amount := case when v_rate is null then null else round(v_rate * p_qty, 2) end;
  v_bill := case when p_type = 'addon' then 'proposed' else 'billed' end;
  insert into public.charges (job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
  values (p_jo, p_type, trim(p_label), p_qty, v_rate, v_amount, coalesce(p_vatable,true), v_bill, auth.uid())
  returning id into v_id;
  perform public.log_charge_audit(v_id, 'created', jsonb_build_object('type',p_type,'label',trim(p_label),'qty',p_qty,'amount',v_amount,'bill_status',v_bill));
  return v_id;
end;
$$;

-- Approve a proposed add-on (maker-checker: approver must DIFFER from the creator).
create or replace function public.approve_charge(p_charge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  if not (public.is_admin() or public.has_permission('complete_orders') or public.has_permission('hold_reject_orders')) then
    raise exception 'You don''t have permission to approve charges.';
  end if;
  select created_by into v_creator from public.charges where id = p_charge and bill_status = 'proposed' for update;
  if not found then raise exception 'No proposed charge to approve.'; end if;
  if v_creator is not null and v_creator = auth.uid() then
    raise exception 'A charge must be approved by someone other than who created it.' using errcode='check_violation';
  end if;
  update public.charges set bill_status = 'billed', approved_by = auth.uid(), approved_at = now() where id = p_charge;
  perform public.log_charge_audit(p_charge, 'approved', null);
end;
$$;

-- Record the FINAL ERP + BIR invoice on a charge (prerequisite to confirming payment).
create or replace function public.record_charge_invoice(p_charge uuid, p_erp text, p_bir text)
returns void language plpgsql security definer set search_path = public as $$
declare v_erp text := upper(regexp_replace(coalesce(p_erp,''), '\s', '', 'g'));
        v_bir text := regexp_replace(coalesce(p_bir,''), '\s', '', 'g'); m text[];
begin
  if not public.has_permission('record_invoice') then raise exception 'You don''t have permission to record invoices.'; end if;
  m := regexp_match(v_erp, '^(OR|BI)-?INV-?0*(\d{1,8})$');
  if m is null or m[2]::bigint = 0 then
    raise exception 'ERP control no. not recognized — format OR-INV-00135921 (cash) or BI-INV-00220871 (credit), non-zero.' using errcode='check_violation';
  end if;
  v_erp := m[1] || '-INV-' || lpad(m[2], 8, '0');
  if v_bir !~ '^\d{4,8}$' or v_bir::bigint = 0 then
    raise exception 'BIR invoice serial not recognized — printed pad number, 4–8 digits, non-zero.' using errcode='check_violation';
  end if;
  update public.charges
     set erp_invoice_no = v_erp, bir_invoice_no = v_bir, invoice_state = 'final', invoice_recorded_at = now()
   where id = p_charge and bill_status = 'billed' and payment_status <> 'confirmed';
  if not found then raise exception 'Invoice can only be recorded on a billed, unconfirmed charge.'; end if;
  perform public.log_charge_audit(p_charge, 'invoice_recorded', jsonb_build_object('erp',v_erp,'bir',v_bir));
end;
$$;

-- Customer submits a payment proof for a charge (proof in the payment-slips bucket).
create or replace function public.submit_charge_payment(p_charge uuid, p_proof text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  update public.charges c
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof,''), payment_submitted_at = now(), payment_note = null
   where c.id = p_charge and c.bill_status = 'billed' and c.payment_status in ('unpaid','rejected')
     and exists (select 1 from public.job_orders j where j.id = c.job_order_id and j.customer_id = v_cust);
  if not found then raise exception 'This charge is not awaiting your payment.'; end if;
  perform public.log_charge_audit(p_charge, 'payment_submitted', null);
end;
$$;

-- THE GATE: confirm a charge's payment — only against a FINAL ERP+BIR invoice. Every type.
create or replace function public.confirm_charge_payment(p_charge uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_state text; v_erp text; v_bir text; v_pay text;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  select invoice_state, erp_invoice_no, bir_invoice_no, payment_status
    into v_state, v_erp, v_bir, v_pay from public.charges where id = p_charge for update;
  if not found then raise exception 'Charge not found.'; end if;
  if v_pay <> 'submitted' then raise exception 'No submitted payment to review for this charge (current: %).', v_pay; end if;
  if not p_ok and length(coalesce(trim(p_note),'')) = 0 then
    raise exception 'Add a note telling the customer why (e.g. wrong amount, unclear slip).' using errcode='check_violation';
  end if;
  if p_ok and (v_state <> 'final' or coalesce(trim(v_erp),'') = '' or coalesce(trim(v_bir),'') = '') then
    raise exception 'Record the FINAL ERP + BIR invoice before confirming this charge.' using errcode='check_violation';
  end if;
  update public.charges
     set payment_status = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else null end,
         payment_note = case when p_ok then null else trim(p_note) end
   where id = p_charge;
  perform public.log_charge_audit(p_charge, case when p_ok then 'payment_confirmed' else 'payment_rejected' end,
                                  case when p_ok then null else jsonb_build_object('note',trim(p_note)) end);
end;
$$;

-- Explicit reversal of a confirmed charge (owner/admin) — credit-note + audit, never a silent delete.
create or replace function public.reverse_charge(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner() or public.is_admin()) then raise exception 'Only an admin or the owner can reverse a charge.'; end if;
  if length(coalesce(trim(p_reason),'')) = 0 then raise exception 'A reversal reason is required.' using errcode='check_violation'; end if;
  update public.charges
     set payment_status = 'rejected', payment_note = 'REVERSED: ' || trim(p_reason)
   where id = p_charge and payment_status = 'confirmed';
  if not found then raise exception 'Only a confirmed charge can be reversed.'; end if;
  perform public.log_charge_audit(p_charge, 'reversed', jsonb_build_object('reason',trim(p_reason)));
end;
$$;

-- ---------- Payment Orders: bundle whole charges for one collection (N:1) ----------
create or replace function public.create_payment_order(p_consignee uuid, p_charge_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_cust uuid; n int;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to create a payment order.'; end if;
  if p_charge_ids is null or array_length(p_charge_ids,1) is null then raise exception 'Select at least one charge.'; end if;
  -- all charges must belong to ONE customer, be billed, unconfirmed, and not already bundled.
  select count(distinct j.customer_id), min(j.customer_id) into n, v_cust
    from public.charges c join public.job_orders j on j.id = c.job_order_id
   where c.id = any(p_charge_ids);
  if n <> 1 then raise exception 'All charges in a payment order must belong to the same customer.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c where c.id = any(p_charge_ids)
             and (c.bill_status <> 'billed' or c.payment_status = 'confirmed' or c.payment_order_id is not null)) then
    raise exception 'One or more charges can''t be bundled (already paid, unbilled, or in another payment order).' using errcode='check_violation';
  end if;
  insert into public.payment_orders (po_number, customer_id, consignee_id, created_by)
  values ('PO-' || lpad(nextval('payment_order_seq')::text, 6, '0'), v_cust, p_consignee, auth.uid())
  returning id into v_po;
  update public.charges set payment_order_id = v_po where id = any(p_charge_ids);
  return v_po;
end;
$$;

-- Confirm a payment order's collection — records the ONE collection OR and confirms
-- each bundled charge (each still gated on its own FINAL invoice).
create or replace function public.confirm_payment_order(p_po uuid, p_or_no text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to confirm collection.'; end if;
  if length(coalesce(trim(p_or_no),'')) = 0 then raise exception 'Enter the collection OR number.' using errcode='check_violation'; end if;
  -- every bundled charge must have its FINAL invoice first.
  if exists (select 1 from public.charges where payment_order_id = p_po
             and (invoice_state <> 'final' or coalesce(trim(erp_invoice_no),'')='' or coalesce(trim(bir_invoice_no),'')='')) then
    raise exception 'Every charge needs its FINAL ERP + BIR invoice before collection.' using errcode='check_violation';
  end if;
  update public.payment_orders set collection_or_no = upper(trim(p_or_no)), status = 'collected',
         payment_status = 'confirmed', payment_confirmed_at = now()
   where id = p_po and status in ('open','submitted');
  if not found then raise exception 'This payment order can''t be collected.'; end if;
  for c in select id from public.charges where payment_order_id = p_po and payment_status <> 'confirmed' loop
    update public.charges set payment_status = 'confirmed', payment_confirmed_at = now() where id = c.id;
    perform public.log_charge_audit(c.id, 'payment_confirmed', jsonb_build_object('payment_order', p_po, 'or_no', upper(trim(p_or_no))));
  end loop;
end;
$$;

-- ---------- lock execute to authenticated (definer functions) ----------
revoke all on function public.effective_rate(uuid, text)                  from public, anon;
revoke all on function public.log_charge_audit(uuid, text, jsonb)         from public, anon, authenticated;  -- internal only
revoke all on function public.add_charge(uuid, text, text, numeric, numeric, boolean) from public, anon;
revoke all on function public.approve_charge(uuid)                        from public, anon;
revoke all on function public.record_charge_invoice(uuid, text, text)     from public, anon;
revoke all on function public.submit_charge_payment(uuid, text)           from public, anon;
revoke all on function public.confirm_charge_payment(uuid, boolean, text) from public, anon;
revoke all on function public.reverse_charge(uuid, text)                  from public, anon;
revoke all on function public.create_payment_order(uuid, uuid[])          from public, anon;
revoke all on function public.confirm_payment_order(uuid, text)           from public, anon;
grant execute on function public.add_charge(uuid, text, text, numeric, numeric, boolean) to authenticated;
grant execute on function public.approve_charge(uuid)                     to authenticated;
grant execute on function public.record_charge_invoice(uuid, text, text)  to authenticated;
grant execute on function public.submit_charge_payment(uuid, text)        to authenticated;
grant execute on function public.confirm_charge_payment(uuid, boolean, text) to authenticated;
grant execute on function public.reverse_charge(uuid, text)               to authenticated;
grant execute on function public.create_payment_order(uuid, uuid[])       to authenticated;
grant execute on function public.confirm_payment_order(uuid, text)        to authenticated;

notify pgrst, 'reload schema';
