-- ============================================================
-- 0130 — BIR OR number stored zero-padded to 6 digits (owner 2026-06-21)
--
-- The cashier types just the number; the system pads it. OR → 6 digits
-- (e.g. 1234 -> 001234); the ERP control no. already pads to 8 in
-- normalize_erp_invoice_no (OR-INV-00000000). UI prefixes "OR-INV-" and shows
-- a live padded preview; storage is normalized here so it's consistent
-- regardless of caller.
-- ============================================================

create or replace function public.record_release_or(p_id uuid, p_or text, p_invoice_no text)
returns void language plpgsql security definer set search_path = public as $$
declare v_si text; v_or text; v_num bigint; v_min numeric; v_max numeric;
begin
  if not (public.has_permission('review_payments') or public.has_permission('record_invoice')) then
    raise exception 'You don''t have permission to record the OR.';
  end if;

  v_or := regexp_replace(coalesce(p_or, ''), '\s', '', 'g');
  if v_or !~ '^[0-9]{1,6}$' or v_or::bigint = 0 then
    raise exception 'Enter a valid BIR OR number — up to 6 digits, non-zero.';
  end if;
  v_or := lpad(v_or, 6, '0');                               -- store padded: 1234 -> 001234

  v_si  := public.normalize_erp_invoice_no(p_invoice_no);   -- OR-INV-00000000 (cash), non-zero
  v_num := regexp_replace(v_si, '\D', '', 'g')::bigint;
  select value into v_min from public.pricing_settings where key = 'erp_series_min';
  select value into v_max from public.pricing_settings where key = 'erp_series_max';
  if v_min is not null and v_num < v_min then
    raise exception 'ERP control no. % is below the accredited series (min %).', v_si, v_min::bigint;
  end if;
  if v_max is not null and v_num > v_max then
    raise exception 'ERP control no. % is above the accredited series (max %).', v_si, v_max::bigint;
  end if;

  if exists (select 1 from public.release_supplements s
             where s.release_order_id = p_id and s.payment_status <> 'confirmed') then
    raise exception 'An additional charge is still unpaid — it must be settled before the OR.';
  end if;

  update public.release_orders
     set or_number           = v_or,
         service_invoice_no  = v_si,
         invoice_recorded_at = now(),
         released_at         = now(),
         status              = 'released'
   where id = p_id and status = 'paid';
  if not found then raise exception 'The OR can only be recorded on a paid release.'; end if;
end;
$$;
