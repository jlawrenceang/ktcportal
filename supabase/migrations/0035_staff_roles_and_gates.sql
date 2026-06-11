-- ============================================================
-- 0035 — staff roles + owner-controlled permission gates, X-ray checker
-- confirmation, and the ERP invoice link (decisions 2026-06-11).
--
-- Roles (staff only; customers have staff_role = null):
--   * admin   — full back office (everything except owner-only surfaces)
--   * cashier — view job orders + record the ERP Service Invoice no (= PAID)
--   * checker — view job orders + confirm X-ray done from the tablet
--
-- The permission GATES live in role_permissions — READ by any authenticated
-- user (the UI hides what you can't do), WRITE by the OWNER ONLY (tweak the
-- matrix per role in Settings). Backend enforcement:
--   * restricted staff (cashier/checker) have is_admin = FALSE — none of the
--     existing admin policies apply to them;
--   * they see job orders through a new SELECT policy gated on the
--     'view_job_orders' permission;
--   * they act ONLY through SECURITY DEFINER RPCs that check has_permission()
--     (record_xray / record_service_invoice).
-- The owner bypasses all gates (failsafe, unchanged).
--
-- New job_orders columns:
--   * xray_performed_at  — stamped by the checker's confirmation
--   * service_invoice_no + invoice_recorded_at — ERP invoice reference;
--     an invoice number on file = PAID (ADR decision; invoice carries the JO
--     number on the ERP side for cross-reference)
-- ============================================================

-- 1) Role on the staff row. Customers stay null; existing staff backfill to 'admin'.
alter table public.customers add column if not exists staff_role text
  check (staff_role in ('admin','cashier','checker'));
update public.customers set staff_role = 'admin' where is_admin and staff_role is null;

-- 1b) staff_role is a PROTECTED field — without this, a customer could set
--     their own row to 'checker'/'cashier' and pass has_permission(). Only the
--     owner (or server context) may change it; everyone else gets it restored.
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;  -- trusted server / SQL context
  end if;

  -- roles are owner-assigned (create_staff / Settings); never self-served
  if not coalesce((select is_owner from public.customers where user_id = auth.uid()), false) then
    new.staff_role := old.staff_role;
  end if;

  if old.is_owner then
    new.is_owner   := old.is_owner;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    new.is_owner := old.is_owner;
    new.is_admin := old.is_admin;
    -- permitted self-initiated status changes:
    --   rejected -> pending  (resubmit after rejection)
    --   approved -> pending  (re-verify after a legal-name change)
    -- block every other self-status-change.
    if not (old.status in ('rejected', 'approved') and new.status = 'pending') then
      new.status     := old.status;
      new.decided_at := old.decided_at;
    end if;
  end if;

  new.is_owner := old.is_owner;  -- owner grant/revoke is server-only
  return new;
end;
$$;

-- 2) Permission matrix — owner-editable gates.
create table if not exists public.role_permissions (
  role       text not null check (role in ('admin','cashier','checker')),
  permission text not null,
  allowed    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, permission)
);
alter table public.role_permissions enable row level security;

drop policy if exists "read role permissions" on public.role_permissions;
create policy "read role permissions" on public.role_permissions
  for select to authenticated using (true);

drop policy if exists "owner writes role permissions" on public.role_permissions;
create policy "owner writes role permissions" on public.role_permissions
  for all to authenticated
  using (coalesce((select is_owner from public.customers where user_id = auth.uid()), false))
  with check (coalesce((select is_owner from public.customers where user_id = auth.uid()), false));

-- Seed the default gates (idempotent).
insert into public.role_permissions (role, permission, allowed) values
  ('admin',   'view_job_orders',    true),
  ('admin',   'process_job_orders', true),
  ('admin',   'confirm_xray',       true),
  ('admin',   'record_invoice',     true),
  ('admin',   'manage_approvals',   true),
  ('admin',   'manage_customers',   true),
  ('admin',   'manage_consignees',  true),
  ('admin',   'manage_pricing',     true),
  ('cashier', 'view_job_orders',    true),
  ('cashier', 'process_job_orders', false),
  ('cashier', 'confirm_xray',       false),
  ('cashier', 'record_invoice',     true),
  ('cashier', 'manage_approvals',   false),
  ('cashier', 'manage_customers',   false),
  ('cashier', 'manage_consignees',  false),
  ('cashier', 'manage_pricing',     false),
  ('checker', 'view_job_orders',    true),
  ('checker', 'process_job_orders', false),
  ('checker', 'confirm_xray',       true),
  ('checker', 'record_invoice',     false),
  ('checker', 'manage_approvals',   false),
  ('checker', 'manage_customers',   false),
  ('checker', 'manage_consignees',  false),
  ('checker', 'manage_pricing',     false)
