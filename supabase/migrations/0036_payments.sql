-- ============================================================
-- 0036 — online payment (manual proof upload, NO gateway) + payment info.
--
-- Decided 2026-06-11: payment is NON-GATED (a JO is processable regardless);
-- a customer sees the fee computation, pays by bank transfer / GCash using
-- KTC's static details + QR, uploads the deposit slip, and an admin/cashier
-- confirms or rejects it. The official Service Invoice still comes from the
-- ERP at the cashier (0035's service_invoice_no = PAID stays the final word).
--
--   * job_orders.payment_*: status unpaid|submitted|confirmed|rejected,
--     proof path, timestamps, reviewer note
--   * payment_info: bank/GCash details shown on the payment page
--     (read: authenticated; write: admin) + QR image in the public
--     'payment-qr' bucket
--   * 'payment-slips' bucket: per-user folder, mirrors valid-ids; staff
--     read via the 'review_payments' gate
--   * RPCs: submit_payment_proof (customer, own JO) /
--     review_payment (staff, permission-checked)
--   * new 'review_payments' permission seeded: admin+cashier yes, checker no
-- ============================================================

-- 1) Payment state on the JO.
alter table public.job_orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid','submitted','confirmed','rejected'));
alter table public.job_orders add column if not exists payment_proof_path text;
alter table public.job_orders add column if not exists payment_submitted_at timestamptz;
alter table public.job_orders add column if not exists payment_confirmed_at timestamptz;
alter table public.job_orders add column if not exists payment_note text; -- reviewer note (e.g. why rejected)

-- 2) Bank / GCash details for the payment page.
create table if not exists public.payment_info (
  key        text primary key,
  value      text not null default '',
  label      text,
  updated_at timestamptz not null default now()
);
alter table public.payment_info enable row level security;

drop policy if exists "payment info readable" on public.payment_info;
create policy "payment info readable" on public.payment_info
  for select to authenticated using (true);
drop policy if exists "admin writes payment info" on public.payment_info;
create policy "admin writes payment info" on public.payment_info
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.payment_info (key, value, label) values
  ('bank_name',      '', 'Bank name'),
  ('account_name',   '', 'Account name'),
  ('account_number', '', 'Account number'),
  ('gcash_number',   '', 'GCash number'),
  ('instructions',   'Pay the exact total, then upload a clear photo or PDF of the deposit/transfer slip.', 'Instructions shown to the customer')
on conflict (key) do nothing;

-- 3) Buckets: private payment slips (per-user) + public QR image.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-slips', 'payment-slips', false, 5242880,
   array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf']),
  ('payment-qr', 'payment-qr', true, 5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "user uploads own payment slip" on storage.objects;
create policy "user uploads own payment slip" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user updates own payment slip" on storage.objects;
create policy "user updates own payment slip" on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user reads own payment slip" on storage.objects;
create policy "user reads own payment slip" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "staff reads payment slips" on storage.objects;
create policy "staff reads payment slips" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-slips' and public.has_permission('review_payments'));

drop policy if exists "admin writes payment qr" on storage.objects;
create policy "admin writes payment qr" on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-qr' and public.is_admin())
  with check (bucket_id = 'payment-qr' and public.is_admin());

-- 4) The review gate: admins + cashiers review payments; checkers don't.
insert into public.role_permissions (role, permission, allowed) values
  ('admin',   'review_payments', true),
  ('cashier', 'review_payments', true),
  ('checker', 'review_payments', false)
on conflict (role, permission) do nothing;

-- 5) Customer submits (or re-submits after a rejection) their proof.
create or replace function public.submit_payment_proof(p_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid proof path.';
  end if;
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.status in ('cancelled','rejected') then
    raise exception 'This order is % — no payment is due.', v_row.status;
  end if;
  if v_row.payment_status = 'confirmed' then
    raise exception 'Payment for this order is already confirmed.';
  end if;
  update public.job_orders
  set payment_status = 'submitted',
      payment_proof_path = p_path,
      payment_submitted_at = now(),
      payment_note = null
  where id = p_id;
end;
$$;

-- 6) Staff confirm/reject (permission-gated; note shown to the customer on reject).
create or replace function public.review_payment(p_id uuid, p_confirm boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to review payments.';
  end if;
  select payment_status into v_status from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status <> 'submitted' then
    raise exception 'No submitted payment proof to review (current: %).', v_status;
  end if;
  if not p_confirm and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why (e.g. wrong amount, unclear slip).' using errcode = 'check_violation';
  end if;
  update public.job_orders
  set payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
      payment_confirmed_at = case when p_confirm then now() else null end,
      payment_note = case when p_confirm then null else trim(p_note) end
  where id = p_id;
end;
$$;

revoke all on function public.submit_payment_proof(uuid, text) from public, anon;
revoke all on function public.review_payment(uuid, boolean, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, text) to authenticated;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;
