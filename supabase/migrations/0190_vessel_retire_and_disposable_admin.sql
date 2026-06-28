-- ============================================================
-- 0190 — Phase 2 Batch E: retire customer vessel-requests + disposable-email admin
--        (owner, 2026-06-28)
--
-- T2-13 (owner decision 2026-06-28): customers can NO LONGER request vessels.
--   A vessel not in the schedule → contact support (Lara's vessel node already
--   opens a ticket). So:
--     - request_vessel / resubmit_vessel_request → raise "contact support".
--     - my_vessel_requests → return no rows (graceful for any stale client).
--     - review_vessel_request → recreated VERBATIM minus the two customer
--       notification inserts (vessel_rejected / vessel_needs_info) so the
--       dead-end notification can never be created again. Approve/JO-backfill
--       logic unchanged. (Frontend hides the now-vestigial admin review panel +
--       drops the vessel branches from the customer bell.) Also resolves the
--       Phase-3 orphan-RPC items T3-07/T3-08.
--
-- T2-38: owner-only RPCs to manage the disposable-email blocklist (search / add
--   / remove) — the remove path is the "allowlist override" for a wrongly-
--   blocked legit domain. Gated is_owner(); the table stays RPC-only.
-- ============================================================

-- ------------------------------------------------------------
-- T2-13 — neutralize the customer vessel-request RPCs.
-- ------------------------------------------------------------
create or replace function public.request_vessel(p_name text, p_voyage text default null)
returns json language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Vessel requests are now handled by contacting support — please open a support ticket for a vessel that isn''t in the schedule.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.resubmit_vessel_request(p_id uuid, p_name text, p_voyage text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Vessel requests are now handled by contacting support.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.my_vessel_requests()
returns table (id uuid, vessel_name text, voyage_number text, status text, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, vessel_name, voyage_number, status, note, created_at
  from public.vessel_requests where false;
$$;

-- review_vessel_request — recreated from 0138 VERBATIM minus the two customer
-- notification inserts (the dead-end). Approve + JO-backfill logic untouched.
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
    -- (T2-13: customer vessel notification removed — no dead-end.)

  elsif p_action = 'needs_info' then
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Add a note for the customer explaining what''s needed.';
    end if;
    update public.vessel_requests
       set status = 'needs_info', reviewed_by = public.current_broker_id(),
           reviewed_at = now(), note = trim(p_note)
     where id = p_id;
    -- (T2-13: customer vessel notification removed — no dead-end.)

  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- T2-38 — owner-only disposable-email blocklist management (the table stays
-- RPC-only; remove = the allowlist override for a wrongly-blocked domain).
-- ------------------------------------------------------------
create or replace function public.list_disposable_domains(p_search text default null, p_limit int default 50)
returns table (domain text) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Owner only.'; end if;
  return query
    select d.domain from public.disposable_email_domains d
    where p_search is null or d.domain ilike '%' || lower(trim(p_search)) || '%'
    order by d.domain
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.add_disposable_domain(p_domain text)
returns void language plpgsql security definer set search_path = public as $$
declare v_d text := lower(trim(coalesce(p_domain, '')));
begin
  if not public.is_owner() then raise exception 'Owner only.'; end if;
  if v_d = '' or position('@' in v_d) > 0 or position('.' in v_d) = 0 then
    raise exception 'Enter a bare domain like mailinator.com.';
  end if;
  insert into public.disposable_email_domains (domain) values (v_d) on conflict do nothing;
end;
$$;

create or replace function public.remove_disposable_domain(p_domain text)
returns void language plpgsql security definer set search_path = public as $$
declare v_d text := lower(trim(coalesce(p_domain, '')));
begin
  if not public.is_owner() then raise exception 'Owner only.'; end if;
  delete from public.disposable_email_domains where domain = v_d;
end;
$$;

revoke all on function public.list_disposable_domains(text, int) from public, anon;
revoke all on function public.add_disposable_domain(text)       from public, anon;
revoke all on function public.remove_disposable_domain(text)    from public, anon;
grant execute on function public.list_disposable_domains(text, int) to authenticated;
grant execute on function public.add_disposable_domain(text)       to authenticated;
grant execute on function public.remove_disposable_domain(text)    to authenticated;
