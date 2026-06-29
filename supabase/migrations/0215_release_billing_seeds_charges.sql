-- ============================================================
-- 0215 — Release billing dual-writes into charges + charge RPCs go parent-aware
--        (ADR-0037 Phase A cutover · Stage 1.6b)
--
-- Builds on 0214 (charges.release_order_id + XOR parent). Two halves:
--
-- A) DUAL-WRITE: when staff set/add/void a release charge, mirror the release's flat
--    base `amount` + each `release_supplements` row into uniform `charges`
--    (charge_type='release', linked by release_order_id). Reuses the proven 0212/0213
--    re-seed pattern — rebuild the 'release' charges from the (still-authoritative)
--    release tables; money-safe (skip if a release charge has payment/invoice in
--    flight). Release amounts are flat staff-typed totals → vatable=false (the amount
--    IS the total; no VAT line added), preserving today's release figures.
--
-- B) PARENT-AWARE RPCs: confirm_charge_payment / create_payment_order /
--    confirm_payment_order joined job_orders with an INNER join, which excluded (or
--    errored on) release charges. They now LEFT JOIN both parents and derive
--    customer/status from job_orders OR release_orders — so a release charge can be
--    invoiced (ERP+BIR, owner-confirmed), bundled into a Payment Order, and collected
--    through the same gate as every other charge.
--
-- ADDITIVE / NON-BREAKING: the old release base/supplement payment path
-- (submit/confirm_release_payment, record_release_or) is untouched and still live;
-- release charges' OWN payment state stays 'unpaid' in the new system during Stage 1
-- (the old flow drives real payment) — they're reconciled at the Stage-2 flip
-- (pre-launch, disposable data). The release-UI switch + the BIR field on the release
-- desk + the old-column drops are Stage 2.
-- ============================================================

