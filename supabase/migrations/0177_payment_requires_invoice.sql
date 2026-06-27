-- 0177: ADR-0035 phase 7 — payment confirm requires the official invoice on file.
-- The cashier can no longer mark the BASE (X-ray) payment confirmed without the ERP
-- service invoice + BIR pad serial recorded — recording them IS the prerequisite to
-- confirm. To make that possible, the invoice can now be recorded on any live order
-- (not only a completed one). Nothing reads "paid" without an official invoice.

-- record_service_invoice: allow on any live order (was completed-only) so the cashier
-- can record it before confirming the payment (which then completes the order).
create or replace function public.record_service_invoice(p_id uuid, p_invoice_no text, p_pad_no text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := upper(regexp_replace(coalesce(p_invoice_no, ''), '\s', '', 'g'));
        pad text := regexp_replace(coalesce(p_pad_no, ''), '\s', '', 'g');
        m text[]; v_status text;
begin
  if not public.has_permission('record_invoice') then
    raise exception 'You don''t have permission to record invoices.';
  end if;
  select status into v_status from public.job_orders where id = p_id;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected','held') then
    raise exception 'An invoice can''t be recorded on a % order.', v_status using errcode = 'check_violation';
  end if;
  m := regexp_match(v, '^(OR|BI)-?INV-?0*(\d{1,8})$');
  if m is null or m[2]::bigint = 0 then
    raise exception 'ERP control no. not recognized — format OR-INV-00135921 (cash) or BI-INV-00220871 (credit), non-zero.'
      using errcode = 'check_violation';
  end if;
  v := m[1] || '-INV-' || lpad(m[2], 8, '0');
  if pad !~ '^\d{4,8}$' or pad::bigint = 0 then
    raise exception 'Invoice serial not recognized — enter the printed OR / Billing Invoice pad number, digits only, non-zero (e.g. 001323).'
      using errcode = 'check_violation';
  end if;
  update public.job_orders set service_invoice_no = v, invoice_pad_no = pad, invoice_recorded_at = now() where id = p_id;
end;
$$;

-- review_payment: the BASE payment can't be CONFIRMED until the ERP + BIR invoice are on
-- file (recording them is the prerequisite). RPS confirm is unchanged.
create or replace function public.review_payment(p_id uuid, p_confirm boolean, p_note text default null, p_kind text default 'base')
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_inv text; v_pad text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to review payments.';
  end if;
  if p_kind = 'rps' then
    select rps_payment_status into v_status from public.job_orders where id = p_id for update;
  else
    select payment_status, service_invoice_no, invoice_pad_no into v_status, v_inv, v_pad
      from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
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

notify pgrst, 'reload schema';
