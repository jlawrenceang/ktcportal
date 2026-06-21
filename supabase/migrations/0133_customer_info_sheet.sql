-- ============================================================
-- 0133 — in-portal Customer Information Sheet (owner, 2026-06-22)
--
-- Account-holders fill their company profile (the KTC Customer Information Sheet)
-- INSIDE the portal — single source of truth. Walk-ins without an account keep
-- using the Google Form + QR. Decision: completing it is REQUIRED BEFORE FILING
-- (server-enforced via a trigger; staff filing on behalf are exempt).
--
-- Data: a 1:1 customer_info row + a customer_contacts child (authorized reps) +
-- a private customer-docs bucket (BIR 2303 required, 2307 / zero-rating optional).
-- ============================================================

-- 1) Company profile (1:1 with the account).
create table if not exists public.customer_info (
  customer_id          uuid primary key references public.customers(id) on delete cascade,
  trade_name           text,
  legal_name           text,          -- "Customer Name" (blank if same as trade name)
  business_address1    text,
  business_address2    text,
  tin                  text,
  tel_no               text,
  mobile_no            text,
  email                text,
  doc_2303_path        text,
  doc_2307_path        text,
  doc_zero_rating_path text,
  certified_at         timestamptz,
  updated_at           timestamptz not null default now()
);

-- 2) Authorized representatives (the contact table on the sheet).
create table if not exists public.customer_contacts (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  name           text not null,
  position       text,
  contact_number text,
  email          text,
  created_at     timestamptz not null default now()
);
create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id);

-- 3) RLS — customers read their OWN; staff with manage_customers read all.
--    All writes go through save_customer_info (SECURITY DEFINER) — no direct
--    client INSERT/UPDATE policies.
alter table public.customer_info enable row level security;
drop policy if exists "read own customer info" on public.customer_info;
create policy "read own customer info" on public.customer_info
  for select to authenticated using (customer_id = public.current_broker_id());
drop policy if exists "staff read customer info" on public.customer_info;
create policy "staff read customer info" on public.customer_info
  for select to authenticated using (public.has_permission('manage_customers'));

alter table public.customer_contacts enable row level security;
drop policy if exists "read own customer contacts" on public.customer_contacts;
create policy "read own customer contacts" on public.customer_contacts
  for select to authenticated using (customer_id = public.current_broker_id());
drop policy if exists "staff read customer contacts" on public.customer_contacts;
create policy "staff read customer contacts" on public.customer_contacts
  for select to authenticated using (public.has_permission('manage_customers'));

-- 4) Private bucket for the customer's BIR documents (per-user folder).
insert into storage.buckets (id, name, public) values ('customer-docs', 'customer-docs', false)
on conflict (id) do nothing;

drop policy if exists "customer uploads own customer doc" on storage.objects;
create policy "customer uploads own customer doc" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customer updates own customer doc" on storage.objects;
create policy "customer updates own customer doc" on storage.objects
  for update to authenticated
  using (bucket_id = 'customer-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customer reads own customer doc" on storage.objects;
create policy "customer reads own customer doc" on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "staff reads customer docs" on storage.objects;
create policy "staff reads customer docs" on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-docs' and public.has_permission('manage_customers'));

-- 5) Save (upsert profile + replace contacts) — the caller's OWN record only.
create or replace function public.save_customer_info(
  p_info     jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_certified boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid := public.current_broker_id();
  e jsonb;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;

  insert into public.customer_info as ci (
    customer_id, trade_name, legal_name, business_address1, business_address2,
    tin, tel_no, mobile_no, email, doc_2303_path, doc_2307_path, doc_zero_rating_path,
    certified_at, updated_at
  ) values (
    v_cust,
    nullif(trim(p_info->>'trade_name'), ''),
    nullif(trim(p_info->>'legal_name'), ''),
    nullif(trim(p_info->>'business_address1'), ''),
    nullif(trim(p_info->>'business_address2'), ''),
    nullif(trim(p_info->>'tin'), ''),
    nullif(trim(p_info->>'tel_no'), ''),
    nullif(trim(p_info->>'mobile_no'), ''),
    nullif(trim(p_info->>'email'), ''),
    nullif(trim(p_info->>'doc_2303_path'), ''),
    nullif(trim(p_info->>'doc_2307_path'), ''),
    nullif(trim(p_info->>'doc_zero_rating_path'), ''),
    case when p_certified then now() else null end,
    now()
  )
  on conflict (customer_id) do update set
    trade_name = excluded.trade_name,
    legal_name = excluded.legal_name,
    business_address1 = excluded.business_address1,
    business_address2 = excluded.business_address2,
    tin = excluded.tin,
    tel_no = excluded.tel_no,
    mobile_no = excluded.mobile_no,
    email = excluded.email,
    doc_2303_path = excluded.doc_2303_path,
    doc_2307_path = excluded.doc_2307_path,
    doc_zero_rating_path = excluded.doc_zero_rating_path,
    certified_at = excluded.certified_at,
    updated_at = now();

  -- replace-all contacts
  delete from public.customer_contacts where customer_id = v_cust;
  for e in select * from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) loop
    if length(coalesce(trim(e->>'name'), '')) > 0 then
      insert into public.customer_contacts (customer_id, name, position, contact_number, email)
      values (v_cust, trim(e->>'name'), nullif(trim(e->>'position'), ''),
              nullif(trim(e->>'contact_number'), ''), nullif(trim(e->>'email'), ''));
    end if;
  end loop;
end;
$$;
revoke all on function public.save_customer_info(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_customer_info(jsonb, jsonb, boolean) to authenticated;

-- 6) Completeness check (the required-before-filing rule). Required: trade name,
--    address line 1, TIN, mobile, email, the 2303 document, and the certification.
create or replace function public.customer_info_complete(p_customer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customer_info ci
    where ci.customer_id = p_customer
      and coalesce(trim(ci.trade_name), '')        <> ''
      and coalesce(trim(ci.business_address1), '') <> ''
      and coalesce(trim(ci.tin), '')               <> ''
      and coalesce(trim(ci.mobile_no), '')         <> ''
      and coalesce(trim(ci.email), '')             <> ''
      and coalesce(ci.doc_2303_path, '')           <> ''
      and ci.certified_at is not null
  );
$$;
revoke all on function public.customer_info_complete(uuid) from public, anon;
grant execute on function public.customer_info_complete(uuid) to authenticated;

create or replace function public.my_company_info_complete()
returns boolean language sql stable security definer set search_path = public as $$
  select public.customer_info_complete(public.current_broker_id());
$$;
revoke all on function public.my_company_info_complete() from public, anon;
grant execute on function public.my_company_info_complete() to authenticated;

-- 7) Server-enforced gate: a CUSTOMER (not staff/owner) can't file an order or a
--    release until their Company Information is complete. Staff filing on behalf
--    (auth.uid() <> the order's own customer) is exempt.
create or replace function public.enforce_customer_info_before_filing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.customers c
    where c.id = new.customer_id
      and c.user_id = auth.uid()
      and c.staff_role is null
      and coalesce(c.is_owner, false) = false
  ) and not public.customer_info_complete(new.customer_id) then
    raise exception 'Please complete your Company Information before filing.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists job_orders_require_cis on public.job_orders;
create trigger job_orders_require_cis before insert on public.job_orders
  for each row execute function public.enforce_customer_info_before_filing();

drop trigger if exists release_orders_require_cis on public.release_orders;
create trigger release_orders_require_cis before insert on public.release_orders
  for each row execute function public.enforce_customer_info_before_filing();
