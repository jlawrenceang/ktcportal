-- 0182: audit fixes (batch 3) — phantom balance from un-priced charges + retire the
-- manual queue-jump.
--   (#261) sync_open_supplement set has_open_supplement for ANY non-confirmed supplement,
--          including a 'requested' (un-priced, amount=null) charge ops just tagged — wrongly
--          surfacing the order under the customer's "Needs action" with a phantom "Balance
--          to pay". Now only a BILLED (priced) charge counts.
--   (#382) restore_serving_number was declared retired by ADR-0035 (line-jumping is now
--          ONLY via the admin-approved priority lane) but never dropped — operations could
--          hold→un-hold then "Restore" an order's original lower number, jumping the queue
--          with no approve_priority. Dropped (the UI wiring is removed in the same change).

-- (#261) only a billed (priced) charge makes an order "under review".
create or replace function public.sync_open_supplement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_jo uuid := coalesce(new.job_order_id, old.job_order_id);
begin
  update public.job_orders jo
     set has_open_supplement = exists (
       select 1 from public.jo_supplements s
       where s.job_order_id = v_jo and s.bill_status = 'billed' and s.payment_status <> 'confirmed'
     )
   where jo.id = v_jo
     and jo.has_open_supplement is distinct from exists (
       select 1 from public.jo_supplements s
       where s.job_order_id = v_jo and s.bill_status = 'billed' and s.payment_status <> 'confirmed'
     );
  return null;
end;
$$;

-- Re-sync existing orders under the corrected (billed-only) rule.
update public.job_orders jo
   set has_open_supplement = exists (
     select 1 from public.jo_supplements s
     where s.job_order_id = jo.id and s.bill_status = 'billed' and s.payment_status <> 'confirmed'
   )
 where jo.has_open_supplement is distinct from exists (
   select 1 from public.jo_supplements s
   where s.job_order_id = jo.id and s.bill_status = 'billed' and s.payment_status <> 'confirmed'
 );

-- (#382) retire the manual line-jump — superseded by the admin-approved priority lane.
drop function if exists public.restore_serving_number(uuid, text);
