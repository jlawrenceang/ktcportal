-- 0165: clear_read_notifications — lets a customer remove their already-read
-- notifications (the bell's "Clear read"), keeping unread ones intact. Scoped to
-- the caller's own rows via current_broker_id(), mirroring mark_notifications_read.
create or replace function public.clear_read_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications
  where customer_id = public.current_broker_id()
    and read_at is not null;
$$;
revoke all on function public.clear_read_notifications() from public, anon;
grant execute on function public.clear_read_notifications() to authenticated;
