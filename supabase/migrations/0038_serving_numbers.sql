-- ============================================================
-- 0038 — per-service-line SERVING numbers ("now serving"), decided 2026-06-11.
--
-- Separate from the permanent JO number. Grain: per JO, per service line
-- (xray / dea / oog). WEEKLY reset (Monday, Asia/Manila — current KTC
-- practice). Assigned when the JO enters the line (reaches 'submitted').
--
-- Rules (lifecycle doc §D):
--   * edit / respond-to-hold  → KEEPS its number (assign only if missing)
--   * cancel / reject         → number is VACATED (burned — never reused;
--                               everyone else keeps theirs)
--   * resubmit after reject   → BACK OF LINE (new number) by default;
--                               admin can RESTORE the original via RPC
--
-- Numbers are only ever written by SECURITY DEFINER functions (no client
-- INSERT/UPDATE policies). Customers read their own rows; staff read all via
-- the view_job_orders gate; the aggregate "now serving" board is a definer
-- function so customers see the line position without seeing other orders.
-- ============================================================

create table if not exists public.serving_numbers (
  id            uuid primary key default gen_random_uuid(),
  job_order_id  uuid not null references public.job_orders(id) on delete cascade,
  service_line  text not null check (service_line in ('xray','dea','oog','other')),
  week_start    date not null,
  serving_no    int  not null,
  assigned_at   timestamptz not null default now(),
  vacated_at    timestamptz,
  unique (service_line, week_start, serving_no)
);
-- one ACTIVE number per JO per line
create unique index if not exists serving_one_active
  on public.serving_numbers (job_order_id, service_line) where vacated_at is null;

alter table public.serving_numbers enable row level security;

drop policy if exists "read serving numbers" on public.serving_numbers;
create policy "read serving numbers" on public.serving_numbers
  for select to authenticated using (
    public.has_permission('view_job_orders')
    or exists (select 1 from public.job_orders jo
               where jo.id = job_order_id and jo.customer_id = public.current_broker_id())
  );

-- Which line a service belongs to (combined services queue at the X-ray line).
create or replace function public.service_line_of(p_service text)
returns text language sql immutable as $$
  select case
    when p_service ilike '%x-ray%' then 'xray'
    when p_service ilike '%dea%'   then 'dea'
    when p_service ilike '%oog%'   then 'oog'
    else 'other'
  end;
$$;

-- Monday of the current week, PH time (weekly reset boundary).
create or replace function public.serving_week()
returns date language sql stable as $$
  select (date_trunc('week', (now() at time zone 'Asia/Manila')))::date;
$$;

-- Assign numbers for every line this JO needs that lacks an ACTIVE one.
-- (Keeping an existing active number = the "edit keeps its number" rule.)
create or replace function public.assign_serving_numbers(p_jo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_week date := public.serving_week();
  v_line text;
  v_next int;
begin
  for v_line in
    select distinct public.service_line_of(service_request)
    from public.job_order_lines where job_order_id = p_jo
  loop
    if exists (select 1 from public.serving_numbers
               where job_order_id = p_jo and service_line = v_line and vacated_at is null) then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtext('serving:' || v_line || ':' || v_week::text));
    select coalesce(max(serving_no), 0) + 1 into v_next
      from public.serving_numbers
      where service_line = v_line and week_start = v_week;
    insert into public.serving_numbers (job_order_id, service_line, week_start, serving_no)
      values (p_jo, v_line, v_week, v_next);
  end loop;
end;
$$;

-- Status transitions drive the line: enter on submitted, vacate on cancel/reject.
create or replace function public.serving_numbers_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'submitted' then
      perform public.assign_serving_numbers(new.id);
    elsif new.status in ('cancelled','rejected') then
      update public.serving_numbers set vacated_at = now()
        where job_order_id = new.id and vacated_at is null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists job_orders_serving on public.job_orders;
create trigger job_orders_serving after update of status on public.job_orders
  for each row execute function public.serving_numbers_on_status();

-- Lines arrive AFTER the job_orders insert (frontend inserts the JO, then its
-- lines), so a fresh submitted order gets its numbers from this trigger.
-- Also covers an added line joining a NEW service line later (back of line).
create or replace function public.serving_numbers_on_line()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.job_orders where id = new.job_order_id;
  if v_status in ('submitted','processing','on_hold') then
    perform public.assign_serving_numbers(new.job_order_id);
  end if;
  return new;
end;
$$;
drop trigger if exists job_order_lines_serving on public.job_order_lines;
create trigger job_order_lines_serving after insert on public.job_order_lines
  for each row execute function public.serving_numbers_on_line();

-- Admin restores a resubmitted order's ORIGINAL number (same week only).
create or replace function public.restore_serving_number(p_jo uuid, p_line text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_week date := public.serving_week();
  v_old_id uuid;
begin
  if not public.has_permission('process_job_orders') then
    raise exception 'You don''t have permission to restore serving numbers.';
  end if;
  select id into v_old_id from public.serving_numbers
    where job_order_id = p_jo and service_line = p_line
      and week_start = v_week and vacated_at is not null
    order by serving_no asc limit 1;
  if v_old_id is null then
    raise exception 'No vacated number from this week to restore (weekly reset applies).';
  end if;
  -- burn the back-of-line number it got on resubmit, then revive the original
  update public.serving_numbers set vacated_at = now()
    where job_order_id = p_jo and service_line = p_line and vacated_at is null;
  update public.serving_numbers set vacated_at = null where id = v_old_id;
end;
$$;

-- "Now serving" board: per line this week — the lowest still-open active
-- number (= being served) and the highest issued (= end of the line).
create or replace function public.now_serving()
returns table (service_line text, now_serving int, last_issued int)
language sql stable security definer set search_path = public as $$
  select s.service_line,
         min(s.serving_no) filter (
           where s.vacated_at is null and jo.status in ('submitted','processing','on_hold')
         ) as now_serving,
         max(s.serving_no) as last_issued
  from public.serving_numbers s
  join public.job_orders jo on jo.id = s.job_order_id
  where s.week_start = public.serving_week()
  group by s.service_line;
$$;

revoke all on function public.assign_serving_numbers(uuid) from public, anon;
revoke all on function public.restore_serving_number(uuid, text) from public, anon;
revoke all on function public.now_serving() from public, anon;
grant execute on function public.restore_serving_number(uuid, text) to authenticated;
grant execute on function public.now_serving() to authenticated;

-- Backfill: open orders join their lines now, in filing order.
do $$
declare r record;
begin
  for r in select id from public.job_orders
           where status in ('submitted','processing','on_hold')
           order by created_at
  loop
    perform public.assign_serving_numbers(r.id);
  end loop;
end $$;
