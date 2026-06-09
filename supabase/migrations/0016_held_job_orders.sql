-- ============================================================
-- 0016 — file-then-hold-then-release for pending brokers.
--
-- A broker who has confirmed their email but is not yet admin-approved
-- (status 'pending') can fully fill and SUBMIT a job order — so they never
-- hit a dead Submit button — but the order is saved as status 'held':
-- invisible to the admin processing queue. When an admin approves the
-- broker, all their held orders are released to 'submitted' automatically.
--
-- Approved brokers are unchanged (orders go straight to 'submitted').
-- Rejected / suspended brokers can file nothing. See ADR-0012.
-- ============================================================

-- 1) Allow the 'held' status on job orders.
alter table public.job_orders drop constraint if exists job_orders_status_check;
alter table public.job_orders add constraint job_orders_status_check
  check (status in ('held','submitted','processing','completed','cancelled'));

-- 2) Helper: is the calling user's broker row in 'pending'?
create or replace function public.broker_is_pending()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status = 'pending' from public.brokers where user_id = auth.uid()),
    false)
$$;

-- 3) Insert policy: approved brokers file normally; pending brokers may file
--    ONLY as 'held'. (Rejected/suspended satisfy neither branch → denied.)
drop policy if exists "broker creates own job orders" on public.job_orders;
create policy "broker creates own job orders" on public.job_orders
  for insert to authenticated
  with check (
    broker_id = public.current_broker_id()
    and (
      public.broker_is_approved()
      or (status = 'held' and public.broker_is_pending())
    )
  );

-- 4) Lines: a broker may add lines to any job order they own (held or not).
--    The parent's own insert policy already enforced the held/approved gate.
drop policy if exists "broker creates own jo lines" on public.job_order_lines;
create policy "broker creates own jo lines" on public.job_order_lines
  for insert to authenticated
  with check (
    exists (
      select 1 from public.job_orders jo
      where jo.id = job_order_id and jo.broker_id = public.current_broker_id()
    )
  );

-- 5) Release held orders into the queue when the broker is approved.
create or replace function public.release_held_job_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.job_orders
      set status = 'submitted'
      where broker_id = new.id and status = 'held';
  end if;
  return new;
end;
$$;

drop trigger if exists on_broker_approved_release on public.brokers;
create trigger on_broker_approved_release after update of status on public.brokers
  for each row execute function public.release_held_job_orders();
