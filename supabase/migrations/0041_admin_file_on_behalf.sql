-- ============================================================
-- 0041 — gap fix G3: admin "file on behalf of" (walk-ins, in-house ops).
--
-- Decision 2026-06-11 (#9): a KTC division handles in-house ops and admins
-- must be able to file JOs for walk-in customers at the window.
--
--   * New owner-tweakable gate: 'file_job_orders' (admin ON, cashier/checker
--     OFF by default — flip in Settings → Roles & Gates).
--   * admin_file_job_order RPC — files straight to 'submitted' for any
--     pending/approved customer: the JO number, serving numbers, and the
--     audit 'filed' event (actor = the staff member) all come from the
--     existing triggers, identical to a customer filing.
--   * Staff filings BYPASS the order caps: the open-order cap's own error
--     says "contact KTC admin to file more" — admin filing is that escape
--     hatch, so it can't be blocked by the same cap.
-- ============================================================

-- 1) The gate.
insert into public.role_permissions (role, permission, allowed) values
  ('admin',   'file_job_orders', true),
  ('cashier', 'file_job_orders', false),
  ('checker', 'file_job_orders', false)
on conflict (role, permission) do nothing;

-- 2) Caps bypass for staff filings (trigger is BEFORE INSERT only).
create or replace function public.enforce_order_caps()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  -- Staff filing on behalf (admin_file_job_order) isn't customer spam — and
  -- it's the documented escape hatch when a customer hits the open cap.
  if auth.uid() is not null and public.has_permission('file_job_orders') then
    return new;
  end if;
  if new.status in ('held','submitted','processing','on_hold') then
    perform pg_advisory_xact_lock(hashtext('jo_caps:' || new.customer_id::text));
  end if;
  if new.status = 'held' then
    select count(*) into cnt from public.job_orders
      where customer_id = new.customer_id and status = 'held';
    if cnt >= 10 then
      raise exception 'You can keep at most 10 job orders on hold until your account is verified. Upload your valid ID to get verified.'
        using errcode = 'check_violation';
    end if;
  elsif new.status in ('submitted','processing','on_hold') then
    select count(*) into cnt from public.job_orders
      where customer_id = new.customer_id and status in ('submitted','processing','on_hold');
    if cnt >= 10 then
      raise exception 'You have 10 open job orders — contact KTC admin to file more.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 3) The RPC. p_lines = jsonb array of {container_number, service_request}.
create or replace function public.admin_file_job_order(
  p_customer_id uuid,
  p_consignee_id uuid,
  p_entry_number text,
  p_lines jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  insert into public.job_orders (customer_id, consignee_id, entry_number, status)
  values (p_customer_id, p_consignee_id, nullif(trim(coalesce(p_entry_number, '')), ''), 'submitted')
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
  return jsonb_build_object('id', v_id, 'jo_number', v_jo,
                            'customer_name', v_customer.full_name);
end;
$$;

revoke all on function public.admin_file_job_order(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.admin_file_job_order(uuid, uuid, text, jsonb) to authenticated;
