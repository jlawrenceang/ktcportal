-- ============================================================
-- 0138 — "needs more info" review state for consignee + vessel requests.
--
-- Reviewers can tag a request needs_info (with a note) instead of a hard
-- approve/reject. The requester is notified and can EDIT & RESUBMIT in-app
-- (back to pending). Recoverable, unlike rejected.
--   • consignee review: admin + CSR (new permission review_consignee_requests)
--   • vessel review: ops/admin (existing manage_vessel_schedule)
-- (0138/0139 were free below the parallel tracks at 0140/0150.)
-- ============================================================

-- ============ CONSIGNEES ============

-- 1) Allow needs_info.
alter table public.consignees drop constraint if exists consignees_status_check;
alter table public.consignees add constraint consignees_status_check
  check (status in ('pending', 'approved', 'rejected', 'needs_info'));

-- 2) New gate: review_consignee_requests (admin + CSR).
insert into public.role_permissions (role, permission, allowed) values
  ('admin',      'review_consignee_requests', true),
  ('csr',        'review_consignee_requests', true),
  ('cashier',    'review_consignee_requests', false),
  ('checker',    'review_consignee_requests', false),
  ('operations', 'review_consignee_requests', false)
on conflict (role, permission) do nothing;

-- 3) RLS: reviewers see all consignees; a requester sees their own pending +
--    needs_info; everyone sees approved.
drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated using (
    status = 'approved'
    or public.is_admin()
    or public.has_permission('review_consignee_requests')
    or (requested_by = public.current_broker_id() and status in ('pending', 'needs_info'))
  );

-- 4) review_consignee — approve / reject / needs_info (admin or CSR).
create or replace function public.review_consignee(p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not (public.has_permission('review_consignee_requests') or public.is_admin()) then
    raise exception 'You don''t have permission to review consignees.';
  end if;
  v_status := case p_action
    when 'approve'    then 'approved'
    when 'reject'     then 'rejected'
    when 'needs_info' then 'needs_info'
    else null end;
  if v_status is null then raise exception 'Unknown action: %', p_action; end if;
  if p_action in ('reject', 'needs_info') and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note for the customer explaining what''s needed.';
  end if;
  update public.consignees
     set status = v_status, decided_at = now(),
         note = case when p_action = 'approve' then null else trim(p_note) end
   where id = p_id;
  if not found then raise exception 'Consignee not found.'; end if;
end;
$$;
revoke all on function public.review_consignee(uuid, text, text) from public, anon;
grant execute on function public.review_consignee(uuid, text, text) to authenticated;

-- 5) resubmit_consignee — the requester fixes their own needs_info request.
create or replace function public.resubmit_consignee(
  p_id uuid, p_name text default null, p_address text default null,
  p_tin text default null, p_doc_2303 text default null, p_doc_2307 text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  update public.consignees
     set name          = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
         address       = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
         tin           = coalesce(nullif(trim(coalesce(p_tin, '')), ''), tin),
         doc_2303_path = coalesce(nullif(trim(coalesce(p_doc_2303, '')), ''), doc_2303_path),
         doc_2307_path = coalesce(nullif(trim(coalesce(p_doc_2307, '')), ''), doc_2307_path),
         status = 'pending', note = null, requested_at = now()
   where id = p_id and requested_by = v_cust and status = 'needs_info';
  if not found then raise exception 'Request not found or not editable.'; end if;
end;
$$;
revoke all on function public.resubmit_consignee(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_consignee(uuid, text, text, text, text, text) to authenticated;

-- 6) Notify the requester on every decision (now incl. needs_info). Re-revoke the
--    trigger-only function from callers (definer ACL invariant; see 0140).
create or replace function public.notify_consignee_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requested_by is not null and new.status is distinct from old.status then
    if new.status = 'approved' then
      insert into public.notifications (customer_id, kind, title)
      values (new.requested_by, 'consignee_approved',
              'Consignee “' || new.name || '” (' || new.code || ') was approved — you can now use it');
    elsif new.status = 'rejected' then
      insert into public.notifications (customer_id, kind, title)
      values (new.requested_by, 'consignee_rejected',
              'Consignee request “' || new.name || '” was not approved'
              || coalesce(' — “' || new.note || '”', ''));
    elsif new.status = 'needs_info' then
      insert into public.notifications (customer_id, kind, title)
      values (new.requested_by, 'consignee_needs_info',
              'Consignee request “' || new.name || '” needs more info'
              || coalesce(' — “' || new.note || '”', ''));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_consignee_decision() from public, anon, authenticated;

-- ============ VESSELS ============

-- 7) Allow needs_info on vessel_requests (drop the inline check by name).
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'public.vessel_requests'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if c is not null then execute 'alter table public.vessel_requests drop constraint ' || quote_ident(c); end if;
end $$;
alter table public.vessel_requests add constraint vessel_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'needs_info'));

