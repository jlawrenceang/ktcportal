-- 0155: Admin-configurable "additional charge types" for JO supplements. (Item 3d)
-- The admin "Add charge" dropdown reads these (label + default amount, editable);
-- the chosen label + amount flow into the existing add_supplement(p_jo,p_label,
-- p_amount) RPC unchanged. default_amount is nullable ("not set" until the owner
-- fills it — same no-zero policy as service_rates).

create table if not exists public.additional_charge_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  default_amount numeric,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.additional_charge_types enable row level security;

-- read: any authenticated (staff + customer, like service_rates); write: admin only.
drop policy if exists act_read on public.additional_charge_types;
create policy act_read on public.additional_charge_types
  for select to authenticated using (true);

drop policy if exists act_write on public.additional_charge_types;
create policy act_write on public.additional_charge_types
  for all to authenticated
  using (public.has_permission('manage_pricing') or public.is_admin())
  with check (public.has_permission('manage_pricing') or public.is_admin());

-- Common starters (amounts NULL = owner sets them in Settings → no ₱0 default).
insert into public.additional_charge_types (label, sort) values
  ('Extra X-ray container', 10),
  ('Demurrage', 20),
  ('Storage overrun', 30),
  ('Reefer monitoring', 40),
  ('Re-scan / re-inspection', 50)
on conflict (label) do nothing;
