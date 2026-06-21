-- ============================================================
-- 0124 — Release / pull-out payment module (ADR-0024, owner 2026-06-21)
--
-- Customer-filed container release: pick consignee + BL no. + upload DO/BL →
-- CSR documents-desk verifies → staff enter charges → customer pays online
-- (reuses payment-slips + QRPH) → cashier confirms → OR claimed at office →
-- released (pull-out). Separate from job_orders (most containers have no JO).
-- All writes go through SECURITY DEFINER RPCs gated by has_permission();
-- customers only SELECT their own rows. ERP stays the billing/OR authority.
-- ============================================================

create sequence if not exists public.release_no_seq;

create table if not exists public.release_orders (
  id                   uuid primary key default gen_random_uuid(),
  release_number       text unique,
  customer_id          uuid not null references public.customers(id) on delete cascade,
  consignee_id         uuid references public.consignees(id),
  bl_number            text not null,
  doc_path             text,                       -- DO/BL upload (release-docs bucket)
  status               text not null default 'submitted'
    check (status in ('submitted','docs_verified','payable','paid','released','on_hold','cancelled')),
  -- document verification (CSR)
  verified_at          timestamptz,
  verified_by          uuid,
  -- charges (staff-entered total; ERP is the authority)
  amount               numeric(12,2),
  charges_note         text,
  charges_set_at       timestamptz,
  -- payment (mirrors the JO payment-proof flow; proof lives in payment-slips)
  payment_status       text not null default 'unpaid'
    check (payment_status in ('unpaid','submitted','confirmed','rejected')),
  payment_proof_path   text,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_note         text,                       -- cashier reason on reject (customer-visible)
  -- OR / release
  or_number            text,
  released_at          timestamptz,
  -- workflow note shown to the customer (hold reason)
  staff_note           text,
  created_at           timestamptz not null default now()
);
create index if not exists release_orders_customer_idx on public.release_orders (customer_id, created_at desc);
create index if not exists release_orders_status_idx   on public.release_orders (status, created_at);

-- ---------- RLS: customers see their own; staff via gate; writes are RPC-only ----------
alter table public.release_orders enable row level security;

drop policy if exists "customer reads own release" on public.release_orders;
create policy "customer reads own release" on public.release_orders
  for select to authenticated
  using (customer_id = public.current_broker_id());

drop policy if exists "staff reads releases" on public.release_orders;
create policy "staff reads releases" on public.release_orders
  for select to authenticated
  using (public.has_permission('verify_release_docs') or public.has_permission('review_payments'));
-- (No INSERT/UPDATE policies — all writes go through the SECURITY DEFINER RPCs below.)

-- ---------- storage bucket for the DO/BL upload ----------
insert into storage.buckets (id, name, public) values ('release-docs', 'release-docs', false)
  on conflict (id) do nothing;

drop policy if exists "customer uploads own release doc" on storage.objects;
create policy "customer uploads own release doc" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'release-docs' and (storage.foldername(name))[1] = public.current_uid_alive()::text);
drop policy if exists "customer reads own release doc" on storage.objects;
create policy "customer reads own release doc" on storage.objects
  for select to authenticated
  using (bucket_id = 'release-docs' and (storage.foldername(name))[1] = public.current_uid_alive()::text);
drop policy if exists "staff reads release docs" on storage.objects;
create policy "staff reads release docs" on storage.objects
  for select to authenticated
  using (bucket_id = 'release-docs'
         and (public.has_permission('verify_release_docs') or public.has_permission('review_payments')));

-- ---------- new owner-tweakable gate: documents desk ----------
insert into public.role_permissions (role, permission, allowed) values
  ('admin',      'verify_release_docs', true),
  ('csr',        'verify_release_docs', true),
  ('operations', 'verify_release_docs', false),
  ('checker',    'verify_release_docs', false),
  ('cashier',    'verify_release_docs', false)
on conflict (role, permission) do nothing;

-- ============================================================
-- RPCs (SECURITY DEFINER — the only write paths)
-- ============================================================

