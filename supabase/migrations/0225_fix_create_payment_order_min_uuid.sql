-- ============================================================
-- 0225 — Fix create_payment_order: min(uuid) does not exist (re-run battery, HIGH)
--
-- create_payment_order picked the single customer with `min(s.cust)` where s.cust is a
-- uuid — Postgres has NO min() aggregate for uuid, so EVERY call raised
-- 'function min(uuid) does not exist' (42883) right after the permission/non-empty guards.
-- The Payment Order bundling desk (PaymentOrderDesk → /admin/payment-orders + /app/payment-orders)
-- was therefore dead: a cashier could never bundle charges into an N:1 payment order, and
-- confirm/cancel_payment_order were unreachable. It failed CLOSED (no PO row, no charge
-- confirmed, no money moved) — which is why the money-safety probes passed — but it's a
-- shipped, routed feature that never worked. Latent since the spine landed (same min(uuid)
-- in 0206/0215/0222); the single-charge confirm path (record_charge_invoice →
-- confirm_charge_payment) is unaffected.
--
-- Fix: `n = count(distinct s.cust)` already proves exactly one customer; pick it with
-- (array_agg(distinct s.cust))[1] instead of the nonexistent min(uuid). Verbatim re-create
-- of the 0222 F1 body otherwise (reversed/confirmed exclusion preserved).
-- ============================================================

create or replace function public.create_payment_order(p_consignee uuid, p_charge_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_cust uuid; n int;
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to create a payment order.'; end if;
  if p_charge_ids is null or array_length(p_charge_ids,1) is null then raise exception 'Select at least one charge.'; end if;
  select count(distinct s.cust), (array_agg(distinct s.cust))[1] into n, v_cust
    from (
      select coalesce(j.customer_id, r.customer_id) as cust
        from public.charges c
        left join public.job_orders j     on j.id = c.job_order_id
        left join public.release_orders r on r.id = c.release_order_id
       where c.id = any(p_charge_ids)
    ) s;
  if n <> 1 then raise exception 'All charges in a payment order must belong to the same customer.' using errcode='check_violation'; end if;
  if exists (select 1 from public.charges c where c.id = any(p_charge_ids)
             and (c.bill_status <> 'billed' or c.payment_status in ('confirmed','reversed') or c.payment_order_id is not null)) then
    raise exception 'One or more charges can''t be bundled (already paid/reversed, unbilled, or in another payment order).' using errcode='check_violation';
  end if;
  insert into public.payment_orders (po_number, customer_id, consignee_id, created_by)
  values ('PO-' || lpad(nextval('payment_order_seq')::text, 6, '0'), v_cust, p_consignee, auth.uid())
  returning id into v_po;
  update public.charges set payment_order_id = v_po where id = any(p_charge_ids);
  return v_po;
end;
$$;
revoke all on function public.create_payment_order(uuid, uuid[]) from public, anon;
grant execute on function public.create_payment_order(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
