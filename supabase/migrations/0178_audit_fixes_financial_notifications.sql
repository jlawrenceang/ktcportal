-- 0178: whole-app-audit fixes — financial-integrity, notification, and maker-checker
-- holes (several introduced by the ADR-0035 ops overhaul, 0170-0177).
--   (1) record_office_payment bypassed the 0177 invoice gate (walk-in base payment
--       marked PAID with no ERP/BIR invoice) — now gated the same as review_payment.
--   (2) confirm_release_payment could resurrect a CANCELLED release back to 'paid'
--       (only a 'submitted' payment was checked, not the status) — now requires 'payable'.
--   (3) staff_only internal notes pinged the customer (notify_jo_comment ignored
--       visibility) — now skipped.
--   (4) re-X-ray child orders leaked customer notifications (status + serving) for an
--       internal order they can't see — now suppressed.
--   (5) a re-X-ray child could be force-accepted via accept_orders, skipping the
--       approve_rexray maker-checker and orphaning it off the serving lane — now blocked.
--   (6) guard_job_order_consignee_approved (0169) missed its definer-fn revoke (fails
--       check-security-invariants) — revoked here, with the other touched trigger fns.

-- (1) office/walk-in BASE payment now also needs the ERP service invoice + BIR pad serial.
create or replace function public.record_office_payment(p_id uuid, p_kind text default 'base', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_inv text; v_pad text;
begin
  if not public.has_permission('review_payments') then
    raise exception 'You don''t have permission to record payments.';
  end if;
  if p_kind not in ('base','rps') then raise exception 'Unknown payment kind %.', p_kind; end if;
  if p_kind = 'rps' then
    select rps_payment_status into v_status from public.job_orders where id = p_id for update;
  else
    select payment_status, service_invoice_no, invoice_pad_no into v_status, v_inv, v_pad
      from public.job_orders where id = p_id for update;
  end if;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status = 'confirmed' then raise exception 'This payment is already confirmed.'; end if;
  if p_kind <> 'rps' and (coalesce(trim(v_inv), '') = '' or coalesce(trim(v_pad), '') = '') then
    raise exception 'Record the ERP service invoice + BIR pad serial before confirming the payment.'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'rps' then
    update public.job_orders set rps_payment_status='confirmed', rps_payment_confirmed_at=now(), rps_payment_note=null where id=p_id;
  else
    update public.job_orders set payment_status='confirmed', payment_confirmed_at=now(), payment_note=null where id=p_id;
  end if;
  perform public.log_jo_event(p_id, 'payment_office', jsonb_build_object('kind', p_kind, 'note', nullif(trim(coalesce(p_note,'')),'')));
end;
$$;

-- (2) only a PAYABLE release can be confirmed to 'paid' (no reviving a cancelled one).
create or replace function public.confirm_release_payment(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('review_payments') then raise exception 'You don''t have permission to review payments.'; end if;
  if not p_ok and length(coalesce(trim(p_note), '')) = 0 then
    raise exception 'Add a note telling the customer why the payment was rejected.';
  end if;
  update public.release_orders
     set payment_status       = case when p_ok then 'confirmed' else 'rejected' end,
         payment_confirmed_at = case when p_ok then now() else payment_confirmed_at end,
         payment_note         = case when p_ok then null else nullif(trim(p_note), '') end,
         status               = case when p_ok then 'paid' else status end
   where id = p_id and payment_status = 'submitted' and status = 'payable';
  if not found then raise exception 'There is no payment to review for this release (it may have been cancelled).'; end if;
end;
$$;

-- (3) staff-only internal notes must NOT notify the customer.
create or replace function public.notify_jo_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_owner_uid uuid; v_label text;
begin
  if new.event <> 'comment' then return new; end if;
  if new.visibility = 'staff_only' then return new; end if;
  select jo.customer_id, c.user_id, coalesce(jo.jo_number, nullif(jo.entry_number, ''), 'your job order')
    into v_cust, v_owner_uid, v_label
  from public.job_orders jo join public.customers c on c.id = jo.customer_id
  where jo.id = new.job_order_id;
  if v_cust is not null and new.actor is distinct from v_owner_uid then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (v_cust, new.job_order_id, 'comment', 'KTC replied on ' || v_label);
  end if;
  return new;
end;
$$;

-- (4a) serving-number notification skips re-X-ray children.
create or replace function public.notify_serving_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_label text; v_is_rexray boolean;
begin
  select customer_id, coalesce(jo_number, nullif(entry_number, ''), 'your job order'), is_rexray
    into v_cust, v_label, v_is_rexray
  from public.job_orders where id = new.job_order_id;
  if v_cust is not null and not coalesce(v_is_rexray, false) then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (v_cust, new.job_order_id, 'serving',
            'Serving number for ' || v_label || ' (' || new.service_line || ' line): #' || new.serving_no);
  end if;
  return new;
end;
$$;

-- (4b) status-change notifications skip re-X-ray children (trigger WHEN clause).
drop trigger if exists job_orders_notify on public.job_orders;
create trigger job_orders_notify after update on public.job_orders
  for each row when (new.is_rexray is not true)
  execute function public.notify_jo_change();

-- (5) a re-X-ray child can't be accepted via the generic accept_orders path.
create or replace function public.staff_transition_order(p_id uuid, p_status text, p_note text default null, p_recoverable boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cur text; v_is_rexray boolean;
  v_gate text := case p_status
    when 'processing' then 'accept_orders'
    when 'completed'  then 'complete_orders'
    when 'on_hold'    then 'hold_reject_orders'
    when 'rejected'   then 'hold_reject_orders'
    else null end;
begin
  if v_gate is null then raise exception 'Unsupported transition to %.', p_status; end if;
  if not public.has_permission(v_gate) then raise exception 'You don''t have permission for this action.'; end if;
  select status, is_rexray into v_cur, v_is_rexray from public.job_orders where id = p_id for update;
  if not found then raise exception 'Job order not found.'; end if;
  if coalesce(v_is_rexray, false) and p_status = 'processing' then
    raise exception 'Use "Approve re-X-ray" to approve a re-X-ray request.';
  end if;
  if p_status = 'processing' and v_cur not in ('submitted','on_hold') then
    raise exception 'Only a submitted or on-hold order can be accepted.';
  elsif p_status in ('on_hold','rejected') and v_cur not in ('submitted','processing','on_hold') then
    raise exception 'This order can''t be held or rejected now.';
  elsif p_status = 'completed' then
    if v_cur not in ('submitted','processing','on_hold') then raise exception 'Only an open order can be completed.'; end if;
    if not public.jo_ready_to_complete(p_id) then
      raise exception 'Can''t complete yet — every service, the base payment, and any RPS charge must all be cleared.';
    end if;
  end if;
  update public.job_orders
  set status = p_status, admin_note = coalesce(p_note, admin_note),
      rejected_recoverable = case when p_status = 'rejected' then false else rejected_recoverable end,
      needs_fields = case when p_status = 'on_hold' then needs_fields else null end
  where id = p_id;
end;
$$;

-- (6) definer trigger functions must not be EXECUTE-able by callers (0105 invariant).
revoke all on function public.notify_jo_comment() from public, anon, authenticated;
revoke all on function public.notify_serving_assigned() from public, anon, authenticated;
revoke all on function public.notify_jo_change() from public, anon, authenticated;
revoke all on function public.guard_job_order_consignee_approved() from public, anon, authenticated;
