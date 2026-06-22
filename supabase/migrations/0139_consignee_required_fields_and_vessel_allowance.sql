-- ============================================================
-- 0139 — (1) consignee request now REQUIRES business address + TIN/VAT;
--        (2) vessel schedule keeps a +1-day allowance after the last free day
--            before it drops out of the picker / becomes a past entry.
-- (CIS/broker session keeps the contiguous low numbers; fuel lane is 0150+.)
-- ============================================================

-- 1) request_consignee — address + TIN are now compulsory (2303 already was).
create or replace function public.request_consignee(
  p_name      text,
  p_address   text default null,
  p_tin       text default null,
  p_doc_2303  text default null,
  p_doc_2307  text default null
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
    insert into public.consignees (name, address, tin, doc_2303_path, doc_2307_path, status, requested_by, requested_at)
    values (trim(p_name), trim(p_address), trim(p_tin), trim(p_doc_2303),
            nullif(trim(coalesce(p_doc_2307, '')), ''), 'pending', v_cust, now())
    returning id, code into v_id, v_code;
  exception when unique_violation then
    raise exception 'A consignee with that name already exists — search for it in the list.'
      using errcode = 'check_violation';
  end;

  return json_build_object('id', v_id, 'code', v_code, 'name', trim(p_name));
end;
$$;
revoke all on function public.request_consignee(text, text, text, text, text) from public, anon;
grant execute on function public.request_consignee(text, text, text, text, text) to authenticated;

-- 2) vessel_schedule_v — a call stays "current" (shown in the picker) until ONE
--    day AFTER its last free day, then it becomes a past entry (is_current=false,
--    so excluded from the dropdown). Criteria, in one place:
--      • last_free_day = finish_discharging + shipping line's free_days_import
--      • is_current = not cancelled AND (no last_free_day yet OR last_free_day + 1 >= today)
create or replace view public.vessel_schedule_v with (security_invoker = true) as
select id, vessel_visit, vessel_name, voyage_number, shipping_line,
       actual_arrival, arrival_time, finish_discharging, discharge_time,
       departure, departure_time, berth, week, cancelled, remarks,
       created_at, updated_at, free_days_import, free_days_export, line_internal,
       last_free_day,
       (not cancelled and (last_free_day is null or last_free_day + 1 >= current_date)) as is_current
from (
  select v.id, v.vessel_visit, v.vessel_name, v.voyage_number, v.shipping_line,
         v.actual_arrival, v.arrival_time, v.finish_discharging, v.discharge_time,
         v.departure, v.departure_time, v.berth, v.week, v.cancelled, v.remarks,
         v.created_at, v.updated_at, sl.free_days_import, sl.free_days_export,
         coalesce(sl.internal, false) as line_internal,
         case when v.finish_discharging is not null and sl.free_days_import is not null
              then v.finish_discharging + sl.free_days_import else null::date end as last_free_day
  from public.vessel_schedule v
  left join public.shipping_lines sl on sl.name = v.shipping_line
) e;
