-- ============================================================
-- 0188 — Phase 2 Batch A: release-billing loop (owner, 2026-06-28)
--
-- Implements ADR-0036 (cash-basis billing) + audit T2-03/04/05/06:
--   1. consignees.payment_terms (cash|credit, default cash) — credit-ready data
--      model; the credit WORKFLOW stays deferred (ADR-0036). Admin sets it via
--      the existing "admin updates consignees" RLS UPDATE (0116) — no RPC.
--   2. release_orders.bill_doc_path — staff upload the computed bill/SOA; the
--      customer views it before paying.
--   3. set_release_charges: cashier OR docs-desk may now bill (owner decision
--      2026-06-28 — "cashier does both"); accepts a bill-doc path; and the base
--      charge is now EDITABLE while unpaid (supersedes the 0125 set-once lock,
--      per ADR-0036's "void/edit" addition — integrity preserved: no edit once
--      a proof is in flight or the payment is confirmed).
--   4. add_release_charge: same widened gate (cashier OR docs-desk).
--   5. void_release_charge: remove a mistaken additional charge while unpaid
--      (T2-06).
--   6. notify_release_change: the FIRST release notifications — customer (bill
--      ready / confirmed / rejected / released / on-hold / cancelled) + cashier
--      (a payment proof to review). New FK notifications.release_order_id /
--      staff_notifications.release_order_id (T2-03/04).
--   7. notify_staff_release_new: a filed release pings the documents desk.
--   8. notify_staff_release_supp_payment: a supplement proof pings the cashier.
--   9. cancel_open_releases_on_status: suspend/reject a customer now cancels
--      their OPEN releases too (T2-05) — skips paid/released and any release
--      carrying in-flight supplement money.
--
-- SECURITY DEFINER functions are recreated from their LATEST source verbatim
-- with ONLY the documented change; grants/revokes preserved. Latest sources:
--   set_release_charges 0125 · add_release_charge 0125 · notify_staff 0085.
-- ============================================================

-- ------------------------------------------------------------
-- 1) consignee payment terms (ADR-0036) — default cash; existing rows backfill.
-- ------------------------------------------------------------
alter table public.consignees
  add column if not exists payment_terms text not null default 'cash'
  check (payment_terms in ('cash','credit'));

-- ------------------------------------------------------------
-- 2) bill document on the release.
-- ------------------------------------------------------------
alter table public.release_orders
  add column if not exists bill_doc_path text;

-- ------------------------------------------------------------
-- 3) notification FKs to release_orders (customer + staff).
-- ------------------------------------------------------------
alter table public.notifications
  add column if not exists release_order_id uuid references public.release_orders(id) on delete cascade;
alter table public.staff_notifications
  add column if not exists release_order_id uuid references public.release_orders(id) on delete cascade;

-- ------------------------------------------------------------
-- 4) set_release_charges — widened gate (cashier OR docs-desk), bill-doc param,
--    and editable-while-unpaid (supersedes the 0125 set-once lock per ADR-0036).
--    New 4-arg signature; drop the old 3-arg so every caller binds to this one.
-- ------------------------------------------------------------
drop function if exists public.set_release_charges(uuid, numeric, text);
create or replace function public.set_release_charges(
  p_id uuid, p_amount numeric, p_note text default null, p_bill_doc_path text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to set release charges.';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter a valid amount.'; end if;
  update public.release_orders
     set amount         = p_amount,
         charges_note   = nullif(trim(p_note), ''),
         charges_set_at = now(),
         status         = 'payable',
         bill_doc_path  = coalesce(nullif(p_bill_doc_path, ''), bill_doc_path)
   where id = p_id
     and (status = 'docs_verified'
          or (status = 'payable' and payment_status in ('unpaid', 'rejected')));
  if not found then
    raise exception 'Charges can be set on a verified release, or edited before it is paid.';
  end if;
end;
$$;
revoke all on function public.set_release_charges(uuid, numeric, text, text) from public, anon;
grant execute on function public.set_release_charges(uuid, numeric, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5) add_release_charge — same widened gate (cashier OR docs-desk).
--    (Recreated from 0125 verbatim; only the gate line changed.)
-- ------------------------------------------------------------
create or replace function public.add_release_charge(p_release uuid, p_label text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to add a release charge.';
  end if;
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

-- ------------------------------------------------------------
-- 6) void_release_charge — remove a mistaken additional charge while unpaid (T2-06).
-- ------------------------------------------------------------
create or replace function public.void_release_charge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('verify_release_docs') or public.has_permission('review_payments')) then
    raise exception 'You don''t have permission to remove a release charge.';
  end if;
  delete from public.release_supplements
   where id = p_id and payment_status in ('unpaid', 'rejected');
  if not found then
    raise exception 'Only an unpaid additional charge can be removed.';
  end if;
end;
$$;
revoke all on function public.void_release_charge(uuid) from public, anon;
grant execute on function public.void_release_charge(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7) Customer + cashier notifications on a release UPDATE (T2-03/04).
--    Mirrors notify_jo_change (0071) / notify_staff_payment (0085).
-- ------------------------------------------------------------
create or replace function public.notify_release_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text := coalesce(new.release_number, 'your release');
  v_kind  text;
  v_title text;
