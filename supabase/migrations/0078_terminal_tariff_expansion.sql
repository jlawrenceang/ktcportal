-- ============================================================
-- 0078 — terminal tariff expansion + electrical cash bond, for the reworked
-- Rate Calculator (owner, 2026-06-16).
--
-- Basic terminal charges by shipment (owner-described):
--   import (foreign & domestic): arrastre, wharfage, lolo
--   export (foreign & domestic): arrastre, weighing, wharfage, lolo
-- Maersk / MCC EXPORT waive LoLo (the line shoulders the customer's LoLo cost)
--   — applied in the app, NOT stored here: it depends on the chosen shipping
--   line, not on the rate key (trade × origin × size).
--
-- Adds the two missing terminal services (wharfage, weighing) to the tariff and
-- the electrical / reefer billing rules: a minimum billed-hours floor and a
-- refundable per-van cash bond. The per-hour reefer rate already exists (0073).
-- ============================================================

alter table public.terminal_rates drop constraint if exists terminal_rates_service_check;
alter table public.terminal_rates add constraint terminal_rates_service_check
  check (service in ('arrastre', 'wharfage', 'lolo', 'weighing', 'storage'));

-- Seed the new service combinations at 0 (owner sets the real rates in Settings).
insert into public.terminal_rates (service, trade, origin, size, rate)
select s, t, o, z, 0
from unnest(array['wharfage', 'weighing']) s
cross join unnest(array['import', 'export']) t
cross join unnest(array['domestic', 'foreign']) o
cross join unnest(array['20', '40']) z
on conflict (service, trade, origin, size) do nothing;

-- Electrical / reefer billing rules (per-hour rate added in 0073).
--   reefer_min_hours — billed for at least this many hours per van
--   reefer_deposit   — refundable cash bond per van (balance returned 7–10
--                      working days after withdrawal, once the balance is computed)
insert into public.pricing_settings (key, value, label) values
  ('reefer_min_hours', 4,     'Electrical/reefer — minimum billed hours'),
  ('reefer_deposit',   10000, 'Electrical/reefer — refundable cash bond (per van)')
on conflict (key) do update set label = excluded.label;
