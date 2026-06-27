-- 0169: a Job Order's consignee must be APPROVED at filing / re-pointing time.
-- The pickers already hide pending consignees, but file_job_order,
-- admin_file_job_order, and update_job_order only checked the consignee EXISTS —
-- so a non-picker path could attach an unapproved (pending/needs_info/rejected)
-- consignee, bypassing the consignee gate. This trigger is the single backstop
-- (mirrors guard_consignee_approval): it fires only when consignee_id is SET on
-- insert or CHANGED on update, so processing/editing an existing order whose
-- consignee later changed status is unaffected (grandfathered) — only NEW
-- associations are held to the approved rule.
create or replace function public.guard_job_order_consignee_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.consignee_id is not null
     and (tg_op = 'INSERT' or new.consignee_id is distinct from old.consignee_id) then
    if not exists (select 1 from public.consignees where id = new.consignee_id and status = 'approved') then
      raise exception 'That consignee isn''t approved yet — pick an approved consignee.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists job_orders_consignee_approved on public.job_orders;
create trigger job_orders_consignee_approved before insert or update on public.job_orders
  for each row execute function public.guard_job_order_consignee_approved();
