-- ============================================================
-- 0073 — terminal rate tariff (arrastre / LoLo / storage) (owner, 2026-06-15)
--
-- Admin-configurable rates keyed by the combination the owner described:
--   service × trade (import/export) × origin (domestic/foreign) × size (20/40).
-- Seeded at ₱0 so the owner plugs in the real tariff in Settings → Rates. The
-- Rate Calculator looks rates up by the customer's selections. VAT (12%) is
-- applied to the terminal subtotal (same VAT setting as the X-ray flow).
--
-- Storage is "per container PER DAY" past the Last Free Day; arrastre/LoLo are
-- "per container". Reefer/electrical uses a per-van-per-hour rate stored in
-- pricing_settings (computed from plug-in → plug-out in the calculator).
-- ============================================================

create table if not exists public.terminal_rates (
  id      uuid primary key default gen_random_uuid(),
  service text not null check (service in ('arrastre', 'lolo', 'storage')),
  trade   text not null check (trade   in ('import', 'export')),
  origin  text not null check (origin  in ('domestic', 'foreign')),
  size    text not null check (size    in ('20', '40')),
  rate    numeric not null default 0,
  unique (service, trade, origin, size)
);

alter table public.terminal_rates enable row level security;
drop policy if exists "read terminal rates" on public.terminal_rates;
create policy "read terminal rates" on public.terminal_rates
  for select to authenticated using (true);
drop policy if exists "manage terminal rates" on public.terminal_rates;
create policy "manage terminal rates" on public.terminal_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed all 24 combinations at 0 (arrastre/lolo/storage × 2 × 2 × 2).
insert into public.terminal_rates (service, trade, origin, size, rate)
select s, t, o, z, 0
from unnest(array['arrastre', 'lolo', 'storage']) s
cross join unnest(array['import', 'export']) t
cross join unnest(array['domestic', 'foreign']) o
cross join unnest(array['20', '40']) z
on conflict (service, trade, origin, size) do nothing;

-- Reefer/electrical rate (per van per hour) lives with the other pricing settings.
insert into public.pricing_settings (key, value, label) values
  ('reefer_rate', 0, 'Reefer / electrical (per van, per hour)')
on conflict (key) do update set label = excluded.label;
