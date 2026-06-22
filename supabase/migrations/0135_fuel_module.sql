-- 0135_fuel_module.sql  (renamed from 0133 to resolve a concurrent-work number clash with 0133_customer_info_sheet)
-- Fuel monitoring module — Phase 0 foundations (ADR-0025).
-- Derived variance over two append-only ledgers (dispense = OUT, delivery = IN)
-- plus a shared equipment master and an interim move_tally (until the Pillar-2
-- move logger lands). Rates/prices are EFFECTIVE-DATED so history is preserved
-- and past periods are never re-priced. All reports are views.
-- Backend-enforced: read = view_fuel_reports, write = manage_fuel, dispense = log_fuel.

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- Shared equipment master (also the start of the Pillar-2 equipment spine).
create table if not exists public.equipment (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  name             text not null,
  equip_class      text not null,
  activity_driver  text,                          -- moves | run-hours | km | trips
  est_lpm_override numeric(10,3),                  -- optional per-machine liters/move
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Effective-dated global settings: diesel_price, density, ewt_rate, vat_rate.
create table if not exists public.fuel_settings (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,                    -- diesel_price | density | ewt_rate | vat_rate
  value          numeric(14,4) not null,
  effective_from date not null default current_date,
  note           text,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  unique (key, effective_from)
);

-- Effective-dated estimate rate (liters per move) by class, optional per-machine override.
create table if not exists public.fuel_rates (
  id              uuid primary key default gen_random_uuid(),
  equip_class     text not null,
  equipment_id    uuid references public.equipment(id) on delete cascade,
  liters_per_move numeric(10,3) not null,
  effective_from  date not null default current_date,
  updated_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists fuel_rates_lookup_idx on public.fuel_rates (equip_class, effective_from);

-- Deliveries (fuel IN). net_kg + gross_amount are generated; vat/ewt/liters-by-weight
-- depend on effective-dated settings, so they live in the fuel_delivery_payable view.
create table if not exists public.fuel_delivery (
  id            uuid primary key default gen_random_uuid(),
  supplier      text,
  po_no         text,
  invoice_no    text,
  invoice_date  date,
  liters_billed numeric(14,3),
  rate          numeric(12,4),                     -- PHP / liter (actual purchase price)
  gross_kg      numeric(14,3),
  tare_kg       numeric(14,3),
  received_at   timestamptz not null default now(),
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  net_kg       numeric(14,3) generated always as (coalesce(gross_kg,0) - coalesce(tare_kg,0)) stored,
  gross_amount numeric(16,4) generated always as (coalesce(liters_billed,0) * coalesce(rate,0)) stored
);
create index if not exists fuel_delivery_received_idx on public.fuel_delivery (received_at);

-- Dispenses (fuel OUT). One row per fuel issue. id may be client-generated (offline-safe).
create table if not exists public.fuel_dispense (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id),
  liters       numeric(12,3) not null check (liters > 0),
  occurred_at  timestamptz not null default now(),
  odometer     numeric(14,2),
  run_hours    numeric(12,2),
  operator     text,
  source       text not null default 'tank' check (source in ('tank','direct')),
  delivery_id  uuid references public.fuel_delivery(id) on delete set null,
  device_id    text,
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists fuel_dispense_equip_idx on public.fuel_dispense (equipment_id);
create index if not exists fuel_dispense_occurred_idx on public.fuel_dispense (occurred_at);

-- Tank dipstick readings (physical count) for inventory reconciliation.
create table if not exists public.fuel_tank_reading (
  id         uuid primary key default gen_random_uuid(),
  tank       text not null default 'main',
  read_on    date not null,
  liters     numeric(14,3) not null,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tank, read_on)
);

-- Interim move source for the ESTIMATE, until the Pillar-2 live move logger lands.
create table if not exists public.move_tally (
  id          uuid primary key default gen_random_uuid(),
  period      date not null,                       -- month start (yyyy-mm-01)
  equip_class text not null,
  moves       numeric(14,2) not null,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (period, equip_class)
);

-- =====================================================================
-- 2. HELPER FUNCTIONS (effective-dated lookups)
-- =====================================================================

create or replace function public.fuel_setting_at(p_key text, p_on date)
returns numeric language sql stable security definer set search_path = public as $$
  select value from public.fuel_settings
  where key = p_key and effective_from <= p_on
  order by effective_from desc limit 1
$$;

create or replace function public.fuel_rate_at(p_class text, p_equipment_id uuid, p_on date)
returns numeric language sql stable security definer set search_path = public as $$
  select liters_per_move from public.fuel_rates
  where effective_from <= p_on
    and ( (p_equipment_id is not null and equipment_id = p_equipment_id)
          or (equipment_id is null and equip_class = p_class) )
  order by (equipment_id is not null) desc, effective_from desc
  limit 1
$$;

-- =====================================================================
-- 3. RLS  (read = view_fuel_reports/admin; write = manage_fuel/admin; dispense = log_fuel)
-- =====================================================================

alter table public.equipment        enable row level security;
alter table public.fuel_settings     enable row level security;
alter table public.fuel_rates        enable row level security;
alter table public.fuel_delivery     enable row level security;
alter table public.fuel_dispense     enable row level security;
alter table public.fuel_tank_reading enable row level security;
alter table public.move_tally        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['equipment','fuel_settings','fuel_rates','fuel_delivery',
                           'fuel_dispense','fuel_tank_reading','move_tally']
  loop
    execute format('drop policy if exists "fuel read %1$s" on public.%1$s', t);
    execute format($f$create policy "fuel read %1$s" on public.%1$s
      for select to authenticated
      using (public.has_permission('view_fuel_reports') or public.is_admin())$f$, t);

    execute format('drop policy if exists "fuel manage %1$s" on public.%1$s', t);
    execute format($f$create policy "fuel manage %1$s" on public.%1$s
      for all to authenticated
      using (public.has_permission('manage_fuel') or public.is_admin())
      with check (public.has_permission('manage_fuel') or public.is_admin())$f$, t);
  end loop;
end $$;

-- Pump operators may INSERT a dispense with only the log_fuel gate.
drop policy if exists "fuel log dispense" on public.fuel_dispense;
create policy "fuel log dispense" on public.fuel_dispense
  for insert to authenticated
  with check (public.has_permission('log_fuel')
              or public.has_permission('manage_fuel')
              or public.is_admin());

grant select, insert, update, delete on
  public.equipment, public.fuel_settings, public.fuel_rates, public.fuel_delivery,
  public.fuel_dispense, public.fuel_tank_reading, public.move_tally
  to authenticated;

-- =====================================================================
-- 4. AUDIT  (config changes → security_events, owner-readable)
-- =====================================================================

create or replace function public.audit_fuel_config()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_security_event('fuel_config_changed', null,
    jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', to_jsonb(new)));
  return new;
end $$;
revoke all on function public.audit_fuel_config() from public, anon, authenticated;

drop trigger if exists trg_audit_fuel_settings on public.fuel_settings;
create trigger trg_audit_fuel_settings after insert or update on public.fuel_settings
  for each row execute function public.audit_fuel_config();
drop trigger if exists trg_audit_fuel_rates on public.fuel_rates;
create trigger trg_audit_fuel_rates after insert or update on public.fuel_rates
  for each row execute function public.audit_fuel_config();

-- =====================================================================
-- 5. DERIVED VIEWS  (security_invoker → underlying RLS applies)
-- =====================================================================

create or replace view public.fuel_actual_monthly with (security_invoker = true) as
  select date_trunc('month', fd.occurred_at)::date as period,
         e.id as equipment_id, e.code, e.name, e.equip_class,
         sum(fd.liters) as liters
  from public.fuel_dispense fd
  join public.equipment e on e.id = fd.equipment_id
  group by 1,2,3,4,5;

create or replace view public.fuel_actual_by_class_monthly with (security_invoker = true) as
  select date_trunc('month', fd.occurred_at)::date as period,
         e.equip_class, sum(fd.liters) as actual_l
  from public.fuel_dispense fd
  join public.equipment e on e.id = fd.equipment_id
  group by 1,2;

create or replace view public.fuel_estimated_by_class_monthly with (security_invoker = true) as
  select mt.period, mt.equip_class, mt.moves,
         public.fuel_rate_at(mt.equip_class, null, mt.period) as liters_per_move,
         mt.moves * coalesce(public.fuel_rate_at(mt.equip_class, null, mt.period), 0) as estimated_l
  from public.move_tally mt;

create or replace view public.fuel_variance_monthly with (security_invoker = true) as
  select coalesce(e.period, a.period)           as period,
         coalesce(e.equip_class, a.equip_class) as equip_class,
         coalesce(e.estimated_l, 0)             as estimated_l,
         coalesce(a.actual_l, 0)                as actual_l,
         coalesce(a.actual_l,0) - coalesce(e.estimated_l,0) as variance_l,
         public.fuel_setting_at('diesel_price', coalesce(e.period, a.period)) as diesel_price,
         (coalesce(a.actual_l,0) - coalesce(e.estimated_l,0))
           * coalesce(public.fuel_setting_at('diesel_price', coalesce(e.period, a.period)), 0) as variance_php
  from public.fuel_estimated_by_class_monthly e
  full join public.fuel_actual_by_class_monthly a
    on a.period = e.period and a.equip_class = e.equip_class;

create or replace view public.fuel_delivery_payable with (security_invoker = true) as
  select fd.*,
         fd.net_kg / nullif(public.fuel_setting_at('density', coalesce(fd.invoice_date, fd.received_at::date)), 0) as liters_by_weight,
         fd.gross_amount / (1 + coalesce(public.fuel_setting_at('vat_rate', coalesce(fd.invoice_date, fd.received_at::date)), 0)) as vat_base,
         -1 * (fd.gross_amount / (1 + coalesce(public.fuel_setting_at('vat_rate', coalesce(fd.invoice_date, fd.received_at::date)), 0)))
            * coalesce(public.fuel_setting_at('ewt_rate', coalesce(fd.invoice_date, fd.received_at::date)), 0) as ewt,
         fd.gross_amount
           - (fd.gross_amount / (1 + coalesce(public.fuel_setting_at('vat_rate', coalesce(fd.invoice_date, fd.received_at::date)), 0)))
             * coalesce(public.fuel_setting_at('ewt_rate', coalesce(fd.invoice_date, fd.received_at::date)), 0) as net_payable
  from public.fuel_delivery fd;

create or replace view public.fuel_inventory_monthly with (security_invoker = true) as
  with months as (
    select date_trunc('month', d)::date as period from (
      select occurred_at::date as d from public.fuel_dispense
      union all select received_at::date from public.fuel_delivery
      union all select read_on from public.fuel_tank_reading
    ) x group by 1
  )
  select m.period,
    coalesce((select sum(d.liters_billed) from public.fuel_delivery d
              where date_trunc('month', d.received_at)::date = m.period), 0) as fuel_in_l,
    coalesce((select sum(o.liters) from public.fuel_dispense o
              where date_trunc('month', o.occurred_at)::date = m.period), 0) as fuel_out_l,
    coalesce((select sum(d.liters_billed) from public.fuel_delivery d
              where date_trunc('month', d.received_at)::date = m.period), 0)
      - coalesce((select sum(o.liters) from public.fuel_dispense o
              where date_trunc('month', o.occurred_at)::date = m.period), 0) as net_change_l,
    (select tr.liters from public.fuel_tank_reading tr
     where date_trunc('month', tr.read_on)::date = m.period
     order by tr.read_on desc limit 1) as dipstick_l
  from months m
  order by m.period;

create or replace view public.fuel_equipment_efficiency with (security_invoker = true) as
  select e.id as equipment_id, e.code, e.name, e.equip_class,
         coalesce(sum(fd.liters), 0) as total_liters,
         count(fd.id)                as dispense_count,
         coalesce(sum(fd.liters) / nullif(count(fd.id), 0), 0) as avg_liters_per_dispense
  from public.equipment e
  left join public.fuel_dispense fd on fd.equipment_id = e.id
  group by 1,2,3,4;

grant select on
  public.fuel_actual_monthly, public.fuel_actual_by_class_monthly,
  public.fuel_estimated_by_class_monthly, public.fuel_variance_monthly,
  public.fuel_delivery_payable, public.fuel_inventory_monthly,
  public.fuel_equipment_efficiency
  to authenticated;

-- =====================================================================
-- 6. PERMISSIONS  (owner-tweakable in Roles & Gates; admin seeded on)
-- =====================================================================

insert into public.role_permissions (role, permission, allowed) values
  ('admin', 'view_fuel_reports', true),
  ('admin', 'manage_fuel',       true),
  ('admin', 'log_fuel',          true)
on conflict (role, permission) do nothing;

-- =====================================================================
-- 7. SEED  (effective-dated defaults from the CSH model — edit as needed)
-- =====================================================================

insert into public.fuel_settings (key, value, effective_from, note) values
  ('diesel_price', 50,   date '2026-01-01', 'seed'),
  ('density',      0.82,  date '2026-01-01', 'kg per liter (weighbridge)'),
  ('ewt_rate',     0.01,  date '2026-01-01', '1% of VAT-exclusive'),
  ('vat_rate',     0.12,  date '2026-01-01', '12% VAT')
on conflict (key, effective_from) do nothing;

insert into public.fuel_rates (equip_class, equipment_id, liters_per_move, effective_from) values
  ('Mobile Harbor Crane', null, 3,   date '2026-01-01'),
  ('RTG',                 null, 3,   date '2026-01-01'),
  ('Reach Stacker',       null, 1.2, date '2026-01-01')
on conflict do nothing;
