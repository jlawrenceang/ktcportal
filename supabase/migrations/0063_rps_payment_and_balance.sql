-- ============================================================
-- 0063 — separate RPS payment + running balance (owner model 2026-06-13)
--
-- A JO now carries up to two payable components, each settled on its own:
--   * base   = X-ray charges (the existing payment_* columns)
--   * rps    = port-services moves, only once operations assesses "needs RPS"
-- The pay page shows Total = base + RPS, Paid = confirmed components, and
-- Balance due = Total − Paid (pay the X-ray now, the RPS later — or both at
-- once if both are already generated).
--
-- "Cleared for release" is derived in the app (X-ray done AND balance 0) — no
-- new tracking, per the owner's "for now, when X-ray + payment are done".
--
-- submit_payment_proof / review_payment gain p_kind ('base' default | 'rps')
-- so one pair of RPCs handles both components; the payment-slips bucket is
-- reused (a `-rps` suffix on the path).
-- ============================================================

-- 1) RPS payment state (mirrors the base payment_* columns).
alter table public.job_orders add column if not exists rps_payment_status text not null default 'unpaid'
  check (rps_payment_status in ('unpaid','submitted','confirmed','rejected'));
alter table public.job_orders add column if not exists rps_payment_proof_path text;
alter table public.job_orders add column if not exists rps_payment_submitted_at timestamptz;
alter table public.job_orders add column if not exists rps_payment_confirmed_at timestamptz;
alter table public.job_orders add column if not exists rps_payment_note text;

-- 2) submit_payment_proof gains p_kind ('base' | 'rps').
drop function if exists public.submit_payment_proof(uuid, text);
create or replace function public.submit_payment_proof(p_id uuid, p_path text, p_kind text default 'base')
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
  if p_kind = 'rps' then
    if v_row.rps_status <> 'needed' then raise exception 'No RPS charge is due on this order.'; end if;
    if v_row.rps_payment_status = 'confirmed' then raise exception 'The RPS payment is already confirmed.'; end if;
    update public.job_orders
       set rps_payment_status = 'submitted', rps_payment_proof_path = p_path,
           rps_payment_submitted_at = now(), rps_payment_note = null
     where id = p_id;
  else
    if v_row.payment_status = 'confirmed' then raise exception 'Payment for this order is already confirmed.'; end if;
    update public.job_orders
       set payment_status = 'submitted', payment_proof_path = p_path,
           payment_submitted_at = now(), payment_note = null
     where id = p_id;
  end if;
end;
$$;

-- 3) review_payment gains p_kind.
drop function if exists public.review_payment(uuid, boolean, text);
create or replace function public.review_payment(p_id uuid, p_confirm boolean, p_note text default null, p_kind text default 'base')
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to review payments.';
  end if;
  if p_kind = 'rps' then
    select rps_payment_status into v_status from public.job_orders where id = p_id for update;
  else
    select payment_status into v_status from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status <> 'submitted' then
    raise exception 'No submitted payment proof to review (current: %).', v_status;
  end if;
  if not p_confirm and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why (e.g. wrong amount, unclear slip).' using errcode = 'check_violation';
  end if;
  if p_kind = 'rps' then
    update public.job_orders
       set rps_payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
           rps_payment_confirmed_at = case when p_confirm then now() else null end,
           rps_payment_note = case when p_confirm then null else trim(p_note) end
     where id = p_id;
  else
    update public.job_orders
       set payment_status = case when p_confirm then 'confirmed' else 'rejected' end,
           payment_confirmed_at = case when p_confirm then now() else null end,
           payment_note = case when p_confirm then null else trim(p_note) end
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.submit_payment_proof(uuid, text, text) from public, anon;
revoke all on function public.review_payment(uuid, boolean, text, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;
grant execute on function public.review_payment(uuid, boolean, text, text) to authenticated;
