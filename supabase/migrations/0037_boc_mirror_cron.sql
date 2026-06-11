-- ============================================================
-- 0037 — hourly trigger for the BOC Sheets mirror (one-way app → Sheet).
--
-- pg_cron calls the boc-mirror Edge Function every hour at :05, passing the
-- shared secret. Both the URL and the secret live in Vault and are written by
-- scripts/setup-boc-mirror.mjs — until they exist this job is a silent no-op,
-- so the migration is safe to apply before the function is configured.
-- Same pattern as the email + expiry jobs (0015 / 0018).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('boc-mirror-hourly');
exception when others then null; -- not scheduled yet
end $$;

select cron.schedule(
  'boc-mirror-hourly',
  '5 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'boc_mirror_url'),
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'boc_mirror_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'boc_mirror_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'boc_mirror_secret');
  $job$
);
