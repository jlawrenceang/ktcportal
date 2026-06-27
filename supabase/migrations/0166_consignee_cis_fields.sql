-- 0166: full Customer Information Sheet capture online.
-- Adds the consignee columns the CIS template (public/customer-info-sheet.html)
-- auto-fills — registered/customer name, 2nd address line, tel, mobile, email —
-- and extends request_consignee to store them. These are all OPTIONAL; the
-- required minimum stays name + business address + TIN/VAT + BIR 2303 (from 0139).
alter table public.consignees
  add column if not exists customer_name text,
  add column if not exists address2      text,
  add column if not exists tel           text,
  add column if not exists mobile        text,
  add column if not exists email         text;

-- Replace the 5-arg request_consignee with a 10-arg version. The old overload
-- MUST be dropped first, else a 5-positional call is ambiguous between the two.
drop function if exists public.request_consignee(text, text, text, text, text);

create or replace function public.request_consignee(
  p_name          text,
  p_address       text default null,
  p_tin           text default null,
  p_doc_2303      text default null,
  p_doc_2307      text default null,
  p_customer_name text default null,
  p_address2      text default null,
  p_tel           text default null,
  p_mobile        text default null,
  p_email         text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid := public.current_broker_id();
  v_id   uuid;
  v_code text;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not (public.broker_is_approved() or public.broker_is_pending()) then
    raise exception 'Your account can''t request consignees right now.';
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
    raise exception 'A consignee with that name already exists — search for it in the list.'
      using errcode = 'check_violation';
  end;

  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;
revoke all on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_consignee(text, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