on conflict (role, permission) do nothing;

-- 3) has_permission — owner bypasses; staff resolve via their role's gates.
create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.is_owner then true
      when c.staff_role is null then false
      else coalesce((select rp.allowed from public.role_permissions rp
                     where rp.role = c.staff_role and rp.permission = p), false)
    end
    from public.customers c where c.user_id = auth.uid()
  ), false);
$$;

-- 4) Restricted staff can SEE job orders (held excluded — account-gated drafts).
drop policy if exists "staff view job orders" on public.job_orders;
create policy "staff view job orders" on public.job_orders
  for select to authenticated
  using (public.has_permission('view_job_orders') and status <> 'held');

drop policy if exists "staff view job order lines" on public.job_order_lines;
create policy "staff view job order lines" on public.job_order_lines
  for select to authenticated
  using (exists (select 1 from public.job_orders jo
                 where jo.id = job_order_id
                   and public.has_permission('view_job_orders') and jo.status <> 'held'));

-- Checker/cashier also need customer names + consignee names on the cards.
drop policy if exists "staff view customer directory" on public.customers;
create policy "staff view customer directory" on public.customers
  for select to authenticated using (public.has_permission('view_job_orders'));

drop policy if exists "staff view consignees" on public.consignees;
create policy "staff view consignees" on public.consignees
  for select to authenticated using (public.has_permission('view_job_orders'));

-- 5) ERP link + X-ray stamp columns.
alter table public.job_orders add column if not exists xray_performed_at timestamptz;
alter table public.job_orders add column if not exists service_invoice_no text;
alter table public.job_orders add column if not exists invoice_recorded_at timestamptz;

-- 6) Checker confirmation: stamps the X-ray date/time and completes the order.
create or replace function public.record_xray(p_id uuid, p_performed_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('confirm_xray') then
    raise exception 'You don''t have permission to confirm X-ray completion.';
  end if;
  select status into v_status from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — only open orders can be confirmed.', v_status;
  end if;
  update public.job_orders
  set xray_performed_at = coalesce(p_performed_at, now()),
      status = 'completed'
  where id = p_id;
end;
$$;

-- 7) Cashier records the ERP Service Invoice number = PAID.
create or replace function public.record_service_invoice(p_id uuid, p_invoice_no text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('record_invoice') then
    raise exception 'You don''t have permission to record invoices.';
  end if;
  if length(coalesce(trim(p_invoice_no), '')) = 0 then
    raise exception 'Enter the Service Invoice number.' using errcode = 'check_violation';
  end if;
  update public.job_orders
  set service_invoice_no = trim(p_invoice_no),
      invoice_recorded_at = now()
  where id = p_id;
  if not found then raise exception 'Job order not found.'; end if;
end;
$$;

revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.record_xray(uuid, timestamptz) from public, anon;
revoke all on function public.record_service_invoice(uuid, text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.record_xray(uuid, timestamptz) to authenticated;
grant execute on function public.record_service_invoice(uuid, text) to authenticated;

-- 8) create_staff gains a role; cashier/checker are NOT is_admin (no broad
--    admin policies) — they work through the gated policies/RPCs above.
drop function if exists public.create_staff(text, text, text);
create or replace function public.create_staff(p_username text, p_password text, p_full_name text, p_role text default 'admin')
returns text language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(p_username)) || '@ktc-staff.local';
  v_id    uuid := gen_random_uuid();
begin
  if v_uid is not null
     and not coalesce((select is_owner from public.customers where user_id = v_uid), false) then
    raise exception 'Only the owner can create staff';
  end if;
  if p_role not in ('admin','cashier','checker') then
    raise exception 'Unknown role %', p_role;
  end if;
  if length(coalesce(trim(p_username), '')) < 3 then raise exception 'Username must be at least 3 characters'; end if;
  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'Password must be at least 8 characters and include a letter and a number';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'That username is already taken';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'username', lower(trim(p_username))),
    false,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  update public.customers
  set is_admin = (p_role = 'admin'),
      staff_role = p_role,
      status = 'approved',
      full_name = p_full_name,
      decided_at = now()
  where user_id = v_id;

  return v_email;
end;
$$;

revoke all on function public.create_staff(text, text, text, text) from public, anon;
grant execute on function public.create_staff(text, text, text, text) to authenticated;
