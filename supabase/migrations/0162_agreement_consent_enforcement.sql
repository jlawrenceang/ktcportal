-- ============================================================
-- 0162 — server-side Customer Agreement consent enforcement (audit L1 + L2)
--
-- L1: a customer must have RECORDED consent (terms_version set) before they can
--     file a job order or open a support ticket. Enforced in the DB, not the UI.
-- L2: the consent columns are server-stamped ONLY — a client UPDATE of them is
--     pinned back to the old value by the customers guard trigger, so consent
--     can't be spoofed field-by-field.
--
-- Single server-stamped writer: record_agreement_consent(p_version). Every consent
-- write path (email/password signup, the pending-customer banner sync, the
-- verify-ID page) records consent through this SECURITY DEFINER function;
-- complete_oauth_registration (0161) is the OAuth path. Both set the transaction-
-- local GUC ktc.allow_consent_write=1 so the guard trigger lets THEIR write through;
-- everything else (a raw client UPDATE) is pinned.
--
-- Real enforcement points (not just RLS):
--   * file_job_order is SECURITY DEFINER and bypasses the job_orders INSERT RLS,
--     so the consent gate is added INSIDE it (the RLS WITH CHECK below is kept as
--     harmless defense-in-depth for any hypothetical direct client insert).
--   * the column-level REVOKE approach was dropped: `authenticated` holds
--     table-level UPDATE on customers (Supabase default), so a column REVOKE is a
--     no-op. The guard-trigger + GUC pattern (already used for ktc.allow_owner_change)
--     is the effective spoof-proofing and works regardless of table grants.
--
-- Clean test slate (2026-06-26): only 2 approved customers, both with terms_version
-- already set, and 0 job_orders from null-consent customers — no backfill, no lockout.
-- ============================================================

-- 1) Single server-stamped consent writer (shared by every consent path).
--    Sets the txn-local GUC so the customers guard trigger allows THIS write, then
--    stamps IRR + Terms + Privacy to the same agreement version, on the server clock.
create or replace function public.record_agreement_consent(p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  perform set_config('ktc.allow_consent_write', '1', true);  -- authorise this txn only
  if v_cust is null then raise exception 'No customer account is linked to this sign-in.'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Agreement version is required.'; end if;
  update public.customers
     set irr_version             = p_version, irr_accepted_at      = now(),
         terms_version           = p_version, terms_accepted_at    = now(),
         privacy_consent_version = p_version, privacy_consented_at = now()
   where id = v_cust;
  if not found then raise exception 'Customer account not found.'; end if;
end;
$$;
revoke all on function public.record_agreement_consent(text) from public, anon;
grant execute on function public.record_agreement_consent(text) to authenticated;

-- 2) Has the caller's customer recorded consent? (terms_version is the canonical mark.)
--    Used by file_job_order, open_ticket, and the job_orders INSERT policy below.
create or replace function public.has_recorded_consent()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select terms_version is not null from public.customers where id = public.current_broker_id()),
    false)
$$;
revoke all on function public.has_recorded_consent() from public, anon;
grant execute on function public.has_recorded_consent() to authenticated;

-- 3) OAuth finish-registration path: recreate complete_oauth_registration (0161)
--    verbatim, adding the GUC set so the guard trigger allows its consent write.
create or replace function public.complete_oauth_registration(p_contact text, p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare v_cust uuid := public.current_broker_id();
begin
  perform set_config('ktc.allow_consent_write', '1', true);  -- authorise this txn only
  if v_cust is null then raise exception 'No customer account is linked to this sign-in.'; end if;
  if coalesce(trim(p_contact), '') = '' then raise exception 'A contact number is required.'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Agreement version is required.'; end if;
  update public.customers
     set contact_number         = trim(p_contact),
         irr_version             = p_version, irr_accepted_at      = now(),
         terms_version           = p_version, terms_accepted_at    = now(),
         privacy_consent_version = p_version, privacy_consented_at = now()
   where id = v_cust;
  if not found then raise exception 'Customer account not found.'; end if;
end;
$$;
revoke all on function public.complete_oauth_registration(text, text) from public, anon;
grant execute on function public.complete_oauth_registration(text, text) to authenticated;

-- 4) L2 — spoof-proof the consent columns via the existing customers guard trigger.
--    Recreate guard_broker_protected_fields (0094) with ALL existing logic UNCHANGED
--    (owner/admin/status/staff_role/decided_at pinning + ktc.allow_owner_change), and
--    ADD: pin the six consent columns unless ktc.allow_consent_write=1 (set only by
--    the two consent RPCs above). brokers_guard is `before update` on customers, so
--    a consent-only UPDATE still fires this.
create or replace function public.guard_broker_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner   boolean;
  v_attempt    text[] := '{}';
  v_owner_ok   boolean := coalesce(current_setting('ktc.allow_owner_change', true), '') = '1';
  v_consent_ok boolean := coalesce(current_setting('ktc.allow_consent_write', true), '') = '1';
