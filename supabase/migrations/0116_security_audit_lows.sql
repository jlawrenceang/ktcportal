-- ============================================================
-- 0116 — close out the low-severity audit backlog (owner, 2026-06-18)
--
-- Follow-up to 0115. Clears the remaining low/medium items from the
-- 2026-06-18 audit while the system is young:
--   A) valid-ID DELETION is now audited. All three delete paths (lazy client
--      purge, hourly cron, manual admin delete) end by clearing
--      customers.valid_id_path — so ONE trigger on that NOT NULL -> NULL
--      transition captures every deletion with actor + timestamp.
--   B) Successful STAFF/OWNER logins are recorded ('sign_in'). claim_session
--      runs once per session (client guards re-claims), so volume is bounded;
--      customer logins are intentionally not logged.
--   C) add_jo_support caps supporting documents at 20 per order (storage abuse).
--   D) job_order_lines: server-side length bounds on container_number /
--      service_request via CHECK ... NOT VALID (catches EVERY insert path —
--      RPC, admin file-on-behalf, staff edit — not just the customer RPC).
--      Length-bounded, NOT enum'd: the service catalogue is expected to grow
--      (OOG etc.), and serving/billing match by regex, so a strict enum would
--      be a future foot-gun. This just stops empty/junk/huge values.
--   E) Consignee write policies gate on has_permission('manage_consignees')
--      instead of is_admin(), so the role matrix is authoritative in one layer
--      (admin + owner keep access; behaviour is identical today).
--   Watchdog: the new routine audit kinds are excluded from the owner ALERT
--   email (still recorded in security_events).
-- ============================================================

-- ---------- A) valid-ID deletion audit ----------
create or replace function public.audit_valid_id_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.valid_id_path is not null and new.valid_id_path is null then
    perform public.log_security_event(
      'valid_id_deleted', new.id,
      jsonb_build_object('path', old.valid_id_path)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_valid_id_deletion() from public, anon, authenticated;

drop trigger if exists customers_valid_id_deletion_audit on public.customers;
create trigger customers_valid_id_deletion_audit
  after update of valid_id_path on public.customers
  for each row execute function public.audit_valid_id_deletion();

-- ---------- B) staff/owner login audit ----------
-- Re-create claim_session (0055) verbatim + a 'sign_in' log for privileged
-- accounts at the end (after the aal2 gate + eviction).
create or replace function public.claim_session()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  v_evicted int := 0;
begin
  if v_uid is null or v_sid is null then return; end if;

  -- MFA-enrolled accounts claim only once fully authenticated (aal2).
  if exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified')
     and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    return;
  end if;

  insert into public.active_sessions (user_id, session_id, claimed_at)
  values (v_uid, v_sid, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id, claimed_at = now();

  -- Evict every other session for this account (mechanism shared with 0047).
  begin
    delete from auth.refresh_tokens where user_id = v_uid::text and session_id <> v_sid;
    delete from auth.sessions where user_id = v_uid and id <> v_sid;
    get diagnostics v_evicted = row_count;
  exception when others then
    raise notice 'claim_session: eviction failed: %', sqlerrm;
  end;

  if v_evicted > 0 then
    perform public.log_security_event(
      'session_evicted',
      (select id from public.customers where user_id = v_uid),
      jsonb_build_object('evicted_sessions', v_evicted));
  end if;

  -- Audit successful authentication for PRIVILEGED accounts only (staff/owner) —
  -- bounds volume to the admin surface; excluded from the watchdog email below.
  if exists (select 1 from public.customers
             where user_id = v_uid and (is_owner or is_admin or staff_role is not null)) then
    perform public.log_security_event(
      'sign_in',
      (select id from public.customers where user_id = v_uid),
      jsonb_build_object('aal', coalesce(auth.jwt()->>'aal', 'aal1')));
  end if;
end;
$$;

-- ---------- C) cap supporting documents per order ----------
create or replace function public.add_jo_support(
  p_jo uuid, p_path text default null, p_filename text default null, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_docs int;
begin
  if coalesce(trim(p_path), '') = '' and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note or attach a document.';
  end if;
  if not exists (
    select 1 from public.job_orders
    where id = p_jo and customer_id = public.current_broker_id()
      and status in ('held','submitted','processing','on_hold')
  ) then
    raise exception 'You can only add supporting info to your own active job orders.';
  end if;
  select count(*) into v_docs from public.job_order_documents where job_order_id = p_jo;
  if v_docs >= 20 then
    raise exception 'This order already has the maximum of 20 supporting entries.'
      using errcode = 'check_violation';
  end if;
  insert into public.job_order_documents (job_order_id, path, filename, note, uploaded_by)
  values (p_jo, nullif(trim(p_path), ''), nullif(trim(p_filename), ''), nullif(trim(p_note), ''), public.current_broker_id());
end;
$$;
revoke all on function public.add_jo_support(uuid, text, text, text) from public, anon;
grant execute on function public.add_jo_support(uuid, text, text, text) to authenticated;

-- ---------- D) job_order_lines server-side value bounds ----------
-- NOT VALID: enforce on new/updated rows without re-validating history.
alter table public.job_order_lines drop constraint if exists job_order_lines_container_number_len;
alter table public.job_order_lines
  add constraint job_order_lines_container_number_len
  check (char_length(btrim(container_number)) between 4 and 40) not valid;

