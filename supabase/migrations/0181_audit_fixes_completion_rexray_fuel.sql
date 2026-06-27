-- 0181: whole-app-audit fixes (batch 2) — completion gate, re-X-ray guards, fuel RLS.
--   (#283) 0175 dropped the supplement clause from jo_ready_to_complete while the
--          enforce_two_gate_complete guard still checked ALL supplements — so confirming
--          the last X-ray / a supplement payment on an order with any other unpaid
--          supplement errored out (check_violation) and rolled back. Both now gate on
--          BILLED-unpaid supplements only (a 'requested', un-priced charge never blocks).
--   (#360) record_van_xray let a checker X-ray (and free-auto-complete) a re-X-ray child
--          before admin approval; approving afterwards knocked the completed order back to
--          processing. Now blocked until rexray_status='approved'.
--   (#258) a customer could cancel a KTC-initiated re-X-ray child via cancel_job_order
--          (UI-only hidden). Backend now refuses (backend-enforced access).
--   (#294/#415) fuel_setting_at/fuel_rate_at were PUBLIC-executable definer fns (anon could
--          read diesel price/rates past RLS); jo_ready_to_complete likewise an open oracle.
--          Revoked.

-- (#283) completion readiness — billed-unpaid supplements gate; requested ones do not.
create or replace function public.jo_ready_to_complete(p_jo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.jo_all_services_done(p_jo)
     and (select case
                   when jo.is_rexray and not jo.rexray_billable then true
                   else jo.payment_status = 'confirmed'
                        and (jo.rps_status <> 'needed' or jo.rps_payment_status = 'confirmed')
                 end
          from public.job_orders jo where jo.id = p_jo)
     and not exists (select 1 from public.jo_supplements s
                     where s.job_order_id = p_jo and s.bill_status = 'billed' and s.payment_status <> 'confirmed');
$$;
-- (#415) internal completion oracle — not callable by anon/authenticated (definer callers run as owner).
revoke all on function public.jo_ready_to_complete(uuid) from public, anon, authenticated;

-- (#283) the UPDATE guard must agree — billed-unpaid only (was: any supplement <> confirmed).
create or replace function public.enforce_two_gate_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not (public.jo_all_services_done(new.id)
            and new.payment_status = 'confirmed'
            and (new.rps_status <> 'needed' or new.rps_payment_status = 'confirmed')
            and not exists (select 1 from public.jo_supplements s
                            where s.job_order_id = new.id and s.bill_status = 'billed' and s.payment_status <> 'confirmed')) then
      raise exception 'Cannot complete — services, base payment, RPS, and all billed charges must be cleared.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- (#360) a re-X-ray child can't be X-rayed until admin approves it (rexray_status='approved').
create or replace function public.record_van_xray(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jo uuid; v_svc text; v_status text; v_remaining int;
  v_is_rexray boolean; v_rexray_status text;
  v_signer text := (select full_name from public.customers where user_id = auth.uid());
begin
  if not public.has_permission('confirm_xray') then
    raise exception 'You don''t have permission to confirm X-ray.';
  end if;
  select l.job_order_id, l.service_request into v_jo, v_svc
    from public.job_order_lines l where l.id = p_line_id;
  if v_jo is null then raise exception 'Container line not found.'; end if;
  if public.service_line_of(v_svc) <> 'xray' then
    raise exception 'This container does not need X-ray.';
  end if;
  select status, is_rexray, rexray_status into v_status, v_is_rexray, v_rexray_status
    from public.job_orders where id = v_jo for update;
  if v_status not in ('submitted','processing','on_hold') then
    raise exception 'This order is % — only open orders can be confirmed.', v_status;
  end if;
  if coalesce(v_is_rexray, false) and coalesce(v_rexray_status, '') <> 'approved' then
    raise exception 'This re-X-ray hasn''t been approved by an admin yet.';
  end if;
  update public.job_order_lines
    set xray_done_at      = coalesce(xray_done_at, now()),
        xray_done_by      = coalesce(xray_done_by, auth.uid()),
        xray_done_by_name = coalesce(xray_done_by_name, v_signer)
    where id = p_line_id;
  select count(*) into v_remaining
    from public.job_order_lines l
    where l.job_order_id = v_jo
      and public.service_line_of(l.service_request) = 'xray'
      and l.xray_done_at is null;
  if v_remaining = 0 then
    perform public.record_service_done(v_jo, 'xray', now());
  elsif v_status = 'submitted' then
    update public.job_orders set status = 'processing' where id = v_jo;
  end if;
end;
$$;

-- (#258) a customer can't cancel an internal KTC re-X-ray child (backend-enforced, not UI-only).
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
  update public.job_orders set status = 'cancelled' where id = p_id;
end;
$$;

-- (#294) fuel helpers bypass RLS (definer) — strip anon/PUBLIC; authenticated keeps it
-- for the security_invoker reporting views.
revoke all on function public.fuel_setting_at(text, date) from public, anon;
revoke all on function public.fuel_rate_at(text, uuid, date) from public, anon;
grant execute on function public.fuel_setting_at(text, date) to authenticated;
grant execute on function public.fuel_rate_at(text, uuid, date) to authenticated;
