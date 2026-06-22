-- ============================================================
-- 0141 — container rate matrix (Phase 1 of the calculator/JO container rework).
--   • terminal_rates gains fill (empty/full) + kind (dry/reefer); existing rows
--     backfill to full/dry; re-keyed to (service,trade,origin,size,fill,kind);
--     all 160 combos seeded (the 120 new cells start with rate = null, so the
--     calculator can flag "rate not set" instead of charging ₱0).
--   • job_order_lines gains size + fill + kind (nullable; required in the new
--     filing UI, but old rows stay valid).
--   • the three line-insert paths (file_job_order, admin_file_job_order,
--     update_job_order) now persist size/fill/kind per container.
-- terminal_rates is the CALCULATOR's tariff — live payment uses service_rates,
-- so this does not change existing billing.
-- (CIS/broker session keeps the contiguous low numbers; fuel lane is 0150+.)
-- ============================================================

-- 1) terminal_rates — add the two dimensions, backfill, re-key, seed.
alter table public.terminal_rates add column if not exists fill text not null default 'full';
alter table public.terminal_rates add column if not exists kind text not null default 'dry';

alter table public.terminal_rates drop constraint if exists terminal_rates_fill_check;
alter table public.terminal_rates add constraint terminal_rates_fill_check check (fill in ('empty', 'full'));
alter table public.terminal_rates drop constraint if exists terminal_rates_kind_check;
alter table public.terminal_rates add constraint terminal_rates_kind_check check (kind in ('dry', 'reefer'));

alter table public.terminal_rates drop constraint if exists terminal_rates_service_trade_origin_size_key;
alter table public.terminal_rates drop constraint if exists terminal_rates_combo_key;
alter table public.terminal_rates add constraint terminal_rates_combo_key
  unique (service, trade, origin, size, fill, kind);

insert into public.terminal_rates (service, trade, origin, size, fill, kind, rate)
select s, t, o, z, f, k, null
from unnest(array['arrastre', 'wharfage', 'lolo', 'weighing', 'storage']) s
cross join unnest(array['import', 'export']) t
cross join unnest(array['domestic', 'foreign']) o
cross join unnest(array['20', '40']) z
cross join unnest(array['empty', 'full']) f
cross join unnest(array['dry', 'reefer']) k
on conflict (service, trade, origin, size, fill, kind) do nothing;

-- 2) job_order_lines — per-container size / fill / kind (nullable; old rows OK).
alter table public.job_order_lines add column if not exists size text;
alter table public.job_order_lines add column if not exists fill text;
alter table public.job_order_lines add column if not exists kind text;
alter table public.job_order_lines drop constraint if exists job_order_lines_size_check;
alter table public.job_order_lines add constraint job_order_lines_size_check check (size is null or size in ('20', '40'));
alter table public.job_order_lines drop constraint if exists job_order_lines_fill_check;
alter table public.job_order_lines add constraint job_order_lines_fill_check check (fill is null or fill in ('empty', 'full'));
alter table public.job_order_lines drop constraint if exists job_order_lines_kind_check;
alter table public.job_order_lines add constraint job_order_lines_kind_check check (kind is null or kind in ('dry', 'reefer'));

-- 3a) file_job_order — store size/fill/kind per line.
create or replace function public.file_job_order(
  p_consignee uuid, p_entry_number text, p_vessel_visit text,
  p_vessel_name text, p_voyage_number text, p_lines jsonb
)
returns uuid language plpgsql security definer set search_path = 'public' as $function$
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

  v_status := case when public.broker_is_approved() then 'submitted' else 'held' end;

  insert into public.job_orders (customer_id, consignee_id, entry_number, vessel_visit, vessel_name, voyage_number, status)
  values (v_cust, p_consignee, upper(trim(p_entry_number)), nullif(trim(p_vessel_visit), ''),
          upper(trim(p_vessel_name)), upper(trim(p_voyage_number)), v_status)
  returning id into v_jo;

  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select v_jo, upper(trim(j->>'container_number')), j->>'service_request',
         nullif(trim(coalesce(j->>'size', '')), ''), nullif(trim(coalesce(j->>'fill', '')), ''), nullif(trim(coalesce(j->>'kind', '')), '')
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  return v_jo;
end;
$function$;
revoke all on function public.file_job_order(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.file_job_order(uuid, text, text, text, text, jsonb) to authenticated;

-- 3b) admin_file_job_order — store size/fill/kind per line.
create or replace function public.admin_file_job_order(
  p_customer_id uuid, p_consignee_id uuid, p_entry_number text, p_lines jsonb,
  p_vessel_visit text default null, p_vessel_name text default null, p_voyage_number text default null
)
returns jsonb language plpgsql security definer set search_path = 'public' as $function$
declare
  v_customer record;
  v_id uuid;
  v_jo text;
  v_line jsonb;
  v_container text;
  v_service text;
  v_count int := 0;
