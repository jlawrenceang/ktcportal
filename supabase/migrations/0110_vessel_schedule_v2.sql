-- ============================================================
-- 0110 — vessel schedule v2: clock-times, departure, week, in-house line hiding
--
-- Reworks the schedule to match KTC's real "VESSEL MONITORING" sheet (one running
-- list): each event (arrival / last discharge / departure) is a date + a military
-- clock-time (e.g. 1653H), plus a weekly serial staff type in. Vessel Visit is no
-- longer entered — the sync + admin form DERIVE it from vessel_name + voyage (the
-- DB key Job Orders still link on).
--
-- Dates stay `date` (the calendar + last-free-day rely on it); each clock time is
-- a companion TEXT field ("1653H"), combined with the date for display in the app.
--
-- Also adds in-house line hiding: shipping_lines.internal => those vessels are
-- hidden from customers (enforced in the SELECT policy), still shown to staff.
-- Forward-only; all additions are nullable / defaulted so existing rows are safe.
-- ============================================================

-- 1) New schedule fields (actual_arrival / finish_discharging keep their date type).
alter table public.vessel_schedule add column if not exists arrival_time   text;  -- e.g. 1653H
alter table public.vessel_schedule add column if not exists discharge_time text;  -- time of last discharge
alter table public.vessel_schedule add column if not exists departure      date;
alter table public.vessel_schedule add column if not exists departure_time text;
alter table public.vessel_schedule add column if not exists week           int;   -- operational week no. (staff-entered)

-- 2) In-house flag on shipping lines.
alter table public.shipping_lines add column if not exists internal boolean not null default false;

-- 3) Seed the standard lines (idempotent). Free-days fall back to the table
--    default (5 import / 7 export) — admin tunes them in Settings. Gothong,
--    Philcement, New Asia are in-house => hidden from customers.
insert into public.shipping_lines (name, internal) values
  ('Maersk', false), ('Evergreen', false), ('SITC', false), ('MSC', false),
  ('CMA', false), ('MCC', false), ('Gothong', true), ('Philcement', true), ('New Asia', true)
on conflict (name) do update set internal = excluded.internal;

-- 4) Staff check for the read policy (a customer is anyone who is NOT staff).
create or replace function public.current_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customers c
    where c.user_id = auth.uid() and (c.is_admin or c.is_owner or c.staff_role is not null)
  );
$$;
revoke execute on function public.current_is_staff() from public, anon;
grant execute on function public.current_is_staff() to authenticated;

-- 5) Hide in-house-line vessels from customers; staff see all. The read view is
--    security_invoker, so this base-table policy applies to whoever queries it.
drop policy if exists "read vessel schedule" on public.vessel_schedule;
create policy "read vessel schedule" on public.vessel_schedule
  for select to authenticated using (
    public.current_is_staff()
    or shipping_line is null
    or shipping_line not in (select name from public.shipping_lines where internal)
  );

-- 6) Read view: expose departure, the clock-times, week, and the line's internal
--    flag. last_free_day is unchanged (finish_discharging + the line's import
--    free-days); is_current follows it. DROP first — the column set is reordered,
--    which CREATE OR REPLACE VIEW can't do in place. Nothing in the DB depends on
--    this view (it's a client read model), so the drop is safe.
drop view if exists public.vessel_schedule_v;
create view public.vessel_schedule_v
with (security_invoker = true) as
select
  e.*,
  (not e.cancelled and (e.last_free_day is null or e.last_free_day >= current_date)) as is_current
from (
  select
    v.id, v.vessel_visit, v.vessel_name, v.voyage_number, v.shipping_line,
    v.actual_arrival, v.arrival_time, v.finish_discharging, v.discharge_time,
    v.departure, v.departure_time, v.berth, v.week, v.cancelled, v.remarks,
    v.created_at, v.updated_at,
    sl.free_days_import, sl.free_days_export, coalesce(sl.internal, false) as line_internal,
    case
      when v.finish_discharging is not null and sl.free_days_import is not null
      then v.finish_discharging + sl.free_days_import
    end as last_free_day
  from public.vessel_schedule v
  left join public.shipping_lines sl on sl.name = v.shipping_line
) e;
grant select on public.vessel_schedule_v to authenticated;
