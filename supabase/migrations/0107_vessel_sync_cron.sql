-- ============================================================
-- 0107 — hourly trigger for the vessel-schedule sync (one-way Sheet -> app).
--
-- pg_cron calls the vessel-sync Edge Function every hour at :20 (staggered from
-- the boc-mirror :05 job), passing the shared secret. Both the URL and secret
-- live in Vault and are written by scripts/setup-vessel-sync.mjs — until they
-- exist this job is a silent no-op, so the migration is safe to apply before the
-- function is configured. Same pattern as the boc-mirror job (0037).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('vessel-sync-hourly');
exception when others then null; -- not scheduled yet
end $$;

select cron.schedule(
  'vessel-sync-hourly',
  '20 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'vessel_sync_url'),
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vessel_sync_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'vessel_sync_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'vessel_sync_secret');
  $job$
);
