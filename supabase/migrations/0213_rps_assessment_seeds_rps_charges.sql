-- ============================================================
-- 0213 — RPS assessment seeds 'rps' charges (ADR-0037 Phase A cutover · Stage 1.2)
--
-- When a checker assesses RPS, the per-move quantities (rps_moves) now ALSO become
-- uniform `charges` rows (charge_type='rps') — one per move type, priced off the
-- ONE spine (per-consignee override → service_rates → move_rates) via the move_type
-- as the rate key, VATable, bill_status='billed', with a charge_audit entry.
--
-- ADDITIVE / NON-BREAKING: the legacy rps_status / rps_path / rps_moves / rps_payment_*
-- columns + the old submit_payment_proof('rps') / review_payment('rps') path are
-- untouched and still live. This only POPULATES the new charge layer so RPS shows on
-- the customer JobOrderCharges screen. The switch off the old RPS path is the Stage-2
-- flip. Mirrors 0212's money-safe re-seed: a (re)assessment rebuilds the 'rps' charges
-- from the new moves, but leaves them alone if any has payment/invoice in flight.
-- ============================================================

-- ---------- internal helper: (re)seed 'rps' charges from rps_moves ----------
create or replace function public.seed_rps_charges(p_jo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r           record;
  v_rate      numeric;
  v_charge    uuid;
  v_consignee uuid;
begin
  select consignee_id into v_consignee from public.job_orders where id = p_jo;
  if not found then return; end if;

  -- Money safety: if any existing 'rps' charge has moved past pristine (payment in
  -- flight, invoice recorded, or bundled), leave billing as-is for staff to reconcile.
  if exists (
    select 1 from public.charges c
     where c.job_order_id = p_jo and c.charge_type = 'rps'
       and (c.payment_status <> 'unpaid' or c.invoice_state <> 'draft' or c.payment_order_id is not null)
  ) then
    return;
  end if;

  -- Pristine: rebuild from the current assessment (handles re-assess + RPS-no-longer-needed).
  delete from public.charges where job_order_id = p_jo and charge_type = 'rps';

  for r in
    select m.move_type as mv, m.qty::numeric as qty
      from public.rps_moves m
     where m.job_order_id = p_jo and coalesce(m.qty, 0) > 0
  loop
    v_rate := public.effective_rate(v_consignee, r.mv);   -- move_type is the spine rate key
    insert into public.charges (job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, created_by)
    values (p_jo, 'rps', r.mv, r.qty, v_rate,
            case when v_rate is null then null else round(v_rate * r.qty, 2) end,
            true, 'billed', auth.uid())
    returning id into v_charge;
    perform public.log_charge_audit(v_charge, 'created',
      jsonb_build_object('type', 'rps', 'label', r.mv, 'qty', r.qty, 'auto', true));
  end loop;
end;
$$;
revoke all on function public.seed_rps_charges(uuid) from public, anon, authenticated;  -- internal only (definer-called)

-- ------------------------------------------------------------
-- record_rps_assessment — recreated from 0187 VERBATIM + the 'rps' charge seed
-- after the rps_moves are (re)written.
-- ------------------------------------------------------------
create or replace function public.record_rps_assessment(p_jo uuid, p_needed boolean, p_path text, p_moves jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.has_permission('assess_rps') then
    raise exception 'You don''t have permission to assess RPS.';
  end if;
  -- KTC-15: only an open order can be (re)assessed.
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — RPS can only be assessed on an open order.', v_status
      using errcode = 'check_violation';
  end if;
  update public.job_orders
     set rps_status = case when p_needed then 'needed' else 'not_needed' end,
         rps_path = p_path,
         rps_assessed_at = now(),
         rps_assessed_by = auth.uid(),
         -- KTC-14: a (re)assessment invalidates any prior RPS payment so a stale
         -- confirm can't carry over to the new charge.
         rps_payment_status = 'unpaid',
         rps_payment_proof_path = null,
         rps_payment_submitted_at = null,
         rps_payment_confirmed_at = null,
         rps_payment_note = null
   where id = p_jo;
  delete from public.rps_moves where job_order_id = p_jo;
  if p_needed and p_moves is not null then
    insert into public.rps_moves (job_order_id, move_type, qty)
    select p_jo, key, value::int from jsonb_each_text(p_moves) where coalesce(value, '0')::int > 0;
  end if;

  -- 0213: mirror the assessment onto the new charge layer (additive).
  perform public.seed_rps_charges(p_jo);
end;
$$;
revoke all on function public.record_rps_assessment(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.record_rps_assessment(uuid, boolean, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