-- ---------- A) internal helper: (re)seed 'release' charges from the release tables ----------
create or replace function public.seed_release_billing(p_release uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r        record;
  v_amount numeric;
  v_charge uuid;
begin
  -- Money safety: leave billing as-is if any release charge has moved past pristine.
  if exists (
    select 1 from public.charges c
     where c.release_order_id = p_release and c.charge_type = 'release'
       and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)
  ) then
    return;
  end if;

  delete from public.charges where release_order_id = p_release and charge_type = 'release';

  -- base charge from release_orders.amount (flat staff-typed total)
  select amount into v_amount from public.release_orders where id = p_release;
  if v_amount is not null and v_amount > 0 then
    insert into public.charges (release_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
    values (p_release, 'release', 'Release / pull-out', 1, v_amount, v_amount, false, 'billed', auth.uid())
    returning id into v_charge;
    perform public.log_charge_audit(v_charge, 'created',
      jsonb_build_object('type','release','label','Release / pull-out','amount',v_amount,'auto',true));
  end if;

  -- one charge per additional release charge (supplement)
  for r in select label, amount from public.release_supplements where release_order_id = p_release loop
    insert into public.charges (release_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
    values (p_release, 'release', r.label, 1, r.amount, r.amount, false, 'billed', auth.uid())
    returning id into v_charge;
    perform public.log_charge_audit(v_charge, 'created',
      jsonb_build_object('type','release','label',r.label,'amount',r.amount,'auto',true));
  end loop;
end;
$$;
revoke all on function public.seed_release_billing(uuid) from public, anon, authenticated;  -- internal only (definer-called)

-- ---------- set_release_charges — 0188 VERBATIM + the seed ----------
drop function if exists public.set_release_charges(uuid, numeric, text);
create or replace function public.set_release_charges(
  p_id uuid, p_amount numeric, p_note text default null, p_bill_doc_path text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to set release charges.';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter a valid amount.'; end if;
  update public.release_orders
     set amount         = p_amount,
         charges_note   = nullif(trim(p_note), ''),
         charges_set_at = now(),
         status         = 'payable',
         bill_doc_path  = coalesce(nullif(p_bill_doc_path, ''), bill_doc_path)
   where id = p_id
     and (status = 'docs_verified'
          or (status = 'payable' and payment_status in ('unpaid', 'rejected')));
  if not found then
    raise exception 'Charges can be set on a verified release, or edited before it is paid.';
  end if;
  perform public.seed_release_billing(p_id);   -- 0215: mirror onto the charge layer
end;
$$;
revoke all on function public.set_release_charges(uuid, numeric, text, text) from public, anon;
grant execute on function public.set_release_charges(uuid, numeric, text, text) to authenticated;

-- ---------- add_release_charge — 0188 VERBATIM + the seed ----------
create or replace function public.add_release_charge(p_release uuid, p_label text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to add a release charge.';
  end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Describe the additional charge.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid amount.'; end if;
  select status into v_status from public.release_orders where id = p_release;
  if not found then raise exception 'Release not found.'; end if;
  if v_status not in ('payable', 'paid') then
    raise exception 'Additional charges can only be added once the base charge is set.';
  end if;
  insert into public.release_supplements (release_order_id, label, amount, created_by)
  values (p_release, trim(p_label), p_amount, auth.uid());
  perform public.seed_release_billing(p_release);   -- 0215: mirror onto the charge layer
end;
$$;
revoke all on function public.add_release_charge(uuid, text, numeric) from public, anon;
grant execute on function public.add_release_charge(uuid, text, numeric) to authenticated;

-- ---------- void_release_charge — 0188 VERBATIM + the seed (capture parent first) ----------
create or replace function public.void_release_charge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_release uuid;
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to remove a release charge.';
  end if;
  delete from public.release_supplements
   where id = p_id and payment_status in ('unpaid', 'rejected')
   returning release_order_id into v_release;
  if not found then
    raise exception 'Only an unpaid additional charge can be removed.';
  end if;
  perform public.seed_release_billing(v_release);   -- 0215: mirror onto the charge layer
end;
$$;
revoke all on function public.void_release_charge(uuid) from public, anon;
grant execute on function public.void_release_charge(uuid) to authenticated;

-- ============================================================
-- B) parent-aware charge RPCs (job order OR release)
-- ============================================================

-- create_payment_order — derive the customer from EITHER parent.
create or replace function public.create_payment_order(p_consignee uuid, p_charge_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_cust uuid; n int;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to create a payment order.'; end if;
  if p_charge_ids is null or array_length(p_charge_ids,1) is null then raise exception 'Select at least one charge.'; end if;
  -- all charges must belong to ONE customer (via job order OR release), be billed, unconfirmed, unbundled.
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
revoke all on function public.create_payment_order(uuid, uuid[]) from public, anon;
grant execute on function public.create_payment_order(uuid, uuid[]) to authenticated;

-- confirm_charge_payment — parent status from EITHER job order OR release.
create or replace function public.confirm_charge_payment(p_charge uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_state text; v_erp text; v_bir text; v_pay text; v_parentstatus text;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  select c.invoice_state, c.erp_invoice_no, c.bir_invoice_no, c.payment_status, coalesce(j.status, r.status)
    into v_state, v_erp, v_bir, v_pay, v_parentstatus
    from public.charges c
    left join public.job_orders j     on j.id = c.job_order_id
    left join public.release_orders r on r.id = c.release_order_id
   where c.id = p_charge for update of c;
  if not found then raise exception 'Charge not found.'; end if;
  if v_parentstatus in ('cancelled','rejected') then
    raise exception 'Can''t confirm a charge on a % order.', v_parentstatus using errcode='check_violation';
  end if;
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
revoke all on function public.confirm_charge_payment(uuid, boolean, text) from public, anon;
grant execute on function public.confirm_charge_payment(uuid, boolean, text) to authenticated;

-- confirm_payment_order — dead-parent check across BOTH parents.
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
  for c in select id from public.charges where payment_order_id = p_po and payment_status <> 'confirmed' loop
    update public.charges set payment_status = 'confirmed', payment_confirmed_at = now() where id = c.id;
    perform public.log_charge_audit(c.id, 'payment_confirmed', jsonb_build_object('payment_order', p_po, 'or_no', upper(trim(p_or_no))));
  end loop;
end;
$$;
revoke all on function public.confirm_payment_order(uuid, text) from public, anon;
grant execute on function public.confirm_payment_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';
