-- ============================================================
-- 0064 — admin file-on-behalf captures vessel + voyage (parity with the
-- customer form, A2). Adds p_vessel_visit / p_vessel_name / p_voyage_number
-- (defaulted, so any old call still resolves) and writes them on the JO.
-- ============================================================

drop function if exists public.admin_file_job_order(uuid, uuid, text, jsonb);
create or replace function public.admin_file_job_order(
  p_customer_id uuid, p_consignee_id uuid, p_entry_number text, p_lines jsonb,
  p_vessel_visit text default null, p_vessel_name text default null, p_voyage_number text default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
  if v_customer.status not in ('approved','pending') then
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
    insert into public.job_order_lines (job_order_id, container_number, service_request)
    values (v_id, v_container, v_service);
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
