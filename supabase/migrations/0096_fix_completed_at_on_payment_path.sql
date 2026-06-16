-- ============================================================
-- 0096 — stamp completed_at on the payment-last completion path (owner, 2026-06-16)
--
-- complete_on_payment_confirmed (0087) is a BEFORE UPDATE OF payment_status
-- trigger that sets new.status='completed' in place. Because the SQL update
-- targets payment_status (not status), the `BEFORE UPDATE OF status` trigger
-- stamp_completed_at (0039) never fires on this path → completed_at stays NULL,
-- which breaks archive_done_orders + the unpaid-completed aging. Fix: stamp
-- completed_at directly in the same trigger. (The service-last path updates
-- status, so stamp_completed_at fires there — unaffected.)
-- ============================================================

create or replace function public.complete_on_payment_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed'
     and new.status in ('submitted','processing','on_hold')
     and public.jo_all_services_done(new.id) then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
