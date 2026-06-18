-- ============================================================
-- 0115 — security audit hardening (owner, 2026-06-18)
--
-- Follow-up to the 2026-06-18 8-dimension security audit (0 critical/high).
-- Closes the medium/low audit-trail + abuse gaps it surfaced:
--   B) Account-lifecycle decisions (approve / reject / suspend / reactivate)
--      and staff password resets now leave a durable, actor-attributed row in
--      security_events. These are AUDIT rows, not alerts — the watchdog email
--      is told to ignore them so routine approvals don't page the owner.
--   C) post_ticket_message / add_jo_comment get a per-customer 60s throttle so
--      a scripted customer can't flood the staff inbox + phone-push fan-out.
--   D) Ticket subject/body are length-capped server-side (match the existing
--      left()-truncation pattern used by log_client_error / add_jo_comment).
--   E) security_events retention extended 90d -> 365d (forensics window).
--
-- All additive: no existing flow changes behaviour except the new throttle
-- (generous 10/60s ceiling — never trips a human) and the body caps.
-- ============================================================

-- ---------- B) account-lifecycle audit trail ----------
-- AFTER UPDATE OF status on customers: record who/when/from->to/why.
-- log_security_event() stamps actor = auth.uid() (null for cron/service-role,
-- which is itself useful — e.g. expire_unverified_brokers auto-rejections).
create or replace function public.log_customer_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.log_security_event(
      'customer_status_changed', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.decision_reason)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.log_customer_status_change() from public, anon, authenticated;

drop trigger if exists customers_status_audit on public.customers;
create trigger customers_status_audit
  after update of status on public.customers
  for each row execute function public.log_customer_status_change();

-- ---------- B) staff password reset audit ----------
-- Re-create reset_staff_password (0039) verbatim + a log_security_event call.
create or replace function public.reset_staff_password(p_username text, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(trim(p_username)) || '@ktc-staff.local';
begin
  if not coalesce((select is_owner from public.customers where user_id = auth.uid()), false) then
    raise exception 'Only the owner can reset staff passwords';
  end if;
  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'Password must be at least 8 characters and include a letter and a number';
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where email = v_email;
  if not found then raise exception 'No staff account "%"', lower(trim(p_username)); end if;

  perform public.log_security_event(
    'staff_password_reset',
    (select id from public.customers where email = v_email),
    jsonb_build_object('username', lower(trim(p_username)))
  );
end;
$$;
revoke all on function public.reset_staff_password(text, text) from public, anon;
grant execute on function public.reset_staff_password(text, text) to authenticated;

-- ---------- C+D) support: 60s throttle + length caps ----------
-- Open a ticket (caps unchanged at 5 open). Subject/body now length-bounded.
create or replace function public.open_ticket(p_subject text, p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cust   uuid := public.current_broker_id();
  v_cat    text := coalesce(nullif(trim(p_category), ''), 'other');
  v_ticket uuid;
  v_open   int;
begin
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

-- Post a message. Owner-of-ticket or manage_support staff only. Closed = locked.
-- New: customers are throttled to <=10 messages / 60s (anti-flood; staff exempt),
-- and the body is length-capped.
create or replace function public.post_ticket_message(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cust     uuid := public.current_broker_id();
  v_is_staff boolean := public.has_permission('manage_support');
  v_owner    uuid;
  v_status   text;
  v_recent   int;
begin
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  select customer_id, status into v_owner, v_status
  from public.support_tickets where id = p_ticket;
  if not found then
    raise exception 'Support ticket not found.';
  end if;
  if not (v_is_staff or v_owner = v_cust) then
    raise exception 'You don''t have access to this ticket.';
  end if;
  if v_status = 'closed' then
    raise exception 'This ticket is closed. A KTC staffer must reopen it before new messages can be added.';
  end if;

  if not v_is_staff then
    select count(*) into v_recent
    from public.support_messages
    where author = auth.uid() and created_at > now() - interval '60 seconds';
    if v_recent >= 10 then
      raise exception 'You''re sending messages too quickly. Please wait a moment and try again.'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (p_ticket, auth.uid(), v_is_staff, left(trim(p_body), 4000));

  update public.support_tickets
  set last_message_at = now(), updated_at = now(), status = 'open'
  where id = p_ticket;
end;
$$;

revoke all on function public.open_ticket(text, text, text)  from public, anon;
revoke all on function public.post_ticket_message(uuid, text) from public, anon;
grant execute on function public.open_ticket(text, text, text)  to authenticated;
grant execute on function public.post_ticket_message(uuid, text) to authenticated;

-- ---------- C) JO comment throttle ----------
-- Same 60s anti-flood ceiling for non-staff; body cap already left(...,2000).
create or replace function public.add_jo_comment(p_jo uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff  boolean := public.has_permission('view_job_orders');
  v_recent int;
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'Write a comment first.';
  end if;
  if not (
    v_staff
    or exists (select 1 from public.job_orders where id = p_jo and customer_id = public.current_broker_id())
  ) then
    raise exception 'You can only comment on your own job orders.';
  end if;
  if not v_staff then
    select count(*) into v_recent
    from public.job_order_events
    where actor = auth.uid() and event = 'comment' and created_at > now() - interval '60 seconds';
    if v_recent >= 10 then
      raise exception 'You''re commenting too quickly. Please wait a moment and try again.'
        using errcode = 'check_violation';
    end if;
  end if;
  perform public.log_jo_event(p_jo, 'comment', jsonb_build_object('text', left(trim(p_text), 2000)));
end;
$$;
revoke all on function public.add_jo_comment(uuid, text) from public, anon;
grant execute on function public.add_jo_comment(uuid, text) to authenticated;

-- ---------- B+E) watchdog: ignore routine audit kinds, longer retention ----------
-- Re-create check_ops_alerts (0094) verbatim with TWO changes:
--   * v_sec excludes the new audit-only kinds so approvals/resets don't page
--     the owner (privilege grants / blocked escalation / etc. still alert);
--   * security_events retention 90d -> 365d.
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
      and kind not in ('customer_status_changed', 'staff_password_reset');
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
