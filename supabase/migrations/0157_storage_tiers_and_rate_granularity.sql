-- 0157: Per-service rate granularity + tiered foreign storage tariff (calculator).
-- Two pieces:
--   (1) terminal_rate_config — each non-storage service declares which dimensions
--       its rate varies by (uniform, or any subset of origin/size/fill/kind). The
--       editor shows only those inputs and fans the value out to the physical
--       terminal_rates cells, so the calculator's 6-key lookup is unchanged.
--   (2) storage_tiers — FOREIGN storage is a progressive per-day tariff with day
--       bands per trade direction (import/export/transhipment) × size. DOMESTIC
--       storage stays flat per-day by size (in terminal_rates). Calculator-only.

-- ── (1) per-service dimension config ────────────────────────────────────────
create table if not exists public.terminal_rate_config (
  service text primary key,
  dims    text[] not null default '{}'   -- subset of origin/size/fill/kind; {} = uniform
);
alter table public.terminal_rate_config enable row level security;
drop policy if exists trc_read on public.terminal_rate_config;
create policy trc_read on public.terminal_rate_config for select to authenticated using (true);
drop policy if exists trc_write on public.terminal_rate_config;
create policy trc_write on public.terminal_rate_config for all to authenticated
  using (public.has_permission('manage_pricing') or public.is_admin())
  with check (public.has_permission('manage_pricing') or public.is_admin());

-- Seeded from the configured data (admin can change in Settings). Storage is NOT
-- here — it has its own tiered model below.
insert into public.terminal_rate_config (service, dims) values
  ('arrastre', array['origin','size','fill']),
  ('wharfage', array['size']),
  ('lolo',     array[]::text[]),
  ('weighing', array['size'])
on conflict (service) do nothing;

-- Normalize existing terminal_rates to each service's granularity (propagate the
-- canonical rate across the now-irrelevant dimensions so every physical cell agrees).
update public.terminal_rates t set rate = s.r
  from (select origin, size, fill, max(rate) r from public.terminal_rates where service = 'arrastre' group by origin, size, fill) s
 where t.service = 'arrastre' and t.origin = s.origin and t.size = s.size and t.fill = s.fill;
update public.terminal_rates t set rate = s.r
  from (select size, max(rate) r from public.terminal_rates where service = 'wharfage' group by size) s
 where t.service = 'wharfage' and t.size = s.size;
update public.terminal_rates t set rate = s.r
  from (select size, max(rate) r from public.terminal_rates where service = 'weighing' group by size) s
 where t.service = 'weighing' and t.size = s.size;
update public.terminal_rates set rate = (select max(rate) from public.terminal_rates where service = 'lolo')
 where service = 'lolo';
-- storage: flat per-day by size (used for DOMESTIC; foreign uses storage_tiers).
update public.terminal_rates t set rate = s.r
  from (select size, max(rate) r from public.terminal_rates where service = 'storage' group by size) s
 where t.service = 'storage' and t.size = s.size;

-- ── (2) tiered FOREIGN storage tariff ───────────────────────────────────────
create table if not exists public.storage_tiers (
  id       uuid primary key default gen_random_uuid(),
  trade    text not null,   -- import | export | transhipment
  size     text not null,   -- 20 | 40
  day_from int  not null,   -- band start (absolute storage day)
  day_to   int,             -- band end inclusive; null = open-ended
  rate     numeric,         -- per-day, nullable ("not set")
  unique (trade, size, day_from)
);
alter table public.storage_tiers enable row level security;
drop policy if exists st_read on public.storage_tiers;
create policy st_read on public.storage_tiers for select to authenticated using (true);
drop policy if exists st_write on public.storage_tiers;
create policy st_write on public.storage_tiers for all to authenticated
  using (public.has_permission('manage_pricing') or public.is_admin())
  with check (public.has_permission('manage_pricing') or public.is_admin());

insert into public.storage_tiers (trade, size, day_from, day_to, rate) values
  -- IMPORT
  ('import','20', 6,10, 602.57),('import','20',11,15, 662.82),('import','20',16,20, 723.08),
  ('import','20',21,25, 783.33),('import','20',26,30, 843.59),('import','20',31,null, 903.85),
  ('import','40', 6,10,1205.13),('import','40',11,15,1325.64),('import','40',16,20,1446.16),
  ('import','40',21,25,1566.67),('import','40',26,30,1687.18),('import','40',31,null,1807.70),
  -- EXPORT
  ('export','20', 5, 6, 75.30),('export','20', 7,11, 150.61),('export','20',12,16, 165.67),
  ('export','20',17,21, 180.73),('export','20',22,26, 195.79),('export','20',27,31, 210.85),('export','20',32,null, 225.91),
  ('export','40', 5, 6, 150.61),('export','40', 7,11, 301.22),('export','40',12,16, 331.34),
  ('export','40',17,21, 361.46),('export','40',22,26, 391.59),('export','40',27,31, 421.71),('export','40',32,null, 451.83),
  -- TRANSHIPMENT
  ('transhipment','20',16,20, 13.70),('transhipment','20',21,25, 15.06),('transhipment','20',26,30, 16.44),
  ('transhipment','20',31,35, 17.80),('transhipment','20',36,40, 19.18),('transhipment','20',41,null, 20.54),
  ('transhipment','40',16,20, 27.39),('transhipment','40',21,25, 30.13),('transhipment','40',26,30, 32.88),
  ('transhipment','40',31,35, 35.61),('transhipment','40',36,40, 38.35),('transhipment','40',41,null, 41.09)
on conflict (trade, size, day_from) do nothing;
