-- ============================================================
-- 0125 — release additional charges (supplements) + lock the base charge
--        (owner 2026-06-21, extends ADR-0024; mirrors the JO supplements 0101)
--
-- Charges can't be REVISED once set (financial integrity). The base amount is
-- set exactly once at the docs_verified → payable transition. If charges were
-- missed/unfiled, the documents desk ADDS an additional charge line; the
-- customer pays each one, and the OR can't be recorded until every supplement
-- is confirmed (mirrors the JO "every supplement paid before completion" gate).
-- ============================================================

-- 1) Lock the base charge: set_release_charges only on a docs_verified release
--    (no longer 'payable' — once payable, the amount is fixed).
create or replace function public.set_release_charges(p_id uuid, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('verify_release_docs') then raise exception 'You don''t have permission to set release charges.'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter a valid amount.'; end if;
  update public.release_orders
     set amount = p_amount, charges_note = nullif(trim(p_note), ''), charges_set_at = now(), status = 'payable'
   where id = p_id and status = 'docs_verified';
  if not found then raise exception 'Charges are set once, on a verified release — they can''t be revised. Add an additional charge instead.'; end if;
end;
$$;

-- 2) Additional charge lines.
create table if not exists public.release_supplements (
  id                   uuid primary key default gen_random_uuid(),
  release_order_id     uuid not null references public.release_orders(id) on delete cascade,
  label                text not null,
  amount               numeric(12,2) not null,
  payment_status       text not null default 'unpaid'
    check (payment_status in ('unpaid','submitted','confirmed','rejected')),
  payment_proof_path   text,
  payment_submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  payment_note         text,
  created_at           timestamptz not null default now(),
  created_by           uuid
);
create index if not exists release_supplements_ro_idx on public.release_supplements (release_order_id);

alter table public.release_supplements enable row level security;

drop policy if exists "customer reads own release supplements" on public.release_supplements;
create policy "customer reads own release supplements" on public.release_supplements
  for select to authenticated
  using (exists (select 1 from public.release_orders r
                 where r.id = release_order_id and r.customer_id = public.current_broker_id()));

drop policy if exists "staff reads release supplements" on public.release_supplements;
create policy "staff reads release supplements" on public.release_supplements
  for select to authenticated
  using (public.has_permission('verify_release_docs') or public.has_permission('review_payments'));
-- (writes via the SECURITY DEFINER RPCs below only)

-- 3) Documents desk adds an additional (previously-unfiled) charge.
create or replace function public.add_release_charge(p_release uuid, p_label text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('verify_release_docs') then raise exception 'You don''t have permission to add a release charge.'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Describe the additional charge.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid amount.'; end if;
  select status into v_status from public.release_orders where id = p_release;
  if not found then raise exception 'Release not found.'; end if;
  if v_status not in ('payable', 'paid') then
    raise exception 'Additional charges can only be added once the base charge is set.';
  end if;
  insert into public.release_supplements (release_order_id, label, amount, created_by)
  values (p_release, trim(p_label), p_amount, auth.uid());
end;
$$;

-- 4) Customer submits a proof for a supplement (reuses payment-slips bucket).
create or replace function public.submit_release_supplement_payment(p_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.release_supplements s
     set payment_status = 'submitted', payment_proof_path = nullif(p_proof_path, ''),
         payment_submitted_at = now(), payment_note = null
   where s.id = p_id
     and s.payment_status in ('unpaid', 'rejected')
     and exists (select 1 from public.release_orders r
                 where r.id = s.release_order_id and r.customer_id = public.current_broker_id());
  if not found then raise exception 'This charge is not awaiting payment.'; end if;
end;
$$;

-- 5) Cashier confirms / rejects a supplement payment.
create or replace function public.confirm_release_supplement_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  update public.release_supplements
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end
   where id = p_id and payment_status = 'submitted';
  if not found then raise exception 'There is no payment to review for this charge.'; end if;
end;
$$;

-- 6) OR can't be recorded while any supplement is unpaid.
create or replace function public.record_release_or(p_id uuid, p_or text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('review_payments') or public.has_permission('record_invoice')) then
    raise exception 'You don''t have permission to record the OR.';
  end if;
  if coalesce(trim(p_or), '') = '' then raise exception 'Enter the OR number.'; end if;
  if exists (select 1 from public.release_supplements s
             where s.release_order_id = p_id and s.payment_status <> 'confirmed') then
    raise exception 'An additional charge is still unpaid — it must be settled before the OR.';
  end if;
  update public.release_orders
     set or_number = upper(trim(p_or)), released_at = now(), status = 'released'
   where id = p_id and status = 'paid';
  if not found then raise exception 'The OR can only be recorded on a paid release.'; end if;
end;
$$;

revoke all on function public.add_release_charge(uuid, text, numeric)                  from public, anon;
revoke all on function public.submit_release_supplement_payment(uuid, text)            from public, anon;
revoke all on function public.confirm_release_supplement_payment(uuid, boolean, text)  from public, anon;
grant execute on function public.add_release_charge(uuid, text, numeric)                  to authenticated;
grant execute on function public.submit_release_supplement_payment(uuid, text)            to authenticated;
grant execute on function public.confirm_release_supplement_payment(uuid, boolean, text)  to authenticated;
