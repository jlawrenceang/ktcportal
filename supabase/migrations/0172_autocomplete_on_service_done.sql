-- 0172: ADR-0035 phase 2 — make completion fully automatic (services-last path).
-- complete_on_payment_confirmed (0097) already auto-completes when the base/RPS
-- payment is confirmed LAST. The mirror case — payment already confirmed and the
-- LAST service marked done — wasn't covered, because that trigger only watches the
-- payment columns; those orders still needed the manual "Mark completed" button.
-- This fires on a service-completion insert and completes the order if it's now fully
-- ready (jo_ready_to_complete = all services done + base payment + any RPS). With both
-- triggers, completion is automatic regardless of which gate clears last.
create or replace function public.complete_on_service_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.jo_ready_to_complete(new.job_order_id) then
    update public.job_orders
       set status = 'completed', completed_at = coalesce(completed_at, now())
     where id = new.job_order_id and status in ('submitted','processing','on_hold');
  end if;
  return new;
end;
$$;
-- AFTER INSERT (the new completion row is visible to jo_all_services_done). The
-- completed-row carryover inserts (sync_completions_on_complete) re-fire this, but the
-- status guard makes that a no-op — no recursion.
drop trigger if exists service_completions_autocomplete on public.service_completions;
create trigger service_completions_autocomplete
  after insert on public.service_completions
  for each row execute function public.complete_on_service_done();
