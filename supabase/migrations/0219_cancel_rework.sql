-- ============================================================
-- 0219 — Cancel rework (ADR-0037 Phase A cutover · Stage 2d)
--
-- Owner decisions 2026-06-29:
--   • A customer can no longer self-cancel once BILLING has moved on the order — but
--     since filing now always creates a (pristine) base charge, "billing has moved"
--     means a charge that is past pristine: a payment is in flight, an invoice was
--     recorded, or it's bundled into a payment order. A brand-new order (pristine
--     charges only) is still customer-cancellable before KTC accepts it.
--   • Cancelling an order outright is now an ADMIN-only action (none existed before),
--     with a required reason recorded to the job-order timeline.
-- ============================================================

-- customer self-cancel — open order, own, not a re-X-ray, and no billing in flight.
create or replace function public.cancel_job_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.job_orders%rowtype;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_row.is_rexray then raise exception 'This is an internal KTC re-X-ray and can''t be cancelled here.'; end if;
  if v_row.status not in ('held','submitted','on_hold') then
    raise exception 'This order can''t be cancelled anymore — it''s already being processed. Please contact KTC admin.';
  end if;
  -- block once any charge has moved past pristine (payment in flight / invoiced / bundled).
  if exists (select 1 from public.charges c
             where c.job_order_id = p_id
               and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)) then
    raise exception 'This order already has billing in progress — please contact KTC admin to cancel.'
      using errcode = 'check_violation';
  end if;
  update public.job_orders set status = 'cancelled' where id = p_id;
end;
$$;
revoke all on function public.cancel_job_order(uuid) from public, anon;
grant execute on function public.cancel_job_order(uuid) to authenticated;

-- admin-only cancel — any non-terminal order, with a recorded reason.
create or replace function public.admin_cancel_job_order(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Only an admin or the owner can cancel an order.';
  end if;
  if length(coalesce(trim(p_reason), '')) = 0 then
    raise exception 'A cancellation reason is required.' using errcode = 'check_violation';
  end if;
  select status into v_status from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('completed','cancelled','rejected') then
    raise exception 'This order is % — it can''t be cancelled.', v_status using errcode = 'check_violation';
  end if;
  update public.job_orders set status = 'cancelled' where id = p_id;
  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'cancelled', auth.uid(), jsonb_build_object('by','admin','reason',trim(p_reason)));
end;
$$;
revoke all on function public.admin_cancel_job_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_job_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';
