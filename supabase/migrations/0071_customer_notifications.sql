-- ============================================================
-- 0071 — customer notifications (owner, 2026-06-15)
--
-- In-app notifications for CUSTOMERS (staff notifications are a separate
-- concern, later). Fired by triggers on the events a customer cares about:
-- a KTC reply (comment), info needed (on_hold), rejection, payment issue,
-- approval, completion. Shown as a notification bar on the Home dashboard
-- with read/unread tracking. Triggers/RPC write; customers read their own.
-- ============================================================

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  job_order_id  uuid references public.job_orders(id) on delete cascade,
  kind          text not null,   -- comment|on_hold|rejected|approved|completed|payment_rejected|payment_confirmed
  title         text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists notifications_unread_idx
  on public.notifications (customer_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
-- Customers read their own; writes go through the definer triggers + RPC.
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (customer_id = public.current_broker_id());

-- ---- status / payment transitions → notification ----
create or replace function public.notify_jo_change()
returns trigger language plpgsql security definer set search_path = public as $$
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

  if old.payment_status is distinct from new.payment_status then
    v_kind := null;
    if new.payment_status = 'rejected' then
      v_kind := 'payment_rejected'; v_title := 'Payment needs attention on ' || v_label || coalesce(' — “' || new.payment_note || '”', '');
    elsif new.payment_status = 'confirmed' then
      v_kind := 'payment_confirmed'; v_title := 'Payment confirmed for ' || v_label;
    end if;
    if v_kind is not null then
      insert into public.notifications (customer_id, job_order_id, kind, title)
      values (new.customer_id, new.id, v_kind, v_title);
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists job_orders_notify on public.job_orders;
create trigger job_orders_notify after update on public.job_orders
  for each row execute function public.notify_jo_change();

-- ---- a KTC comment (not the customer's own) → notification ----
create or replace function public.notify_jo_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cust uuid;
  v_owner_uid uuid;
  v_label text;
begin
  if new.event <> 'comment' then return new; end if;
  select jo.customer_id, c.user_id, coalesce(jo.jo_number, nullif(jo.entry_number, ''), 'your job order')
    into v_cust, v_owner_uid, v_label
  from public.job_orders jo
  join public.customers c on c.id = jo.customer_id
  where jo.id = new.job_order_id;
  -- only when the comment is from KTC (actor is not the order's own customer)
  if v_cust is not null and new.actor is distinct from v_owner_uid then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (v_cust, new.job_order_id, 'comment', 'KTC replied on ' || v_label);
  end if;
  return new;
end;
$$;
drop trigger if exists job_order_events_notify on public.job_order_events;
create trigger job_order_events_notify after insert on public.job_order_events
  for each row execute function public.notify_jo_comment();

-- ---- mark read (all, or specific ids) ----
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where customer_id = public.current_broker_id()
    and read_at is null
    and (p_ids is null or id = any(p_ids));
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
