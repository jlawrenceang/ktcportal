-- ============================================================
-- 0098 — atomic customer filing (owner, 2026-06-16)
--
-- Audit blocker: JobOrder.tsx inserts the job_orders row, THEN the lines in a
-- separate call — if the second fails (or the tab closes), an orphan line-less
-- order is left in the queue. This RPC inserts the order + its lines in ONE
-- transaction. Same rules as the RLS path: pending customer -> held, approved ->
-- submitted; the order caps trigger + serving-number triggers still fire.
-- ============================================================

create or replace function public.file_job_order(
  p_consignee     uuid,
  p_entry_number  text,
  p_vessel_visit  text,
  p_vessel_name   text,
  p_voyage_number text,
  p_lines         jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cust   uuid := public.current_broker_id();
  v_status text;
  v_jo     uuid;
  v_count  int := 0;
  e        jsonb;
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if not (public.broker_is_approved() or public.broker_is_pending()) then
    raise exception 'Your account can''t file orders right now.';
  end if;
  if p_consignee is null or not exists (select 1 from public.consignees where id = p_consignee) then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_entry_number), '')) = 0 then
    raise exception 'Enter the Entry Number (C-…).' using errcode = 'check_violation';
  end if;
  if coalesce(nullif(trim(p_vessel_name), ''), '') = ''
     or coalesce(nullif(trim(p_voyage_number), ''), '') = '' then
    raise exception 'Enter the vessel name and voyage number.' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if length(coalesce(trim(e->>'container_number'), '')) > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;

  -- Approved customers file straight to the queue; pending file as held drafts.
  v_status := case when public.broker_is_approved() then 'submitted' else 'held' end;

  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name, voyage_number, status)
  values (v_cust, p_consignee, upper(trim(p_entry_number)), nullif(trim(p_vessel_visit), ''),
          upper(trim(p_vessel_name)), upper(trim(p_voyage_number)), v_status)
  returning id into v_jo;

  insert into public.job_order_lines (job_order_id, container_number, service_request)
  select v_jo, upper(trim(j->>'container_number')), j->>'service_request'
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  return v_jo;
end;
$$;
revoke all on function public.file_job_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.file_job_order(uuid, text, text, text, text, jsonb) to authenticated;
