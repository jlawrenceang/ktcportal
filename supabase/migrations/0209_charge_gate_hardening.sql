-- ============================================================
-- 0209 — Charge-gate hardening (folds the 0206 money-core verification findings)
--        (owner 2026-06-29)
--
-- Jarvis verify of 0202–0206 confirmed the invoice gate is airtight, and flagged:
--   F1 (Should-fix) — add_charge accepted p_unit_rate for EVERY type, so staff could
--      bill an inflated base/RPS charge at any price with no approval. → ad-hoc pricing
--      is now allowed ONLY for 'addon' (which is maker-checker); service/rps use the spine.
--   F2 (Should-fix) — no charge RPC checked the parent JO status, so money could be
--      confirmed against a cancelled/rejected order. → guarded at add + both confirms.
--   N1 (nit) — maker-checker skipped a null creator. → null creator is now un-approvable.
--   N2 (nit) — reversal reused 'rejected', so a reversed charge could be re-submitted &
--      re-confirmed. → new terminal 'reversed' state; re-submission blocked.
-- All create-or-replace + one CHECK widen. Additive/idempotent.
-- ============================================================

-- N2: a distinct terminal state for reversal (can't be re-submitted).
alter table public.charges drop constraint if exists charges_payment_status_check;
alter table public.charges add constraint charges_payment_status_check
  check (payment_status in ('unpaid','submitted','confirmed','rejected','reversed'));

-- F1 + F2: ad-hoc rate only for add-ons; block charges on a dead JO.
create or replace function public.add_charge(
  p_jo uuid, p_type text, p_label text, p_qty numeric default 1, p_unit_rate numeric default null, p_vatable boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_consignee uuid; v_status text; v_rate numeric; v_amount numeric; v_bill text;
begin
  if not (public.is_admin() or public.has_permission('accept_orders') or public.has_permission('complete_orders')) then
    raise exception 'You don''t have permission to add charges.';
  end if;
  if p_type not in ('service','rps','addon') then raise exception 'Unknown charge type.'; end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'A charge label is required.' using errcode='check_violation'; end if;
  if length(p_label) > 120 then raise exception 'Charge label is too long.' using errcode='check_violation'; end if;
  if coalesce(p_qty,0) <= 0 or p_qty > 100000 then raise exception 'Enter a valid quantity.' using errcode='check_violation'; end if;
  select consignee_id, status into v_consignee, v_status from public.job_orders where id = p_jo;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected') then
    raise exception 'Can''t add a charge to a % job order.', v_status using errcode='check_violation';
  end if;
  -- F1: only an add-on may carry an ad-hoc price (and add-ons are maker-checker).
  -- service/rps ALWAYS price off the spine (override → service_rates → move_rates).
  v_rate := case when p_type = 'addon' then coalesce(p_unit_rate, public.effective_rate(v_consignee, p_label))
                 else public.effective_rate(v_consignee, p_label) end;
  v_amount := case when v_rate is null then null else round(v_rate * p_qty, 2) end;
  v_bill := case when p_type = 'addon' then 'proposed' else 'billed' end;
  insert into public.charges (job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
  values (p_jo, p_type, trim(p_label), p_qty, v_rate, v_amount, coalesce(p_vatable,true), v_bill, auth.uid())
  returning id into v_id;
  perform public.log_charge_audit(v_id, 'created', jsonb_build_object('type',p_type,'label',trim(p_label),'qty',p_qty,'amount',v_amount,'bill_status',v_bill));
  return v_id;
end;
$$;

-- N1: a charge with no recorded creator can't be approved (no genuine maker).
create or replace function public.approve_charge(p_charge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  if not (public.is_admin() or public.has_permission('complete_orders') or public.has_permission('hold_reject_orders')) then
    raise exception 'You don''t have permission to approve charges.';
  end if;
  select created_by into v_creator from public.charges where id = p_charge and bill_status = 'proposed' for update;
  if not found then raise exception 'No proposed charge to approve.'; end if;
  if v_creator is null or v_creator = auth.uid() then
    raise exception 'A charge must be approved by someone other than who created it.' using errcode='check_violation';
  end if;
  update public.charges set bill_status = 'billed', approved_by = auth.uid(), approved_at = now() where id = p_charge;
  perform public.log_charge_audit(p_charge, 'approved', null);
end;
$$;

-- F2: the gate also refuses to confirm against a dead parent JO.
create or replace function public.confirm_charge_payment(p_charge uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_state text; v_erp text; v_bir text; v_pay text; v_jostatus text;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  select c.invoice_state, c.erp_invoice_no, c.bir_invoice_no, c.payment_status, j.status
    into v_state, v_erp, v_bir, v_pay, v_jostatus
    from public.charges c join public.job_orders j on j.id = c.job_order_id
   where c.id = p_charge for update of c;
  if not found then raise exception 'Charge not found.'; end if;
  if v_jostatus in ('cancelled','rejected') then
    raise exception 'Can''t confirm a charge on a % job order.', v_jostatus using errcode='check_violation';
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

-- F2: the bundled path also refuses a charge whose JO is dead.
create or replace function public.confirm_payment_order(p_po uuid, p_or_no text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to confirm collection.'; end if;
  if length(coalesce(trim(p_or_no),'')) = 0 then raise exception 'Enter the collection OR number.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c join public.job_orders j on j.id = c.job_order_id
             where c.payment_order_id = p_po and j.status in ('cancelled','rejected')) then
    raise exception 'A bundled charge belongs to a cancelled or rejected job order.' using errcode='check_violation';
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

-- N2: reversal lands in the terminal 'reversed' state (can't be re-submitted/re-confirmed).
create or replace function public.reverse_charge(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner() or public.is_admin()) then raise exception 'Only an admin or the owner can reverse a charge.'; end if;
  if length(coalesce(trim(p_reason),'')) = 0 then raise exception 'A reversal reason is required.' using errcode='check_violation'; end if;
  update public.charges
     set payment_status = 'reversed', payment_note = 'REVERSED: ' || trim(p_reason)
   where id = p_charge and payment_status = 'confirmed';
  if not found then raise exception 'Only a confirmed charge can be reversed.'; end if;
  perform public.log_charge_audit(p_charge, 'reversed', jsonb_build_object('reason',trim(p_reason)));
end;
$$;

notify pgrst, 'reload schema';
