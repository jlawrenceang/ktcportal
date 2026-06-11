-- ============================================================
-- 0043 — gap fix G9: Service Invoice number validation (real formats
-- confirmed from the ERP on 2026-06-12).
--
-- The ERP (erp.ktcport.com, Frappe) carries THREE numbers per sales invoice:
--   * OR #            — 5-digit printed Official Receipt pad serial (cash;
--                       BIR-accredited series 50001–125000), e.g. 94303
--   * Billing Invoice — 6-digit printed pad serial (credit), e.g. 087865
--   * ID              — ERP control no.: OR-INV-######## (cash) or
--                       BI-INV-######## (credit), 8-digit zero-padded
--
-- record_service_invoice now accepts either an ERP control no. (normalized:
-- uppercase, dashes restored, digits zero-padded to 8) or a bare printed pad
-- serial (4–8 digits, kept as typed — leading zeros preserved); anything else
-- is rejected. A BI- prefix means billed on CREDIT, not cash-paid — the UI
-- shows BILLED instead of PAID for those (release gate is unchanged either
-- way: an invoice on file = released).
-- ============================================================

create or replace function public.record_service_invoice(p_id uuid, p_invoice_no text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v text := upper(regexp_replace(coalesce(p_invoice_no, ''), '\s', '', 'g'));
  m text[];
begin
  if not public.has_permission('record_invoice') then
    raise exception 'You don''t have permission to record invoices.';
  end if;
  if v = '' then
    raise exception 'Enter the Service Invoice number.' using errcode = 'check_violation';
  end if;

  -- ERP control no. — tolerant of missing dashes / leading zeros, then normalized.
  m := regexp_match(v, '^(OR|BI)-?INV-?0*(\d{1,8})$');
  if m is not null then
    v := m[1] || '-INV-' || lpad(m[2], 8, '0');
  elsif v !~ '^\d{4,8}$' then
    -- not a printed pad serial either (OR pad 5 digits, Billing pad 6; leading zeros kept)
    raise exception 'Invoice number not recognized — enter the ERP control no. (e.g. OR-INV-00135921 or BI-INV-00220871) or the printed OR / Billing Invoice pad serial (digits only).'
      using errcode = 'check_violation';
  end if;

  update public.job_orders
  set service_invoice_no = v,
      invoice_recorded_at = now()
  where id = p_id;
  if not found then raise exception 'Job order not found.'; end if;
end;
$$;
