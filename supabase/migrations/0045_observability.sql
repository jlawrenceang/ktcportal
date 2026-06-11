-- ============================================================
-- 0045 — gap fix G12: observability (errors + cron/outbound health).
--
-- Before this, every background failure was silent: pg_cron jobs (expiry,
-- BOC mirror, archive, carry-over), pg_net sends (emails, mirror calls),
-- and client-side JS errors all vanished. Now:
--
--   * app_errors        — client errors via log_client_error RPC (throttled
--                         client-side; capped server-side; pruned at 30d)
--   * outbound_requests — every pg_net call logs its request id; results
--                         reconciled from net._http_response (status/error)
--   * system_health()   — admin RPC: per-cron last run, outbound failures,
--                         recent client errors (Settings → System health)
--   * ops-watchdog-hourly — cron: reconciles, then emails the OWNER when a
--                         cron run failed, an outbound call failed, or client
--                         errors spike (deduped: max one alert per 6h);
--                         also prunes old rows.
-- ============================================================

-- ---------- 1) client error log ----------
create table if not exists public.app_errors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,                      -- auth.uid(); null = not signed in (login page)
  message    text not null,
  stack      text,
  path       text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at);
alter table public.app_errors enable row level security;

drop policy if exists "admins read app errors" on public.app_errors;
create policy "admins read app errors" on public.app_errors
  for select to authenticated using (public.is_admin());
-- no INSERT policy: writes go through the capped definer RPC only

create or replace function public.log_client_error(
  p_message text, p_stack text default null, p_path text default null, p_ua text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if length(coalesce(trim(p_message), '')) = 0 then return; end if;
  -- flood caps (silent — error reporting must never throw): 20/h per user, 200/h global
  if auth.uid() is not null then
    select count(*) into cnt from public.app_errors
      where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if cnt >= 20 then return; end if;
  end if;
  select count(*) into cnt from public.app_errors where created_at > now() - interval '1 hour';
  if cnt >= 200 then return; end if;

  insert into public.app_errors (user_id, message, stack, path, user_agent)
  values (auth.uid(), left(p_message, 500), left(p_stack, 4000), left(p_path, 300), left(p_ua, 300));
end;
$$;

revoke all on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to anon, authenticated;

-- ---------- 2) outbound-call log (pg_net is fire-and-forget otherwise) ----------
create table if not exists public.outbound_requests (
  id          bigint generated always as identity primary key,
  kind        text not null,           -- 'email' | 'boc_mirror'
  label       text,                    -- subject → recipient / job detail
  request_id  bigint,                  -- net.http_post id, joins net._http_response
  status_code int,
  error_msg   text,
  checked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists outbound_requests_created_idx on public.outbound_requests (created_at);
alter table public.outbound_requests enable row level security;

drop policy if exists "admins read outbound requests" on public.outbound_requests;
create policy "admins read outbound requests" on public.outbound_requests
  for select to authenticated using (public.is_admin());

-- Pull results in from net._http_response (kept ~6h by pg_net; the hourly
-- watchdog reconciles well inside that window).
create or replace function public.reconcile_outbound()
returns void language plpgsql security definer set search_path = public as $$
begin
  begin
    update public.outbound_requests o
    set status_code = r.status_code,
        error_msg   = coalesce(r.error_msg, case when r.timed_out then 'timed out' end),
        checked_at  = now()
    from net._http_response r
    where o.request_id = r.id and o.checked_at is null;
  exception when others then
    raise notice 'reconcile_outbound: %', sqlerrm;
  end;
  -- responses pg_net already discarded — close them out as unknown
  update public.outbound_requests
  set checked_at = now(), error_msg = coalesce(error_msg, 'no response recorded')
  where checked_at is null and created_at < now() - interval '6 hours';
end;
$$;
revoke all on function public.reconcile_outbound() from public, anon, authenticated;

-- send_portal_email (0042) now logs each send.
create or replace function public.send_portal_email(
  p_to text, p_name text, p_subject text, p_headline text,
  p_body_html text, p_url text, p_cta text
)
returns void language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  v_key text; v_from text; v_html text; v_req bigint;
begin
  -- Skip missing addresses and synthetic staff accounts (not deliverable).
  if p_to is null or p_to like '%@ktc-staff.local' then return; end if;

  begin
    select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'resend_api_key';
    select decrypted_secret into v_from from vault.decrypted_secrets where name = 'resend_from';
  exception when others then v_key := null;
  end;
  if v_key is null then
    raise notice 'send_portal_email: no resend_api_key — skipping for %', p_to;
    return;
  end if;
  if v_from is null then v_from := 'KTC Container Terminal <noreply@ktcterminal.com>'; end if;

  v_html := '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f2f5;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
         || '<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e6e7ea;overflow:hidden;">'
         || '<tr><td style="padding:28px 32px 8px;"><img src="https://portal.ktcterminal.com/ktc-logo.png" alt="KTC Container Terminal Corp" height="44" style="display:block;border:0;" /></td></tr>'
         || '<tr><td style="padding:8px 32px 0;"><h1 style="margin:0;font-size:21px;font-weight:600;letter-spacing:-0.02em;color:#1a1c1f;">' || p_headline || '</h1>'
         || '<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#4b4f56;">Hi ' || coalesce(nullif(trim(p_name), ''), 'there') || ', ' || p_body_html || '</p></td></tr>'
         || '<tr><td style="padding:24px 32px 8px;"><a href="' || p_url || '" style="display:inline-block;background:#F26A21;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">' || p_cta || '</a></td></tr>'
         || '<tr><td style="padding:8px 32px 28px;"><p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8a8f98;">If the button doesn''t work, copy this link:<br/><a href="' || p_url || '" style="color:#D6321E;word-break:break-all;">' || p_url || '</a></p></td></tr>'
         || '</table><p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#a0a4ab;text-align:center;">KTC Container Terminal Corp. &middot; portal.ktcterminal.com</p></td></tr></table>';

  begin
    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object('from', v_from, 'to', p_to, 'subject', p_subject, 'html', v_html)
    ) into v_req;
    insert into public.outbound_requests (kind, label, request_id)
    values ('email', p_subject || ' → ' || p_to, v_req);
  exception when others then
    raise notice 'send_portal_email: http_post failed for %: %', p_to, sqlerrm;
  end;