-- Customer files a release (must be an approved customer).
create or replace function public.file_release_order(p_consignee uuid, p_bl text, p_doc_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cust uuid := public.current_broker_id();
begin
  if v_cust is null or not public.broker_is_approved() then
    raise exception 'Your account must be approved to file a release.';
  end if;
  if coalesce(trim(p_bl), '') = '' then raise exception 'A BL number is required.'; end if;
  if length(p_bl) > 60 then raise exception 'BL number is too long.'; end if;
  insert into public.release_orders (release_number, customer_id, consignee_id, bl_number, doc_path, status)
  values ('RO-' || lpad(nextval('release_no_seq')::text, 6, '0'),
          v_cust, p_consignee, upper(trim(p_bl)), nullif(p_doc_path, ''), 'submitted')
  returning id into v_id;
  return v_id;
end;
$$;

-- Customer re-uploads a corrected DO/BL after an on-hold.
create or replace function public.resubmit_release_doc(p_id uuid, p_doc_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  update public.release_orders
     set doc_path = nullif(p_doc_path, ''), status = 'submitted', staff_note = null
   where id = p_id and customer_id = v_cust and status = 'on_hold';
  if not found then raise exception 'This release can''t be resubmitted.'; end if;
end;
$$;

-- CSR verifies the documents (ok) or holds for a corrected doc (with a note).
create or replace function public.verify_release_order(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('verify_release_docs') then raise exception 'You don''t have permission to verify release documents.'; end if;
  update public.release_orders
     set status      = case when p_ok then 'docs_verified' else 'on_hold' end,
         verified_at = case when p_ok then now() else verified_at end,
         verified_by = case when p_ok then auth.uid() else verified_by end,
         staff_note  = case when p_ok then null else nullif(trim(p_note), '') end
   where id = p_id and status in ('submitted', 'on_hold');
  if not found then raise exception 'This release is not awaiting document verification.'; end if;
end;
$$;

-- Staff enter the total charges (after verification) → payable.
create or replace function public.set_release_charges(p_id uuid, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('verify_release_docs') then raise exception 'You don''t have permission to set release charges.'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter a valid amount.'; end if;
  update public.release_orders
     set amount = p_amount, charges_note = nullif(trim(p_note), ''), charges_set_at = now(), status = 'payable'
   where id = p_id and status in ('docs_verified', 'payable');
  if not found then raise exception 'Charges can only be set on a verified release.'; end if;
end;
$$;

-- Customer submits a payment proof (reuses the payment-slips bucket).
create or replace function public.submit_release_payment(p_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  update public.release_orders
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof_path, ''),
         payment_submitted_at = now(), payment_note = null
   where id = p_id and customer_id = v_cust and status = 'payable'
     and payment_status in ('unpaid', 'rejected');
  if not found then raise exception 'This release is not ready for payment.'; end if;
end;
$$;

-- Cashier confirms (→ paid) or rejects the payment proof (customer re-uploads).
create or replace function public.confirm_release_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  update public.release_orders
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end,
         status               = case when p_ok then 'paid' else status end
   where id = p_id and payment_status = 'submitted';
  if not found then raise exception 'There is no payment to review for this release.'; end if;
end;
$$;

-- Cashier records the ERP Official Receipt no. → released (claimed for pull-out).
create or replace function public.record_release_or(p_id uuid, p_or text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('review_payments') or public.has_permission('record_invoice')) then
    raise exception 'You don''t have permission to record the OR.';
  end if;
  if coalesce(trim(p_or), '') = '' then raise exception 'Enter the OR number.'; end if;
  update public.release_orders
     set or_number = upper(trim(p_or)), released_at = now(), status = 'released'
   where id = p_id and status = 'paid';
  if not found then raise exception 'The OR can only be recorded on a paid release.'; end if;
end;
$$;

-- Lock down execute to authenticated only (definer functions).
revoke all on function public.file_release_order(uuid, text, text)        from public, anon;
revoke all on function public.resubmit_release_doc(uuid, text)            from public, anon;
revoke all on function public.verify_release_order(uuid, boolean, text)   from public, anon;
revoke all on function public.set_release_charges(uuid, numeric, text)    from public, anon;
revoke all on function public.submit_release_payment(uuid, text)          from public, anon;
revoke all on function public.confirm_release_payment(uuid, boolean, text) from public, anon;
revoke all on function public.record_release_or(uuid, text)              from public, anon;
grant execute on function public.file_release_order(uuid, text, text)        to authenticated;
grant execute on function public.resubmit_release_doc(uuid, text)            to authenticated;
grant execute on function public.verify_release_order(uuid, boolean, text)   to authenticated;
grant execute on function public.set_release_charges(uuid, numeric, text)    to authenticated;
grant execute on function public.submit_release_payment(uuid, text)          to authenticated;
grant execute on function public.confirm_release_payment(uuid, boolean, text) to authenticated;
grant execute on function public.record_release_or(uuid, text)              to authenticated;
