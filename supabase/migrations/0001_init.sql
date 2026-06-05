-- ============================================================
-- KTC Job Order system — initial schema
-- Run in your KTC-exclusive Supabase project: SQL Editor -> paste -> Run.
-- (gen_random_uuid() / pgcrypto is preinstalled on Supabase.)
-- ============================================================

-- ---------- consignees (master list; uploaded later) ----------
create table if not exists public.consignees (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- brokers (profile, 1:1 with an auth user) ----------
create table if not exists public.brokers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique not null references auth.users(id) on delete cascade,
  customer_id    text unique,
  company_name   text,
  email          text,
  contact_number text,
  is_admin       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------- accreditations (broker <-> consignee, approval flow) ----------
create table if not exists public.accreditations (
  id            uuid primary key default gen_random_uuid(),
  broker_id     uuid not null references public.brokers(id) on delete cascade,
  consignee_id  uuid not null references public.consignees(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  unique (broker_id, consignee_id)
);

-- ---------- job orders ----------
create sequence if not exists public.jo_number_seq;

create table if not exists public.job_orders (
  id            uuid primary key default gen_random_uuid(),
  jo_number     text unique not null
                  default ('X-' || lpad(nextval('public.jo_number_seq')::text, 6, '0')),
  broker_id     uuid not null references public.brokers(id) on delete cascade,
  consignee_id  uuid references public.consignees(id),
  entry_number  text,
  status        text not null default 'submitted'
                  check (status in ('submitted','processing','completed','cancelled')),
  created_at    timestamptz not null default now()
);

-- ---------- job order lines (the repeating container rows) ----------
create table if not exists public.job_order_lines (
  id             uuid primary key default gen_random_uuid(),
  job_order_id   uuid not null references public.job_orders(id) on delete cascade,
  container_number text not null,
  service_request  text not null,
  created_at     timestamptz not null default now()
);

-- ---------- helper: the calling user's broker id ----------
create or replace function public.current_broker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.brokers where user_id = auth.uid()
$$;

-- ---------- auto-create a broker profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.brokers (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security — each broker only ever sees their own data.
-- (Admin approval of accreditations is done by service role /
--  the dashboard for now; a broker cannot self-approve.)
-- ============================================================
alter table public.consignees       enable row level security;
alter table public.brokers          enable row level security;
alter table public.accreditations   enable row level security;
alter table public.job_orders       enable row level security;
alter table public.job_order_lines  enable row level security;

-- consignees: readable by any signed-in user; writes via service role only
drop policy if exists "consignees readable" on public.consignees;
create policy "consignees readable" on public.consignees
  for select to authenticated using (true);

-- brokers: read & update own profile
drop policy if exists "broker reads own profile" on public.brokers;
create policy "broker reads own profile" on public.brokers
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "broker updates own profile" on public.brokers;
create policy "broker updates own profile" on public.brokers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- accreditations: broker reads & requests own (approval is admin-only)
drop policy if exists "broker reads own accreditations" on public.accreditations;
create policy "broker reads own accreditations" on public.accreditations
  for select to authenticated using (broker_id = public.current_broker_id());
drop policy if exists "broker requests accreditation" on public.accreditations;
create policy "broker requests accreditation" on public.accreditations
  for insert to authenticated with check (broker_id = public.current_broker_id());

-- job orders: broker reads & creates own
drop policy if exists "broker reads own job orders" on public.job_orders;
create policy "broker reads own job orders" on public.job_orders
  for select to authenticated using (broker_id = public.current_broker_id());
drop policy if exists "broker creates own job orders" on public.job_orders;
create policy "broker creates own job orders" on public.job_orders
  for insert to authenticated with check (broker_id = public.current_broker_id());

-- job order lines: scoped through the parent job order's ownership
drop policy if exists "broker reads own jo lines" on public.job_order_lines;
create policy "broker reads own jo lines" on public.job_order_lines
  for select to authenticated using (
    exists (select 1 from public.job_orders jo
            where jo.id = job_order_id and jo.broker_id = public.current_broker_id()));
drop policy if exists "broker creates own jo lines" on public.job_order_lines;
create policy "broker creates own jo lines" on public.job_order_lines
  for insert to authenticated with check (
    exists (select 1 from public.job_orders jo
            where jo.id = job_order_id and jo.broker_id = public.current_broker_id()));
