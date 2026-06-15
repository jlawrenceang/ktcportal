-- ============================================================
-- 0068 — pending-vessel requests (owner, 2026-06-15)
--
-- When a customer (or admin filing on behalf) files a Job Order against a
-- vessel that isn't on the schedule yet, they tick "not listed" and type the
-- name + voyage. Until now that was just free text on the JO with no follow-up.
--
-- This adds a review workflow: every unlisted-vessel JO raises a PENDING
-- vessel_request (deduped per vessel+voyage). Operations review it on the
-- Vessel Schedule page — APPROVE links it to a scheduled call (every waiting
-- JO gets the canonical vessel_visit/name/voyage), or REJECT with a note.
--
-- Vessel identifiers are stored UPPERCASE (the JO form now uppercases them), so
-- matching waiting JOs to a request is a plain uppercase compare.
-- ============================================================

create table if not exists public.vessel_requests (
  id            uuid primary key default gen_random_uuid(),
  vessel_name   text not null,
  voyage_number text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  vessel_visit  text,          -- the scheduled call it was linked to (on approve)
  note          text,          -- ops note (esp. on reject)
  requested_by  uuid references public.customers(id),  -- first requester (info only)
  reviewed_by   uuid references public.customers(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- One OPEN request per vessel+voyage; a later re-file after reject can open a new one.
create unique index if not exists vessel_requests_one_pending
  on public.vessel_requests (vessel_name, voyage_number) where status = 'pending';

alter table public.vessel_requests enable row level security;
-- Server-only table: reached through the SECURITY DEFINER trigger/RPCs below
-- (mirrors active_sessions / serving_numbers). No client policies.
revoke all on table public.vessel_requests from public, anon, authenticated;

-- ---- auto-raise a pending request whenever a JO is filed unlisted ----
create or replace function public.request_vessel_on_unlisted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vessel_visit is null and coalesce(trim(new.vessel_name), '') <> '' then
    insert into public.vessel_requests (vessel_name, voyage_number, requested_by)
    values (
      upper(trim(new.vessel_name)),
      upper(trim(coalesce(new.voyage_number, ''))),
      new.customer_id
    )
    on conflict (vessel_name, voyage_number) where status = 'pending' do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists job_orders_request_vessel on public.job_orders;
create trigger job_orders_request_vessel after insert on public.job_orders
  for each row execute function public.request_vessel_on_unlisted();

-- ---- staff: list pending requests with a live "waiting JO" count ----
-- SECURITY DEFINER so the count sees every matching JO regardless of the
-- reviewer's own job-order RLS; gated to schedule managers via has_permission.
create or replace function public.pending_vessel_requests()
returns table (id uuid, vessel_name text, voyage_number text, waiting_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.vessel_name, r.voyage_number,
    (select count(*) from public.job_orders jo
       where jo.vessel_visit is null
         and upper(trim(jo.vessel_name)) = r.vessel_name
         and upper(trim(coalesce(jo.voyage_number, ''))) = r.voyage_number) as waiting_count,
    r.created_at
  from public.vessel_requests r
  where r.status = 'pending'
    and public.has_permission('manage_vessel_schedule')
  order by r.created_at;
$$;
revoke all on function public.pending_vessel_requests() from public, anon;
grant execute on function public.pending_vessel_requests() to authenticated;

-- ---- staff: approve (link) or reject a request ----
create or replace function public.review_vessel_request(
  p_id uuid, p_action text, p_vessel_visit text default null, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req    public.vessel_requests%rowtype;
  v_name   text;
  v_voyage text;
begin
  if not public.has_permission('manage_vessel_schedule') then
    raise exception 'You don''t have permission to review vessel requests.';
  end if;
  select * into v_req from public.vessel_requests where id = p_id;
  if v_req.id is null then raise exception 'Vessel request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This request was already reviewed.'; end if;

  if p_action = 'approve' then
    if coalesce(trim(p_vessel_visit), '') = '' then
      raise exception 'Pick the scheduled call to link this to (add it to the schedule first if needed).';
    end if;
    select vessel_name, voyage_number into v_name, v_voyage
      from public.vessel_schedule where vessel_visit = trim(p_vessel_visit);
    if v_name is null then
      raise exception 'That Vessel Visit isn''t in the schedule — add the call above first, then approve.';
    end if;
    update public.vessel_requests
       set status = 'approved', vessel_visit = trim(p_vessel_visit),
           reviewed_by = public.current_broker_id(), reviewed_at = now(), note = p_note
     where id = p_id;
    -- Link every waiting JO to the call, adopting its canonical name/voyage.
    update public.job_orders jo
       set vessel_visit = trim(p_vessel_visit), vessel_name = v_name, voyage_number = v_voyage
     where jo.vessel_visit is null
       and upper(trim(jo.vessel_name)) = v_req.vessel_name
       and upper(trim(coalesce(jo.voyage_number, ''))) = v_req.voyage_number;

  elsif p_action = 'reject' then
    update public.vessel_requests
       set status = 'rejected', reviewed_by = public.current_broker_id(),
           reviewed_at = now(), note = p_note
     where id = p_id;
  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;
revoke all on function public.review_vessel_request(uuid, text, text, text) from public, anon;
grant execute on function public.review_vessel_request(uuid, text, text, text) to authenticated;

-- ---- backfill: open requests for existing unlisted-vessel JOs ----
insert into public.vessel_requests (vessel_name, voyage_number, requested_by)
select distinct on (upper(trim(vessel_name)), upper(trim(coalesce(voyage_number, ''))))
       upper(trim(vessel_name)), upper(trim(coalesce(voyage_number, ''))), customer_id
from public.job_orders
where vessel_visit is null and coalesce(trim(vessel_name), '') <> ''
order by upper(trim(vessel_name)), upper(trim(coalesce(voyage_number, ''))), created_at
on conflict (vessel_name, voyage_number) where status = 'pending' do nothing;
