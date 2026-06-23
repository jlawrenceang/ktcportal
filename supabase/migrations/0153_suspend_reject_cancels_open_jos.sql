-- 0153: Suspending OR rejecting a customer cancels ALL their open job orders. (Item 4)
-- Previously this trigger cancelled only HELD orders on suspend (and ignored
-- rejected entirely), so a suspended customer's in-flight orders kept going. Now
-- both 'suspended' and 'rejected' cancel every open order (held/submitted/
-- processing/on_hold) — EXCEPT orders already paid or invoiced, left for manual
-- handling (financial integrity). Approval still releases held → submitted.

create or replace function public.release_held_job_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'approved' then
      update public.job_orders set status = 'submitted'
        where customer_id = new.id and status = 'held';
    elsif new.status in ('suspended','rejected') then
      update public.job_orders
         set status = 'cancelled',
             admin_note = case when new.status = 'suspended'
               then 'Account suspended — job order cancelled.'
               else 'Account not approved — job order cancelled.' end
       where customer_id = new.id
         and status in ('held','submitted','processing','on_hold')
         and payment_status is distinct from 'confirmed'
         and service_invoice_no is null;
    end if;
  end if;
  return new;
end;
$$;
