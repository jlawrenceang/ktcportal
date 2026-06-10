-- ============================================================
-- 0030 — admin-configurable pricing: per-service rates + flat fees + VAT.
--
-- Used by the (future) online-payment computation page. The official Service
-- Invoice + BIR receipt are produced in KTC's ERP, NOT here — this is only the
-- operational "what to pay" computation. Values are READ-ONLY to all
-- authenticated users; only admins (is_admin() incl. owner) may change them.
--
-- Seeded with rate 0 = placeholder until an admin sets the real amounts.
-- ============================================================

create table if not exists public.service_rates (
  service     text primary key,                 -- matches SERVICE_REQUESTS labels
  rate        numeric(12,2) not null default 0, -- per `unit`
  unit        text not null default 'per_container',
  vatable     boolean not null default true,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.pricing_settings (
  key         text primary key,                 -- 'vat_rate' | 'admin_fee' | 'print_fee'
  value       numeric(12,4) not null default 0,
  label       text,
  updated_at  timestamptz not null default now()
);

alter table public.service_rates   enable row level security;
alter table public.pricing_settings enable row level security;

-- Read: any authenticated user (needed for the customer payment computation).
drop policy if exists "rates readable" on public.service_rates;
create policy "rates readable" on public.service_rates for select to authenticated using (true);
drop policy if exists "pricing readable" on public.pricing_settings;
create policy "pricing readable" on public.pricing_settings for select to authenticated using (true);

-- Write: admins only.
drop policy if exists "admin writes rates" on public.service_rates;
create policy "admin writes rates" on public.service_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin writes pricing" on public.pricing_settings;
create policy "admin writes pricing" on public.pricing_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed the current service catalogue (rate 0 = placeholder).
insert into public.service_rates (service) values
  ('X-ray'),
  ('DEA ONLY'),
  ('X-ray + DEA'),
  ('X-ray + DEA (For PDEA)'),
  ('DEA ONLY (For PDEA)'),
  ('OOG Stripping')
on conflict (service) do nothing;

-- Seed fees + VAT (placeholders except the standard 12% VAT).
insert into public.pricing_settings (key, value, label) values
  ('vat_rate',  0.12, 'VAT rate (e.g. 0.12 = 12%)'),
  ('admin_fee', 0,    'Admin / service fee (flat, no VAT)'),
  ('print_fee', 0,    'Print fee (flat, no VAT)')
on conflict (key) do nothing;
