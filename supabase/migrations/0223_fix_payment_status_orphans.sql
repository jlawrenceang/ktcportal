-- ============================================================
-- 0223 — Fix the dropped-payment_status orphans the 0220 discovery missed
--        (pre-go-live test battery, CRITICAL + HIGH)
--
-- 0220's discovery query deliberately skipped plain `payment_status` (it's also a
-- valid column on charges/release_orders/payment_orders), so two job_orders readers
-- of the dropped column slipped through:
--   • notify_jo_change (trigger job_orders_notify) — its payment block reads
--     new.payment_status/payment_note → EVERY non-rexray job_order UPDATE errored
--     (record "old" has no field "payment_status"). CRITICAL: nothing could be
--     accepted/processed/cancelled/completed; the cashier couldn't confirm the
--     final charge (complete_jo_on_charge_confirmed → UPDATE job_orders → this
--     trigger → error → the whole confirm txn rolled back). Latent only because
--     prod has 0 orders. Fix: drop the payment block (payment is per-charge now).
--   • remind_unpaid_orders (cron) — `where jo.payment_status='unpaid'`. Fix: an
--     order is "unpaid" when it has a billed charge not yet confirmed.
-- Plus a small helper for the customer "needs attention" count (Home + BottomNav),
-- which can no longer be a single PostgREST .or() across job_orders → charges.
-- ============================================================

-- notify_jo_change — keep the STATUS notifications; drop the dead payment block.
create or replace function public.notify_jo_change()
returns trigger language plpgsql security definer set search_path = 'public' as $$
declare
  v_label text := coalesce(new.jo_number, nullif(new.entry_number, ''), 'your job order');
  v_kind text;
  v_title text;
begin
  if old.status is distinct from new.status then
    v_kind := null;
    if new.status = 'on_hold' then
      v_kind := 'on_hold'; v_title := 'KTC needs more info on ' || v_label || coalesce(' — “' || new.admin_note || '”', '');
    elsif new.status = 'rejected' then
      v_kind := 'rejected'; v_title := v_label || ' was rejected' || coalesce(' — “' || new.admin_note || '”', '');
    elsif new.status = 'processing' then
      v_kind := 'approved'; v_title := v_label || ' was approved and is now processing';
    elsif new.status = 'completed' then
      v_kind := 'completed'; v_title := v_label || ' is completed';
    end if;
    if v_kind is not null then
      insert into public.notifications (customer_id, job_order_id, kind, title)
      values (new.customer_id, new.id, v_kind, v_title);
    end if;
  end if;
  return new;
end;
$$;

-- remind_unpaid_orders — "unpaid" = a billed charge not yet confirmed (was job_orders.payment_status).
create or replace function public.remind_unpaid_orders()
returns integer language plpgsql security definer set search_path = 'public' as $$
declare n integer;
begin
  with due as (
    update public.job_orders jo
       set payment_reminded_at = now()
     where jo.status = 'processing'
       and jo.created_at < now() - interval '2 days'
       and (jo.payment_reminded_at is null or jo.payment_reminded_at < now() - interval '3 days')
       and exists (select 1 from public.charges c
                   where c.job_order_id = jo.id and c.bill_status = 'billed'
                     and c.payment_status not in ('confirmed','reversed'))
    returning jo.id, jo.customer_id,
              coalesce(jo.jo_number, nullif(jo.entry_number, ''), 'your job order') as label
  ),
  ins as (
    insert into public.notifications (customer_id, job_order_id, kind, title)
    select customer_id, id, 'payment_reminder',
           'Reminder: ' || label || ' is awaiting payment. Upload your payment slip to speed up processing.'
    from due
    returning 1
  )
  select count(*) into n from ins;
  return n;
end;
$$;

-- my_attention_count — the customer's orders needing attention: on_hold OR a rejected
-- charge proof (replaces the Home/BottomNav .or() that read the dropped payment_status).
create or replace function public.my_attention_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(distinct jo.id)::int
    from public.job_orders jo
   where jo.customer_id = public.current_broker_id()
     and (jo.status = 'on_hold'
          or exists (select 1 from public.charges c
                     where c.job_order_id = jo.id and c.payment_status = 'rejected'));
$$;
revoke all on function public.my_attention_count() from public, anon;
grant execute on function public.my_attention_count() to authenticated;

notify pgrst, 'reload schema';