begin
  if auth.uid() is null then
    new.is_root_owner := old.is_root_owner;
    return new;
  end if;

  -- Consent columns are server-stamped only: a client UPDATE can't change them.
  -- The consent RPCs set ktc.allow_consent_write=1 for their own txn; all else pinned.
  if not v_consent_ok then
    new.irr_version             := old.irr_version;             new.irr_accepted_at      := old.irr_accepted_at;
    new.terms_version           := old.terms_version;           new.terms_accepted_at    := old.terms_accepted_at;
    new.privacy_consent_version := old.privacy_consent_version; new.privacy_consented_at := old.privacy_consented_at;
  end if;

  v_is_owner := coalesce((select is_owner from public.customers where user_id = auth.uid()), false);

  if not v_is_owner and new.staff_role is distinct from old.staff_role then
    v_attempt := v_attempt || 'staff_role';
    new.staff_role := old.staff_role;
  end if;

  if old.is_owner then
    if not v_is_owner then
      if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'; end if;
      if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'; end if;
      if new.status   is distinct from old.status   then v_attempt := v_attempt || 'status';   end if;
    end if;
    if not v_owner_ok then new.is_owner := old.is_owner; end if;
    new.is_admin   := old.is_admin;
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;

  if not public.is_admin() then
    if new.is_owner is distinct from old.is_owner then v_attempt := v_attempt || 'is_owner'; end if;
    if new.is_admin is distinct from old.is_admin then v_attempt := v_attempt || 'is_admin'; end if;
    new.is_owner := old.is_owner;
    new.is_admin := old.is_admin;
    if not (old.status in ('rejected', 'approved') and new.status = 'pending') then
      if new.status is distinct from old.status then v_attempt := v_attempt || 'status'; end if;
      new.status     := old.status;
      new.decided_at := old.decided_at;
    end if;
  end if;

  -- Changing is_admin is OWNER-only (staff are owner-invite-only). Blocks a
  -- plain admin from minting/altering admins via a raw row update.
  if new.is_admin is distinct from old.is_admin and not v_is_owner then
    v_attempt := v_attempt || 'is_admin';
    new.is_admin := old.is_admin;
  end if;

  if not v_owner_ok then
    new.is_owner := old.is_owner;
  end if;
  new.is_root_owner := old.is_root_owner;

  if array_length(v_attempt, 1) is not null then
    perform public.log_security_event('protected_field_attempt', new.id,
      jsonb_build_object('fields', (select to_jsonb(array_agg(distinct f)) from unnest(v_attempt) f)));
  end if;
  return new;
end;
$$;

-- 5) Defense-in-depth: AND the consent gate into the job_orders INSERT policy.
--    (file_job_order is the real gate — see step 6 — but a hypothetical direct
--    client insert is caught here too.) The 0016 policy's broker_id column was
--    auto-renamed to customer_id by 0021; recreate with the current name.
drop policy if exists "broker creates own job orders" on public.job_orders;
create policy "broker creates own job orders" on public.job_orders
  for insert to authenticated
  with check (
    customer_id = public.current_broker_id()
    and public.has_recorded_consent()
    and (
      public.broker_is_approved()
      or (status = 'held' and public.broker_is_pending())
    )
  );

-- 6) REAL JO gate: file_job_order is SECURITY DEFINER and bypasses RLS, so the
--    consent check lives inside it. Recreate file_job_order (0141) verbatim with the
--    consent gate added right after the approved/held-pending authorization check.
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

-- 7) A customer can't open a support ticket without recorded consent.
--    Recreate open_ticket (0115) verbatim with the consent gate prepended.
create or replace function public.open_ticket(p_subject text, p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cust   uuid := public.current_broker_id();
  v_cat    text := coalesce(nullif(trim(p_category), ''), 'other');
  v_ticket uuid;
  v_open   int;
begin
  if not public.has_recorded_consent() then
    raise exception 'Please accept the Customer Agreement before contacting support.';
  end if;
  if v_cust is null then
    raise exception 'Only customers can open support tickets.';
  end if;
  if length(coalesce(trim(p_subject), '')) = 0 then
    raise exception 'Please enter a subject.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  if v_cat not in ('account','accreditation','job_order','payment',
                   'app_system','customer_service','operations','other') then
    raise exception 'Unknown category %.', v_cat;
  end if;

  select count(*) into v_open
  from public.support_tickets
  where customer_id = v_cust and status = 'open';
  if v_open >= 5 then
    raise exception 'You already have 5 open support tickets. Please close one before opening another.';
  end if;

  insert into public.support_tickets (customer_id, subject, category)
  values (v_cust, left(trim(p_subject), 200), v_cat)
  returning id into v_ticket;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (v_ticket, auth.uid(), false, left(trim(p_body), 4000));

  return v_ticket;
end;
$$;
revoke all on function public.open_ticket(text, text, text) from public, anon;
grant execute on function public.open_ticket(text, text, text) to authenticated;
