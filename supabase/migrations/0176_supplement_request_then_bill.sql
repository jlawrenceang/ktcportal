-- 0176: ADR-0035 phase 6 — additional-service request (ops requests, cashier bills).
-- Operations can REQUEST an extra charge/service but no longer bill it; the cashier
-- reviews the request, sets the amount, and bills it (creates the payable). Direct
-- add-and-bill is re-gated from process_job_orders (ops) to the cashier's money lane.

alter table public.jo_supplements add column if not exists bill_status text
  not null default 'billed' check (bill_status in ('requested','billed'));

-- request a charge (operations) — label only, no amount, not yet a payable.
create or replace function public.request_supplement(p_jo uuid, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_n int; v_id uuid; v_status text;
begin
  if not public.has_permission('request_supplement') then
    raise exception 'You don''t have permission to request a charge.';
  end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'Describe the charge / service.'; end if;
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected','held') then raise exception 'Can''t add a charge to a % order.', v_status; end if;
  select count(*) into v_n from public.jo_supplements where job_order_id = p_jo;
  if v_n >= 26 then raise exception 'Too many supplements on this order.'; end if;
  insert into public.jo_supplements (job_order_id, suffix, label, amount, bill_status, created_by)
    values (p_jo, chr(65 + v_n), trim(p_label), null, 'requested', auth.uid())
    returning id into v_id;
  perform public.log_jo_event(p_jo, 'supplement_requested', jsonb_build_object('label', trim(p_label)));
  return v_id;
end;
$$;
revoke all on function public.request_supplement(uuid, text) from public, anon;
grant execute on function public.request_supplement(uuid, text) to authenticated;

-- bill a requested charge (cashier) — set the amount → payable + notify the customer.
create or replace function public.bill_supplement(p_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_jo uuid; v_label text; v_status text;
begin
  if not public.has_permission('bill_supplement') then
    raise exception 'You don''t have permission to bill a charge.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a charge amount greater than zero.'; end if;
  select s.job_order_id, s.label into v_jo, v_label from public.jo_supplements s
    where s.id = p_id and s.bill_status = 'requested' for update;
  if not found then raise exception 'Charge request not found (or already billed).'; end if;
  update public.jo_supplements set amount = p_amount, bill_status = 'billed' where id = p_id;
  select status into v_status from public.job_orders where id = v_jo for update;
  if v_status = 'completed' then
    update public.job_orders set status = 'processing', completed_at = null where id = v_jo;
  end if;
  perform public.log_jo_event(v_jo, 'supplement_billed', jsonb_build_object('label', v_label, 'amount', p_amount));
  insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, v_jo, 'rps',
           'An additional charge (' || v_label || ') was added to ' || coalesce(jo_number, 'your job order') ||
           ' — please settle it to proceed.'
    from public.job_orders where id = v_jo;
end;
$$;
revoke all on function public.bill_supplement(uuid, numeric) from public, anon;
grant execute on function public.bill_supplement(uuid, numeric) to authenticated;

-- direct add-and-bill (cashier / admin) — re-gated from process_job_orders to the money
-- lane (bill_supplement); marks the supplement billed immediately.
create or replace function public.add_supplement(p_jo uuid, p_label text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_n int; v_suffix text; v_id uuid; v_status text;
begin
  if not public.has_permission('bill_supplement') then
    raise exception 'You don''t have permission to add a charge.';
  end if;
  if length(coalesce(trim(p_label), '')) = 0 then raise exception 'Enter a charge label.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a charge amount greater than zero.'; end if;
  select status into v_status from public.job_orders where id = p_jo for update;
  if not found then raise exception 'Job order not found.'; end if;
  if v_status in ('cancelled','rejected','held') then raise exception 'Can''t add a charge to a % order.', v_status; end if;
  select count(*) into v_n from public.jo_supplements where job_order_id = p_jo;
  if v_n >= 26 then raise exception 'Too many supplements on this order.'; end if;
  v_suffix := chr(65 + v_n);
  insert into public.jo_supplements (job_order_id, suffix, label, amount, bill_status, created_by)
    values (p_jo, v_suffix, trim(p_label), p_amount, 'billed', auth.uid())
    returning id into v_id;
  if v_status = 'completed' then
    update public.job_orders set status = 'processing', completed_at = null where id = p_jo;
  end if;
  perform public.log_jo_event(p_jo, 'supplement_added',
    jsonb_build_object('suffix', v_suffix, 'label', trim(p_label), 'amount', p_amount));
  insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, p_jo, 'rps',
           'An additional charge (' || trim(p_label) || ') was added to ' || coalesce(jo_number, 'your job order') ||
           ' — please settle it to proceed.'
    from public.job_orders where id = p_jo;
  return v_id;
end;
$$;

-- permissions: operations requests; cashier bills; admin both.
insert into public.role_permissions (role, permission, allowed, updated_at) values
  ('operations','request_supplement',true,now()), ('admin','request_supplement',true,now()),
  ('cashier','bill_supplement',true,now()), ('admin','bill_supplement',true,now())
on conflict (role, permission) do update set allowed = excluded.allowed, updated_at = now();

notify pgrst, 'reload schema';