alter table public.job_order_lines drop constraint if exists job_order_lines_service_request_len;
alter table public.job_order_lines
  add constraint job_order_lines_service_request_len
  check (char_length(btrim(service_request)) between 1 and 60) not valid;

-- ---------- E) consignee writes gate on the permission, not is_admin() ----------
drop policy if exists "admin inserts consignees" on public.consignees;
create policy "admin inserts consignees" on public.consignees
  for insert to authenticated with check (public.has_permission('manage_consignees'));

drop policy if exists "admin updates consignees" on public.consignees;
create policy "admin updates consignees" on public.consignees
  for update to authenticated
  using (public.has_permission('manage_consignees'))
  with check (public.has_permission('manage_consignees'));

drop policy if exists "admin deletes consignees" on public.consignees;
create policy "admin deletes consignees" on public.consignees
  for delete to authenticated using (public.has_permission('manage_consignees'));

-- ---------- watchdog: ignore the new routine audit kinds in the ALERT email ----------
-- (They stay recorded in security_events; this only suppresses the owner email.)
create or replace function public.check_ops_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cron_fails int; v_out_fails int; v_errs int; v_sec int; v_grants int;
  v_email text; v_name text; v_body text := '';
  v_send boolean := false;
begin
  perform public.reconcile_outbound();

  select count(*) into v_cron_fails
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where d.start_time > now() - interval '70 minutes'
      and d.status = 'failed'
      and j.jobname <> 'ops-watchdog';
  select count(*) into v_out_fails
    from public.outbound_requests
    where created_at > now() - interval '70 minutes'
      and (status_code >= 400 or error_msg is not null);
  select count(*) into v_errs
    from public.app_errors where created_at > now() - interval '20 minutes';
  select count(*) into v_sec
    from public.security_events
    where created_at > now() - interval '20 minutes'
      and kind not in ('customer_status_changed', 'staff_password_reset', 'sign_in', 'valid_id_deleted');
  select count(*) into v_grants
    from public.security_events
    where created_at > now() - interval '20 minutes' and kind = 'privilege_granted';

  if v_sec > 0 and not exists (select 1 from public.ops_alerts
      where key = 'security' and last_sent > now() - interval '1 hour') then
    if v_grants > 0 then
      v_body := v_body || '&bull; <strong>🚨 ' || v_grants || ' privilege GRANT(s)</strong> — an account just gained admin / owner / a staff role. If this wasn''t you, treat it as a breach. ';
    end if;
    v_body := v_body || '&bull; <strong>' || v_sec || ' security event(s)</strong> (grants / blocked escalation / role-gate edits). Review in Settings &rarr; System health.<br/>';
    insert into public.ops_alerts (key, last_sent) values ('security', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_cron_fails > 0 and not exists (select 1 from public.ops_alerts
      where key = 'ops-cron' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_cron_fails || ' failed cron run(s)</strong> (expiry / mirror / archive / carry-over)<br/>';
    insert into public.ops_alerts (key, last_sent) values ('ops-cron', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_out_fails > 0 and not exists (select 1 from public.ops_alerts
      where key = 'ops-outbound' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_out_fails || ' failed outbound call(s)</strong> (emails / BOC mirror)<br/>';
    insert into public.ops_alerts (key, last_sent) values ('ops-outbound', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;
  if v_errs > 0 and not exists (select 1 from public.ops_alerts
      where key = 'client-errors' and last_sent > now() - interval '6 hours') then
    v_body := v_body || '&bull; <strong>' || v_errs || ' client error(s)</strong> in the last 20 minutes<br/>';
    insert into public.ops_alerts (key, last_sent) values ('client-errors', now())
      on conflict (key) do update set last_sent = now();
    v_send := true;
  end if;

  if v_send then
    select email, full_name into v_email, v_name
      from public.customers where is_root_owner order by created_at limit 1;
    if v_email is null then
      select email, full_name into v_email, v_name
        from public.customers where is_owner order by created_at limit 1;
    end if;
    perform public.send_portal_email(
      v_email, v_name,
      case when v_sec > 0 then '🚨 KTC portal security alert' else 'KTC portal watchdog: something needs a look' end,
      case when v_sec > 0 then 'Security alert' else 'System health alert' end,
      'The portal watchdog found:<br/><br/>' || v_body || '<br/>Details are in Settings &rarr; System health.',
      'https://portal.ktcterminal.com/admin/settings', 'Open System health');
  end if;

  delete from public.app_errors        where created_at < now() - interval '30 days';
  delete from public.outbound_requests where created_at < now() - interval '30 days';
  delete from public.security_events   where created_at < now() - interval '365 days';
  begin
    delete from cron.job_run_details where end_time < now() - interval '14 days';
  exception when others then null;
  end;
end;
$$;
revoke all on function public.check_ops_alerts() from public, anon, authenticated;