begin
  -- status transitions → customer
  if old.status is distinct from new.status then
    v_kind := null;
    if new.status = 'payable' then
      v_kind := 'release_payable';
      v_title := 'Your release bill is ready for ' || v_label
                 || coalesce(' — ₱' || trim(to_char(new.amount, 'FM999,999,990.00')), '');
    elsif new.status = 'on_hold' then
      v_kind := 'release_on_hold';
      v_title := 'KTC needs more info on ' || v_label || coalesce(' — “' || new.staff_note || '”', '');
    elsif new.status = 'released' then
      v_kind := 'release_released';
      v_title := v_label || ' is cleared for pull-out — OR ' || coalesce(new.or_number, 'issued');
    elsif new.status = 'cancelled' then
      v_kind := 'release_cancelled';
      v_title := v_label || ' was cancelled' || coalesce(' — “' || new.staff_note || '”', '');
    end if;
    if v_kind is not null then
      insert into public.notifications (customer_id, release_order_id, kind, title)
      values (new.customer_id, new.id, v_kind, v_title);
    end if;
  end if;

  -- payment transitions → customer + cashier
  if old.payment_status is distinct from new.payment_status then
    v_kind := null;
    if new.payment_status = 'rejected' then
      v_kind := 'release_rejected';
      v_title := 'Release payment needs attention on ' || v_label
                 || coalesce(' — “' || new.payment_note || '”', '');
    elsif new.payment_status = 'confirmed' then
      v_kind := 'release_confirmed';
      v_title := 'Release payment confirmed for ' || v_label;
    end if;
    if v_kind is not null then
      insert into public.notifications (customer_id, release_order_id, kind, title)
      values (new.customer_id, new.id, v_kind, v_title);
    end if;
    -- a fresh proof for the cashier to review
    if new.payment_status = 'submitted' then
      insert into public.staff_notifications (required_permission, kind, title, release_order_id)
      values ('review_payments', 'release_payment',
              'Release payment uploaded for ' || v_label, new.id);
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists release_orders_notify on public.release_orders;
create trigger release_orders_notify after update on public.release_orders
  for each row execute function public.notify_release_change();

-- ------------------------------------------------------------
-- 8) A filed release pings the documents desk.
-- ------------------------------------------------------------
create or replace function public.notify_staff_release_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff_notifications (required_permission, kind, title, release_order_id)
  values ('verify_release_docs', 'release_new',
          'New release filed: ' || coalesce(new.release_number, '')
          || coalesce(' (BL ' || new.bl_number || ')', ''), new.id);
  return new;
end;
$$;
drop trigger if exists release_orders_notify_staff_new on public.release_orders;
create trigger release_orders_notify_staff_new after insert on public.release_orders
  for each row execute function public.notify_staff_release_new();

-- ------------------------------------------------------------
-- 9) A supplement proof pings the cashier.
-- ------------------------------------------------------------
create or replace function public.notify_staff_release_supp_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  if new.payment_status = 'submitted' and old.payment_status is distinct from 'submitted' then
    select r.release_number into v_num from public.release_orders r where r.id = new.release_order_id;
    insert into public.staff_notifications (required_permission, kind, title, release_order_id)
    values ('review_payments', 'release_payment',
            'Release charge payment uploaded for ' || coalesce(v_num, 'a release'), new.release_order_id);
  end if;
  return new;
end;
$$;
drop trigger if exists release_supplements_notify_staff on public.release_supplements;
create trigger release_supplements_notify_staff after update on public.release_supplements
  for each row execute function public.notify_staff_release_supp_payment();

-- ------------------------------------------------------------
-- 10) Suspend/reject a customer → cancel their OPEN releases too (T2-05).
--     Skips paid/released and any release with in-flight supplement money.
--     (release_held_job_orders, 0153, only touched job_orders.)
-- ------------------------------------------------------------
create or replace function public.cancel_open_releases_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status in ('suspended', 'rejected') then
    update public.release_orders r
       set status = 'cancelled',
           staff_note = case when new.status = 'suspended'
             then 'Account suspended — release cancelled.'
             else 'Account not approved — release cancelled.' end
     where r.customer_id = new.id
       and r.status in ('submitted', 'docs_verified', 'payable')
       and r.payment_status is distinct from 'confirmed'
       and not exists (select 1 from public.release_supplements s
                       where s.release_order_id = r.id
                         and s.payment_status in ('submitted', 'confirmed'));
  end if;
  return new;
end;
$$;
drop trigger if exists customers_cancel_open_releases on public.customers;
create trigger customers_cancel_open_releases after update on public.customers
  for each row execute function public.cancel_open_releases_on_status();

-- ------------------------------------------------------------
-- 11) Storage: staff write the bill into release-docs/bills/*; the owning
--     customer can read their release's bill. (Staff READ already covered by
--     "staff reads release docs", 0124.)
-- ------------------------------------------------------------
drop policy if exists "staff writes release bill doc" on storage.objects;
create policy "staff writes release bill doc" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'release-docs'
              and (storage.foldername(name))[1] = 'bills'
              and (public.has_permission('verify_release_docs') or public.has_permission('review_payments')));

drop policy if exists "staff updates release bill doc" on storage.objects;
create policy "staff updates release bill doc" on storage.objects
  for update to authenticated
  using (bucket_id = 'release-docs'
         and (storage.foldername(name))[1] = 'bills'
         and (public.has_permission('verify_release_docs') or public.has_permission('review_payments')));

drop policy if exists "customer reads own release bill doc" on storage.objects;
create policy "customer reads own release bill doc" on storage.objects
  for select to authenticated
  using (bucket_id = 'release-docs'
         and (storage.foldername(name))[1] = 'bills'
         and name in (select bill_doc_path from public.release_orders
                      where customer_id = public.current_broker_id()));
