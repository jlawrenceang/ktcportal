-- ============================================================
-- 0163 — lock PENDING (unapproved) customers to VERIFY-ONLY (backend-enforced)
--
-- Non-negotiable #1 (backend-enforced access). A customer with status='pending'
-- may ONLY: upload a valid ID, see their pending status, read the Customer
-- Agreement, manage account basics (email/password), and sign out. EVERY business
-- surface — filing orders, the vessel schedule, rates/calculator config, the
-- consignee master list, and bulletins/documents — is LOCKED until an admin
-- approves them (status='approved').
--
-- The real wall is RLS + the file_job_order RPC below; the frontend route-gating
-- is UX only. Staff/admin and APPROVED customers are unaffected: every gate keeps
-- the existing staff predicate (is_admin() / has_permission() / current_is_staff())
-- and lets approved customers through via broker_is_approved() (which is true for
-- approved/admin/owner).
--
-- Lockout-safety: the only two live customers are APPROVED → broker_is_approved()
-- is true for them, so none of these reads/writes are affected. Pending accounts
-- simply read NOTHING from these tables and can no longer file even a held order.
--
-- Helper semantics (unchanged, for reference):
--   broker_is_approved()  -> status='approved' OR is_admin OR is_owner  (+ session_alive)
--   broker_is_pending()   -> status='pending'                          (+ session_alive)
--   is_admin()            -> is_admin OR is_owner                       (+ session_alive, aal)
--   current_is_staff()    -> is_admin OR is_owner OR staff_role IS NOT NULL (+ session_alive, aal)
--   has_permission(p)     -> staff role/permission check
-- ============================================================

-- 1) CONSIGNEES (master list + own consignee requests).
--    Latest SELECT policy: 0138 "approved consignees readable".
--    The separate "staff view consignees" policy (0035, has_permission('view_job_orders'))
--    is left UNCHANGED — staff still read every consignee through it.
--    BEFORE using:
--      status = 'approved'
--      or public.is_admin()
--      or public.has_permission('review_consignee_requests')
--      or (requested_by = public.current_broker_id() and status in ('pending','needs_info'))
--    AFTER using (the two CUSTOMER-facing branches are now gated on approval; the
--    two STAFF branches are kept exactly):
drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated using (
    public.is_admin()
    or public.has_permission('review_consignee_requests')
    or (
      public.broker_is_approved() and (
        status = 'approved'
        or (requested_by = public.current_broker_id() and status in ('pending', 'needs_info'))
      )
    )
  );

-- 2) VESSEL_SCHEDULE (and vessel_schedule_v, which is security_invoker=true and so
--    inherits this base-table policy — no separate view policy exists).
--    Latest SELECT policy: 0111 "read vessel schedule".
--    BEFORE using:
--      public.current_is_staff()
--      or shipping_line is null
--      or lower(btrim(shipping_line)) not in (select lower(btrim(name)) from public.shipping_lines where internal)
--    AFTER using (staff branch kept exactly; the customer-visible branch is gated):
drop policy if exists "read vessel schedule" on public.vessel_schedule;
create policy "read vessel schedule" on public.vessel_schedule
  for select to authenticated using (
    public.current_is_staff()
    or (
      public.broker_is_approved() and (
        shipping_line is null
        or lower(btrim(shipping_line)) not in (
          select lower(btrim(name)) from public.shipping_lines where internal
        )
      )
    )
  );

-- 3) TERMINAL_RATES (calculator tariff matrix).
--    Latest SELECT policy: 0073 "read terminal rates".
--    BEFORE using: true   (any authenticated user, incl. pending)
--    AFTER using:  approved customers OR any staff.
drop policy if exists "read terminal rates" on public.terminal_rates;
create policy "read terminal rates" on public.terminal_rates
  for select to authenticated using (
    public.broker_is_approved() or public.current_is_staff()
  );

-- 4) SERVICE_RATES (live payment/charge rates).
--    Latest SELECT policy: 0030 "rates readable".
--    BEFORE using: true   AFTER using: approved customers OR any staff.
drop policy if exists "rates readable" on public.service_rates;
create policy "rates readable" on public.service_rates
  for select to authenticated using (
    public.broker_is_approved() or public.current_is_staff()
  );

-- 5) PRICING_SETTINGS (VAT %, flat fees — the rest of the calculator/payment config).
--    Same customer-facing calculator surface as service_rates; gated identically so
--    a pending account reads NO rate/fee config.
--    Latest SELECT policy: 0030 "pricing readable".
--    BEFORE using: true   AFTER using: approved customers OR any staff.
drop policy if exists "pricing readable" on public.pricing_settings;
create policy "pricing readable" on public.pricing_settings
  for select to authenticated using (
    public.broker_is_approved() or public.current_is_staff()
  );

-- 6) BULLETIN_POSTS (customer announcements / memo documents).
--    Latest SELECT policy: 0076 "read bulletins".
--    BEFORE using: is_published or public.is_admin()
--      (admin saw drafts+published; everyone else — incl. pending — saw published)
--    AFTER using (admin keeps drafts+published; approved customers and non-admin
--    staff keep published; pending customers see nothing):
drop policy if exists "read bulletins" on public.bulletin_posts;
create policy "read bulletins" on public.bulletin_posts
  for select to authenticated using (
    public.is_admin()
    or (is_published and (public.broker_is_approved() or public.current_is_staff()))
  );

-- 7) FILE_JOB_ORDER → APPROVED-ONLY.
--    Recreate file_job_order (0162) byte-for-byte EXCEPT the authorization check,
--    which changes from "approved OR pending" to APPROVED-ONLY. A pending account
--    can no longer file even a 'held' order. The has_recorded_consent() gate and
--    every other line are preserved verbatim. (The 'held' status branch below is
--    now vestigial but harmless — left in place, untouched.)
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
  if not public.broker_is_approved() then
    raise exception 'Your account can''t file orders right now.';
  end if;
  if not public.has_recorded_consent() then
    raise exception 'Please accept the Customer Agreement before filing a job order.';
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

-- Note: the job_orders INSERT policy "broker creates own job orders" (0162) is left
-- as defense-in-depth. file_job_order is the real (RLS-bypassing) gate and is now
-- approved-only; that policy's held-pending branch can never be reached through the
-- RPC, and a hypothetical direct client insert still also requires recorded consent.
