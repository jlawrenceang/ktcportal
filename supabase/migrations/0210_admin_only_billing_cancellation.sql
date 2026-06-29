-- ============================================================
-- 0210 — Cancellation is ADMIN-ONLY for billing/payment (owner 2026-06-29)
--
-- Rule: cancelling a charge, a payment order, or undoing a confirmed payment is
-- admin-only (anti-fraud — a non-admin can't make money disappear). A customer may
-- still cancel their OWN job order, but only before it carries billing (enforced on
-- the JO-cancel path at the M4 cutover). reverse_charge (confirmed → reversed) is
-- already admin/owner. This adds the two missing billing-cancel paths.
-- ============================================================

-- allow a cancelled charge (voided before payment; distinct from reversed-after-pay)
alter table public.charges drop constraint if exists charges_bill_status_check;
alter table public.charges add constraint charges_bill_status_check
  check (bill_status in ('proposed','billed','cancelled'));

-- Cancel (void) an UNCONFIRMED charge — admin/owner only. A confirmed charge must
-- be reversed (reverse_charge), not cancelled.
create or replace function public.cancel_charge(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay text;
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Only an admin or the owner can cancel a charge.';
  end if;
  if length(coalesce(trim(p_reason),'')) = 0 then raise exception 'A cancellation reason is required.' using errcode='check_violation'; end if;
  select payment_status into v_pay from public.charges where id = p_charge and bill_status in ('proposed','billed') for update;
  if not found then raise exception 'No active charge to cancel.'; end if;
  if v_pay = 'confirmed' then raise exception 'This charge is already paid — reverse it instead of cancelling.' using errcode='check_violation'; end if;
  update public.charges
     set bill_status = 'cancelled', payment_order_id = null,
         payment_note = 'CANCELLED: ' || trim(p_reason)
   where id = p_charge;
  perform public.log_charge_audit(p_charge, 'cancelled', jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Cancel a payment order — admin/owner only. Dissolves an un-collected bundle (its
-- charges return to unbundled, still owed). A COLLECTED order must be unwound by
-- reversing its charges, not cancelled here.
create or replace function public.cancel_payment_order(p_po uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Only an admin or the owner can cancel a payment order.';
  end if;
  if length(coalesce(trim(p_reason),'')) = 0 then raise exception 'A cancellation reason is required.' using errcode='check_violation'; end if;
  select status into v_status from public.payment_orders where id = p_po for update;
  if not found then raise exception 'Payment order not found.'; end if;
  if v_status = 'collected' then
    raise exception 'This payment order is already collected — reverse its charges instead.' using errcode='check_violation';
  end if;
  update public.charges set payment_order_id = null where payment_order_id = p_po;   -- charges return to unbundled
  update public.payment_orders set status = 'cancelled', payment_note = 'CANCELLED: ' || trim(p_reason) where id = p_po;
end;
$$;

revoke all on function public.cancel_charge(uuid, text)        from public, anon;
revoke all on function public.cancel_payment_order(uuid, text) from public, anon;
grant execute on function public.cancel_charge(uuid, text)        to authenticated;
grant execute on function public.cancel_payment_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';
