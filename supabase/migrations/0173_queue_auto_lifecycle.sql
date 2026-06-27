-- 0173: ADR-0035 phase 3 — automatic serving-number lifecycle (in/out of the line).
-- Active line = submitted + processing. Pulled out (on_hold / rejected / cancelled /
-- completed) → the serving number is vacated (→ 0, off the now-serving board). Back into
-- the line (un-hold / re-approve) → a NEW number at the tail: assign_serving_numbers is
-- idempotent, so an order already in the line keeps its place, while a RETURNING one
-- (whose number was vacated) gets a fresh tail number. Replaces the old rule (submitted
-- assigns, reject/cancel vacates, on_hold kept its place). Jumping the line is now ONLY
-- via the priority lane (phase 4), where the manual restore_serving_number retires.
-- The job_orders_serving trigger (0038, AFTER UPDATE OF status) already calls this fn.
create or replace function public.serving_numbers_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if new.status in ('submitted','processing') then
      perform public.assign_serving_numbers(new.id);                    -- enter / stay in the line
    elsif new.status in ('on_hold','rejected','cancelled','completed') then
      update public.serving_numbers set vacated_at = now()
        where job_order_id = new.id and vacated_at is null;             -- pulled out → 0
    end if;
  end if;
  return new;
end;
$$;
