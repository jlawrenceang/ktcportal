-- ============================================================
-- 0019 — order caps for both broker states.
--   * pending broker: at most 10 'held' orders (unchanged from 0017).
--   * approved broker: at most 10 OPEN orders (status submitted|processing)
--     at once; the 11th is blocked with "contact admin". Completed/cancelled
--     orders don't count, so slots free up as work finishes.
-- Generalizes 0017's enforce_held_cap into enforce_order_caps.
-- ============================================================

create or replace function public.enforce_order_caps()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if new.status = 'held' then
    select count(*) into cnt from public.job_orders
      where broker_id = new.broker_id and status = 'held';
    if cnt >= 10 then
      raise exception 'You can keep at most 10 job orders on hold until your account is verified. Upload your valid ID to get verified.'
        using errcode = 'check_violation';
    end if;
  elsif new.status in ('submitted','processing') then
    select count(*) into cnt from public.job_orders
      where broker_id = new.broker_id and status in ('submitted','processing');
    if cnt >= 10 then
      raise exception 'You have 10 open job orders — contact KTC admin to file more.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Repoint the cap trigger at the generalized function.
drop trigger if exists job_orders_held_cap on public.job_orders;
drop trigger if exists job_orders_cap on public.job_orders;
create trigger job_orders_cap before insert on public.job_orders
  for each row execute function public.enforce_order_caps();

drop function if exists public.enforce_held_cap();
