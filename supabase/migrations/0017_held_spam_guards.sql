-- ============================================================
-- 0017 — anti-spam guards for held job orders (ADR-0012).
--
-- (1) Cap: a pending broker may keep at most 10 orders on hold.
-- (2) Defer the official jo_number until release: held orders carry NO
--     official X-###### number; they only get one when promoted to a live
--     status (submitted) on approval — so spam/cancelled holds never burn
--     or gap the official sequence.
-- (3) When a broker is rejected/suspended, cancel their held orders.
-- ============================================================

-- ---- (2) Defer jo_number ----------------------------------------------------
-- Drop the auto-assigning default + NOT NULL so 'held' rows can have a null
-- number (UNIQUE permits multiple NULLs). A trigger assigns the official number
-- only for live statuses.
alter table public.job_orders alter column jo_number drop default;
alter table public.job_orders alter column jo_number drop not null;

create or replace function public.ensure_jo_number()
returns trigger language plpgsql as $$
begin
  -- Assign an official number the first time an order reaches a live status.
  -- 'held' and 'cancelled' never get one.
  if new.jo_number is null and new.status in ('submitted','processing','completed') then
    new.jo_number := 'X-' || lpad(nextval('public.jo_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists job_orders_assign_number on public.job_orders;
create trigger job_orders_assign_number before insert or update on public.job_orders
  for each row execute function public.ensure_jo_number();

-- ---- (1) Held cap -----------------------------------------------------------
create or replace function public.enforce_held_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if new.status = 'held' then
    select count(*) into cnt from public.job_orders
      where broker_id = new.broker_id and status = 'held';
    if cnt >= 10 then
      raise exception 'You can keep at most 10 job orders on hold until your account is verified. Upload your valid ID to get verified.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists job_orders_held_cap on public.job_orders;
create trigger job_orders_held_cap before insert on public.job_orders
  for each row execute function public.enforce_held_cap();

-- ---- (3) On approval release held orders; on reject/suspend cancel them ------
create or replace function public.release_held_job_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'approved' then
      update public.job_orders set status = 'submitted'
        where broker_id = new.id and status = 'held';
    elsif new.status in ('rejected','suspended') then
      update public.job_orders set status = 'cancelled'
        where broker_id = new.id and status = 'held';
    end if;
  end if;
  return new;
end;
$$;
-- trigger on_broker_approved_release (from 0016) already calls this function.
