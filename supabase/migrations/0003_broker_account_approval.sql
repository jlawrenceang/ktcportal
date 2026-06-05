-- ============================================================
-- 0003 — broker account approval (KYC) + owner failsafe role.
-- Run in the KTC Supabase project SQL Editor after 0002.
-- ============================================================

alter table public.brokers add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));
alter table public.brokers add column if not exists decided_at timestamptz;

-- Owner = top failsafe role. Implies admin everywhere; can only be set in SQL.
alter table public.brokers add column if not exists is_owner boolean not null default false;

-- is_admin() now treats owner as admin too.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_owner from public.brokers where user_id = auth.uid()), false)
$$;

-- approved-account check; owner/admin always pass (failsafe).
create or replace function public.broker_is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status = 'approved' or is_admin or is_owner from public.brokers where user_id = auth.uid()),
    false)
$$;

-- admins may update broker rows (approve accounts, promote admins)
drop policy if exists "admin updates brokers" on public.brokers;
create policy "admin updates brokers" on public.brokers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- guard: protect privileged fields from the app layer ----------
-- Rules:
--  * Trusted server context (SQL Editor / service role, no auth.uid()) may set anything
--    — this is how owner/admin are seeded.
--  * An OWNER can never be demoted or locked out via the app (failsafe).
--  * Non-admins can't change any protected field (no self-escalation).
--  * The is_owner flag can ONLY be changed from the server, never via the app.
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;  -- trusted server / SQL context
  end if;

  if old.is_owner then
    new.is_owner   := old.is_owner;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    new.is_owner   := old.is_owner;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  new.is_owner := old.is_owner;  -- owner grant/revoke is server-only
  return new;
end;
$$;

drop trigger if exists brokers_guard on public.brokers;
create trigger brokers_guard before update on public.brokers
  for each row execute function public.guard_broker_protected_fields();

-- ---------- only approved brokers may request accreditations / create job orders ----------
drop policy if exists "broker requests accreditation" on public.accreditations;
create policy "broker requests accreditation" on public.accreditations
  for insert to authenticated
  with check (broker_id = public.current_broker_id() and public.broker_is_approved());

drop policy if exists "broker creates own job orders" on public.job_orders;
create policy "broker creates own job orders" on public.job_orders
  for insert to authenticated
  with check (broker_id = public.current_broker_id() and public.broker_is_approved());

drop policy if exists "broker creates own jo lines" on public.job_order_lines;
create policy "broker creates own jo lines" on public.job_order_lines
  for insert to authenticated
  with check (
    public.broker_is_approved() and exists (
      select 1 from public.job_orders jo
      where jo.id = job_order_id and jo.broker_id = public.current_broker_id()));

-- ---------- admins/owner see ALL job orders + lines (full visibility) ----------
drop policy if exists "admin reads all job orders" on public.job_orders;
create policy "admin reads all job orders" on public.job_orders
  for select to authenticated using (public.is_admin());

drop policy if exists "admin reads all jo lines" on public.job_order_lines;
create policy "admin reads all jo lines" on public.job_order_lines
  for select to authenticated using (public.is_admin());
