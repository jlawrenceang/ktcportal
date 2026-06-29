-- ============================================================
-- 0204 — Per-consignee special-rate overrides (owner 2026-06-29, decision #2)
--
-- "One price list, but special rates for some consignees." The X-ray/ancillary
-- bill already reads ONE source (service_rates + move_rates); this adds optional
-- per-consignee overrides on top. The authoritative billed amount is computed
-- SERVER-SIDE (the M2 charge RPC reads this as definer + snapshots charges.amount)
-- so a client can never manipulate the price — and the rates themselves are
-- commercially sensitive, so direct reads are staff-only (not broker-visible).
-- Additive only.
-- ============================================================

create table if not exists public.consignee_rate_overrides (
  id           uuid primary key default gen_random_uuid(),
  consignee_id uuid not null references public.consignees(id) on delete cascade,
  service      text not null,                 -- matches service_rates.service OR move_rates.move_type
  rate         numeric(12,2) not null check (rate >= 0),
  active       boolean not null default true,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  unique (consignee_id, service)
);
create index if not exists consignee_rate_overrides_consignee_idx
  on public.consignee_rate_overrides (consignee_id) where active;

alter table public.consignee_rate_overrides enable row level security;

-- Read: staff who price/bill (admin + cashier). NOT broker-visible — special-rate
-- deals are confidential, and brokers can file against any consignee (open list).
drop policy if exists "staff reads rate overrides" on public.consignee_rate_overrides;
create policy "staff reads rate overrides" on public.consignee_rate_overrides
  for select to authenticated
  using (public.is_admin() or public.has_permission('review_payments') or public.has_permission('record_invoice'));
-- (No write policies — the admin rate editor writes via a SECURITY DEFINER RPC in M2.)

comment on table public.consignee_rate_overrides is
  'Per-consignee special rates over the single service_rates/move_rates spine (owner decision #2, 2026-06-29). Applied server-side at charge time; staff-read only (confidential).';
