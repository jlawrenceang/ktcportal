-- 0150_purchaser_role.sql  (fuel lane 0150+)
-- New staff role: 'purchaser' — the fuel-module admin (procurement + fuel monitoring).
-- Scoped, NON-admin (like cashier/checker): gets only the fuel permissions seeded in
-- 0135 (view_fuel_reports, manage_fuel, log_fuel). Owner can tweak in Roles & Gates.
-- Extends the role whitelist that was last set in 0086 to include 'purchaser'.

-- 1) staff_role check constraint
alter table public.customers drop constraint if exists customers_staff_role_check;
alter table public.customers add constraint customers_staff_role_check
  check (staff_role in ('admin','cashier','checker','operations','csr','purchaser'));

-- 2) role_permissions role check constraint
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('admin','cashier','checker','operations','csr','purchaser'));

-- 3) active staff-creation RPC accepts 'purchaser' (create_staff is legacy/revoked, 0119)
create or replace function public.promote_new_staff(p_user_id uuid, p_role text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select is_owner from public.customers where user_id = auth.uid()), false) then
    raise exception 'Only the owner can create staff';
  end if;
  if p_role not in ('admin','cashier','checker','operations','csr','purchaser') then
    raise exception 'Unknown role %', p_role;
  end if;
  update public.customers
  set is_admin   = (p_role = 'admin'),
      staff_role = p_role,
      status     = 'approved',
      full_name  = p_full_name,
      decided_at = now()
  where user_id = p_user_id;
  if not found then raise exception 'No account row for the new staff user.'; end if;
end;
$$;
revoke all on function public.promote_new_staff(uuid, text, text) from public, anon;
grant execute on function public.promote_new_staff(uuid, text, text) to authenticated;

-- 4) seed the purchaser's fuel permissions (owner-tweakable afterwards)
insert into public.role_permissions (role, permission, allowed) values
  ('purchaser', 'view_fuel_reports', true),
  ('purchaser', 'manage_fuel',       true),
  ('purchaser', 'log_fuel',          true)
on conflict (role, permission) do nothing;
