-- ============================================================
-- 0021 — rename the data model: brokers -> customers.
--
-- Done now while the system has no real data (only the owner). Renaming the
-- TABLE and COLUMNS auto-updates everything that references them by OID/attnum
-- (RLS policies, triggers, FKs, indexes, constraints, column defaults). Only
-- pl/pgSQL + SQL function BODIES reference names as text, so those are recreated
-- below (function + trigger NAMES are kept — they're internal plumbing — so no
-- policy needs to change).
--
--   table   public.brokers           -> public.customers
--   column  brokers.broker_code      -> customers.customer_code
--   column  job_orders.broker_id     -> job_orders.customer_id
--   column  accreditations.broker_id -> accreditations.customer_id
-- (brokers.customer_id legacy ref column is left as-is.)
-- ============================================================

alter table public.brokers rename to customers;
alter table public.customers      rename column broker_code to customer_code;
alter table public.job_orders     rename column broker_id   to customer_id;
alter table public.accreditations rename column broker_id   to customer_id;

-- ---- recreate function bodies that named the old table/columns -------------

create or replace function public.current_broker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid()
$$;

create or replace function public.broker_is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status = 'approved' or is_admin or is_owner from public.customers where user_id = auth.uid()),
    false)
$$;

create or replace function public.broker_is_pending()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status = 'pending' from public.customers where user_id = auth.uid()),
    false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_owner from public.customers where user_id = auth.uid()), false)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.customers (user_id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.customers set email_confirmed_at = new.email_confirmed_at where user_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_order_caps()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if new.status = 'held' then
    select count(*) into cnt from public.job_orders
      where customer_id = new.customer_id and status = 'held';
    if cnt >= 10 then
      raise exception 'You can keep at most 10 job orders on hold until your account is verified. Upload your valid ID to get verified.'
        using errcode = 'check_violation';
    end if;
  elsif new.status in ('submitted','processing') then
    select count(*) into cnt from public.job_orders
      where customer_id = new.customer_id and status in ('submitted','processing');
    if cnt >= 10 then
      raise exception 'You have 10 open job orders — contact KTC admin to file more.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.release_held_job_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'approved' then
      update public.job_orders set status = 'submitted'
        where customer_id = new.id and status = 'held';
    elsif new.status in ('rejected','suspended') then
      update public.job_orders set status = 'cancelled'
        where customer_id = new.id and status = 'held';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.expire_unverified_brokers()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    update public.customers
       set status = 'rejected',
           decided_at = now(),
           decision_reason = 'Verification not completed within 48 hours — no valid ID was uploaded. Please register again to continue.'
     where status = 'pending'
       and email_confirmed_at is not null
       and email_confirmed_at < now() - interval '48 hours'
       and valid_id_path is null
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;

create or replace function public.create_staff(p_username text, p_password text, p_full_name text)
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
  if length(coalesce(trim(p_username), '')) < 3 then raise exception 'Username must be at least 3 characters'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
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
  set is_admin = true, status = 'approved', full_name = p_full_name, decided_at = now()
  where user_id = v_id;

  return v_email;
end;
$$;
