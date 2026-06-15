-- ============================================================
-- 0082 — more customer notifications (owner, 2026-06-16)
--
-- Adds the high-value events the bell was missing now that emails are off by
-- default ([[emails-suspended-by-default]] — in-app notifications fire
-- regardless of that switch, so the bell is the only signal):
--   * account verified/approved (was email-only)
--   * RPS (port-services) assessment added to an order
--   * a new PINNED announcement on the bulletin board
-- (support-ticket replies are notified by the 0083 ticket migration.)
-- ============================================================

-- 1) Account verified/approved (customers.status -> approved).
create or replace function public.notify_account_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (new.id, null, 'account_approved',
            'Your account is verified — your held orders are now live.');
  end if;
  return new;
end;
$$;
drop trigger if exists customers_notify_approved on public.customers;
create trigger customers_notify_approved after update of status on public.customers
  for each row execute function public.notify_account_approved();

-- 2) RPS assessed as NEEDED → the customer has extra charges to review.
create or replace function public.notify_rps_assessed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text := coalesce(new.jo_number, nullif(new.entry_number, ''), 'your job order');
begin
  if new.rps_status = 'needed' and old.rps_status is distinct from 'needed' then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (new.customer_id, new.id, 'rps',
            'KTC added a port-services (RPS) assessment to ' || v_label || ' — view the charges.');
  end if;
  return new;
end;
$$;
drop trigger if exists job_orders_notify_rps on public.job_orders;
create trigger job_orders_notify_rps after update of rps_status on public.job_orders
  for each row execute function public.notify_rps_assessed();

-- 3) New PINNED + published bulletin → notify every (non-staff) customer.
--    Fires only on the transition INTO published+pinned, so editing a pinned
--    post later doesn't re-notify. Customer list is small; one row per customer.
create or replace function public.notify_bulletin_pinned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_published and new.pinned
     and not (coalesce(old.is_published, false) and coalesce(old.pinned, false)) then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    select c.id, null, 'announcement', 'New announcement: ' || new.title
    from public.customers c
    where c.is_admin is not true and c.is_owner is not true and c.staff_role is null;
  end if;
  return new;
end;
$$;
drop trigger if exists bulletin_notify_pinned on public.bulletin_posts;
create trigger bulletin_notify_pinned after insert or update on public.bulletin_posts
  for each row execute function public.notify_bulletin_pinned();