end;
$fn$;

revoke all on function public.send_portal_email(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- BOC mirror call moves into a function so it logs too; cron now calls this.
create or replace function public.run_boc_mirror()
returns void language plpgsql security definer set search_path = public, vault, net as $$
declare v_req bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'boc_mirror_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'boc_mirror_secret') then
    return; -- not configured yet — stay a silent no-op
  end if;
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'boc_mirror_url'),
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'boc_mirror_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_req;
  insert into public.outbound_requests (kind, label, request_id)
  values ('boc_mirror', 'hourly snapshot', v_req);
end;
$$;
revoke all on function public.run_boc_mirror() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('boc-mirror-hourly');
exception when others then null;
end $$;
select cron.schedule('boc-mirror-hourly', '5 * * * *', $job$ select public.run_boc_mirror(); $job$);

-- ---------- 3) health snapshot for the Settings panel ----------
create or replace function public.system_health()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  perform public.reconcile_outbound();
  return jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule,
        'last_run', d.start_time, 'status', d.status, 'message', left(d.return_message, 300)
      ) order by j.jobname)
      from cron.job j
      left join lateral (
        select * from cron.job_run_details where jobid = j.jobid
        order by start_time desc limit 1
      ) d on true
    ), '[]'::jsonb),
    'outbound_failures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', f.kind, 'label', f.label, 'status', f.status_code, 'error', f.error_msg, 'at', f.created_at
      ) order by f.created_at desc)
      from (select * from public.outbound_requests
            where created_at > now() - interval '7 days'
              and (status_code >= 400 or error_msg is not null)
            order by created_at desc limit 20) f
    ), '[]'::jsonb),
    'outbound_24h', (select count(*) from public.outbound_requests where created_at > now() - interval '24 hours'),
    'client_errors_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
    'client_errors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'message', e.message, 'path', e.path, 'at', e.created_at, 'user_id', e.user_id
      ) order by e.created_at desc)
      from (select * from public.app_errors order by created_at desc limit 20) e
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

-- ---------- 4) hourly watchdog: alert the owner, prune old rows ----------
create table if not exists public.ops_alerts (
  key       text primary key,
  last_sent timestamptz not null
);
alter table public.ops_alerts enable row level security; -- server-only (no policies)

create or replace function public.check_ops_alerts()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cron_fails int; v_out_fails int; v_err_spike int;
  v_email text; v_name text; v_body text;
begin
  perform public.reconcile_outbound();

  select count(*) into v_cron_fails
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where d.start_time > now() - interval '70 minutes'
      and d.status = 'failed'
      and j.jobname <> 'ops-watchdog-hourly';
  select count(*) into v_out_fails
    from public.outbound_requests
    where created_at > now() - interval '70 minutes'
      and (status_code >= 400 or error_msg is not null);
  select count(*) into v_err_spike
    from public.app_errors where created_at > now() - interval '60 minutes';

  if v_cron_fails > 0 or v_out_fails > 0 or v_err_spike >= 10 then
    -- dedupe: at most one alert email per 6 hours
    if not exists (select 1 from public.ops_alerts
                   where key = 'ops' and last_sent > now() - interval '6 hours') then
      select email, full_name into v_email, v_name
        from public.customers where is_owner limit 1;
      v_body := 'The portal watchdog found a problem in the last hour:<br/><br/>'
        || case when v_cron_fails > 0 then '&bull; <strong>' || v_cron_fails || ' failed cron run(s)</strong> (expiry / mirror / archive / carry-over)<br/>' else '' end
        || case when v_out_fails  > 0 then '&bull; <strong>' || v_out_fails  || ' failed outbound call(s)</strong> (emails / BOC mirror)<br/>' else '' end
        || case when v_err_spike >= 10 then '&bull; <strong>' || v_err_spike || ' client errors</strong> in the last hour<br/>' else '' end
        || '<br/>Details are in Settings &rarr; System health.';
      perform public.send_portal_email(
        v_email, v_name,
        'KTC portal watchdog: something needs a look',
        'System health alert',
        v_body,
        'https://portal.ktcterminal.com/admin/settings', 'Open System health');
      insert into public.ops_alerts (key, last_sent) values ('ops', now())
        on conflict (key) do update set last_sent = now();
    end if;
  end if;

  -- housekeeping (cheap; idempotent)
  delete from public.app_errors        where created_at < now() - interval '30 days';
  delete from public.outbound_requests where created_at < now() - interval '30 days';
  begin
    delete from cron.job_run_details where end_time < now() - interval '14 days';
  exception when others then null;
  end;
end;
$$;
revoke all on function public.check_ops_alerts() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('ops-watchdog-hourly');
exception when others then null;
end $$;
select cron.schedule('ops-watchdog-hourly', '50 * * * *', $job$ select public.check_ops_alerts(); $job$);
