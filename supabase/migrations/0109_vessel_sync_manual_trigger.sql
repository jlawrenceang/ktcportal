-- ============================================================
-- 0109 — manual "Sync now" for the vessel schedule.
--
-- vessel-sync runs hourly (0107). Operations also need to push a sheet edit
-- through immediately, so expose a permission-gated RPC that fires the SAME
-- Edge Function on demand via pg_net, reusing the Vault secret (never exposed to
-- the browser). One run both PULLS the sheet's edits in and PUSHES the
-- app-computed Last Free Day mirror back out. Same call shape as the 0107 cron.
-- ============================================================

create or replace function public.trigger_vessel_sync()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Caller gate: only staff who maintain the schedule (owner bypasses).
  if not public.has_permission('manage_vessel_schedule') then
    raise exception 'not authorized to sync the vessel schedule';
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'vessel_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'vessel_sync_secret';
  if v_url is null or v_secret is null then
    return 'not_configured';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('x-cron-secret', v_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  return 'queued';
end;
$$;

-- Client-callable RPC: revoke the blanket default, then grant only authenticated
-- (the in-function has_permission check is the real gate).
revoke execute on function public.trigger_vessel_sync() from public, anon;
grant execute on function public.trigger_vessel_sync() to authenticated;