-- 8) review_vessel_request — add needs_info + notify the requester on
--    needs_info/reject (kept the approve linking logic verbatim).
create or replace function public.review_vessel_request(
  p_id uuid, p_action text, p_vessel_visit text default null, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req    public.vessel_requests%rowtype;
  v_name   text;
  v_voyage text;
begin
  if not public.has_permission('manage_vessel_schedule') then
    raise exception 'You don''t have permission to review vessel requests.';
  end if;
  select * into v_req from public.vessel_requests where id = p_id;
  if v_req.id is null then raise exception 'Vessel request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This request was already reviewed.'; end if;

  if p_action = 'approve' then
    if coalesce(trim(p_vessel_visit), '') = '' then
      raise exception 'Pick the scheduled call to link this to (add it to the schedule first if needed).';
    end if;
    select vessel_name, voyage_number into v_name, v_voyage
      from public.vessel_schedule where vessel_visit = trim(p_vessel_visit);
    if v_name is null then
      raise exception 'That Vessel Visit isn''t in the schedule — add the call above first, then approve.';
    end if;
    update public.vessel_requests
       set status = 'approved', vessel_visit = trim(p_vessel_visit),
           reviewed_by = public.current_broker_id(), reviewed_at = now(), note = p_note
     where id = p_id;
    update public.job_orders jo
       set vessel_visit = trim(p_vessel_visit), vessel_name = v_name, voyage_number = v_voyage
     where jo.vessel_visit is null
       and upper(trim(jo.vessel_name)) = v_req.vessel_name
       and upper(trim(coalesce(jo.voyage_number, ''))) = v_req.voyage_number;

  elsif p_action = 'reject' then
    update public.vessel_requests
       set status = 'rejected', reviewed_by = public.current_broker_id(),
           reviewed_at = now(), note = p_note
     where id = p_id;
    if v_req.requested_by is not null then
      insert into public.notifications (customer_id, kind, title)
      values (v_req.requested_by, 'vessel_rejected',
              'Vessel request “' || v_req.vessel_name || '” was not approved'
              || coalesce(' — “' || p_note || '”', ''));
    end if;

  elsif p_action = 'needs_info' then
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Add a note for the customer explaining what''s needed.';
    end if;
    update public.vessel_requests
       set status = 'needs_info', reviewed_by = public.current_broker_id(),
           reviewed_at = now(), note = trim(p_note)
     where id = p_id;
    if v_req.requested_by is not null then
      insert into public.notifications (customer_id, kind, title)
      values (v_req.requested_by, 'vessel_needs_info',
              'Vessel request “' || v_req.vessel_name || '” needs more info — “' || trim(p_note) || '”');
    end if;

  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;
revoke all on function public.review_vessel_request(uuid, text, text, text) from public, anon;
grant execute on function public.review_vessel_request(uuid, text, text, text) to authenticated;

-- 9) my_vessel_requests — the customer's own requests (server-only table, so via RPC).
create or replace function public.my_vessel_requests()
returns table (id uuid, vessel_name text, voyage_number text, status text, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, vessel_name, voyage_number, status, note, created_at
  from public.vessel_requests
  where requested_by = public.current_broker_id()
  order by created_at desc;
$$;
revoke all on function public.my_vessel_requests() from public, anon;
grant execute on function public.my_vessel_requests() to authenticated;

-- 10) resubmit_vessel_request — the requester fixes their own needs_info request.
create or replace function public.resubmit_vessel_request(p_id uuid, p_name text, p_voyage text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  if v_cust is null then raise exception 'No customer profile found.'; end if;
  if length(coalesce(trim(p_name), '')) = 0 then raise exception 'Enter the vessel name.'; end if;
  update public.vessel_requests
     set vessel_name = upper(trim(p_name)), voyage_number = upper(trim(coalesce(p_voyage, ''))),
         status = 'pending', note = null
   where id = p_id and requested_by = v_cust and status = 'needs_info';
  if not found then raise exception 'Request not found or not editable.'; end if;
end;
$$;
revoke all on function public.resubmit_vessel_request(uuid, text, text) from public, anon;
grant execute on function public.resubmit_vessel_request(uuid, text, text) to authenticated;
