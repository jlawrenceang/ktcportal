-- ============================================================
-- 0216 — One-rule completion, reading charges (ADR-0037 Phase A cutover · Stage 2a)
--
-- The flip: a Job Order completes from EXACTLY ONE rule, in one place —
--   all services done  AND  every billed charge is paid (or reversed).
-- The old base-payment / RPS / supplement clauses (job_orders.payment_status,
-- rps_payment_status, jo_supplements) are gone — the new `charges` layer is the
-- single source of truth. A free re-X-ray needs no special case: it simply has no
-- charges, so the "no billed unconfirmed charge" test passes.
--
-- RUTHLESS cutover (owner 2026-06-29: break the old path, endpoint matters): the old
-- job_orders.payment_status auto-complete trigger is retired and replaced by a charges
-- trigger that completes a JO the moment its last charge is confirmed.
-- ============================================================

-- the single completion oracle: services done + nothing billed-but-unpaid.
create or replace function public.jo_ready_to_complete(p_jo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.jo_all_services_done(p_jo)
     and not exists (
       select 1 from public.charges c
        where c.job_order_id = p_jo
          and c.bill_status = 'billed'
          and c.payment_status not in ('confirmed','reversed'));
$$;
revoke all on function public.jo_ready_to_complete(uuid) from public, anon, authenticated;

-- the raw-UPDATE backstop (BEFORE UPDATE OF status, trigger job_orders_zzz_enforce_complete)
-- must agree — same single rule, read inline from new.id.
create or replace function public.enforce_two_gate_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not (public.jo_all_services_done(new.id)
            and not exists (select 1 from public.charges c
                            where c.job_order_id = new.id
                              and c.bill_status = 'billed'
                              and c.payment_status not in ('confirmed','reversed'))) then
      raise exception 'Cannot complete — every service must be done and every billed charge paid.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- NEW auto-complete: confirming a charge completes its Job Order if it is now ready.
-- (Replaces complete_on_payment_confirmed, which fired on the retired job_orders.payment_status.)
create or replace function public.complete_jo_on_charge_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed'
     and new.job_order_id is not null then
    if public.jo_ready_to_complete(new.job_order_id) then
      update public.job_orders
         set status = 'completed', completed_at = coalesce(completed_at, now())
       where id = new.job_order_id and status in ('submitted','processing','on_hold');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists charges_autocomplete on public.charges;
create trigger charges_autocomplete after update of payment_status on public.charges
  for each row execute function public.complete_jo_on_charge_confirmed();

-- retire the old payment-column auto-complete trigger (job_orders.payment_status is being dropped).
drop trigger if exists job_orders_complete_on_payment on public.job_orders;

notify pgrst, 'reload schema';