begin
  if not public.has_permission('file_job_orders') then
    raise exception 'You don''t have permission to file job orders on behalf of customers.';
  end if;

  select id, full_name, status, staff_role into v_customer
    from public.customers where id = p_customer_id;
  if not found then raise exception 'Customer not found.'; end if;
  if v_customer.staff_role is not null then
    raise exception 'That account is a staff account — pick a customer.';
  end if;
  if v_customer.status not in ('approved', 'pending') then
    raise exception 'This customer''s account is % — job orders can''t be filed for it.', v_customer.status;
  end if;

  if not exists (select 1 from public.consignees where id = p_consignee_id) then
    raise exception 'Consignee not found.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'A job order can have at most 100 containers.' using errcode = 'check_violation';
  end if;

  insert into public.job_orders (customer_id, consignee_id, entry_number, status, vessel_visit, vessel_name, voyage_number)
  values (p_customer_id, p_consignee_id, nullif(trim(coalesce(p_entry_number, '')), ''), 'submitted',
          nullif(trim(coalesce(p_vessel_visit, '')), ''),
          nullif(trim(coalesce(p_vessel_name, '')), ''),
          nullif(trim(coalesce(p_voyage_number, '')), ''))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_container := upper(trim(coalesce(v_line->>'container_number', '')));
    v_service   := trim(coalesce(v_line->>'service_request', ''));
    if v_container = '' then continue; end if;
    if length(v_container) > 30 or length(v_service) > 80 or v_service = '' then
      raise exception 'Invalid container line.' using errcode = 'check_violation';
    end if;
    insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
    values (v_id, v_container, v_service,
            nullif(trim(coalesce(v_line->>'size', '')), ''), nullif(trim(coalesce(v_line->>'fill', '')), ''), nullif(trim(coalesce(v_line->>'kind', '')), ''));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Add at least one container.' using errcode = 'check_violation';
  end if;

  select jo_number into v_jo from public.job_orders where id = v_id;
  return jsonb_build_object('id', v_id, 'jo_number', v_jo, 'customer_name', v_customer.full_name);
end;
$function$;
revoke all on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.admin_file_job_order(uuid, uuid, text, jsonb, text, text, text) to authenticated;

-- 3c) update_job_order — store size/fill/kind per line.
create or replace function public.update_job_order(
  p_id uuid, p_consignee_id uuid, p_entry_number text,
  p_vessel_visit text, p_vessel_name text, p_voyage_number text, p_lines jsonb
)
returns void language plpgsql security definer set search_path = 'public' as $function$
declare
  v_row   public.job_orders%rowtype;
  v_count int := 0;
  e       jsonb;
begin
  select * into v_row from public.job_orders
    where id = p_id and customer_id = public.current_broker_id() for update;
  if not found then raise exception 'Job order not found.'; end if;

  if v_row.status not in ('held', 'submitted') then
    raise exception 'This order can''t be edited anymore — KTC has accepted it. Reply on an on-hold order, or contact KTC admin.';
  end if;

  if p_consignee_id is null then
    raise exception 'Select a consignee.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.consignees where id = p_consignee_id) then
    raise exception 'Consignee not found.';
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

  update public.job_orders
  set consignee_id  = p_consignee_id,
      entry_number  = upper(trim(p_entry_number)),
      vessel_visit  = nullif(trim(p_vessel_visit), ''),
      vessel_name   = upper(trim(p_vessel_name)),
      voyage_number = upper(trim(p_voyage_number)),
      last_customer_edit_at = case when v_row.status = 'submitted' then now() else last_customer_edit_at end
  where id = p_id;

  delete from public.job_order_lines where job_order_id = p_id;
  insert into public.job_order_lines (job_order_id, container_number, service_request, size, fill, kind)
  select p_id, upper(trim(j->>'container_number')), j->>'service_request',
         nullif(trim(coalesce(j->>'size', '')), ''), nullif(trim(coalesce(j->>'fill', '')), ''), nullif(trim(coalesce(j->>'kind', '')), '')
  from jsonb_array_elements(p_lines) j
  where length(coalesce(trim(j->>'container_number'), '')) > 0;

  insert into public.job_order_events (job_order_id, event, actor, detail)
  values (p_id, 'edited', auth.uid(),
          jsonb_build_object('by', 'customer', 'after_filing', v_row.status = 'submitted'));
end;
$function$;
revoke all on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_job_order(uuid, uuid, text, text, text, text, jsonb) to authenticated;
