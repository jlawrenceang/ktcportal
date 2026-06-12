-- ============================================================
-- 0053 — valid-ID retention finalized (decision 2026-06-12, supersedes 0052's
-- 7-day window):
--
--   * 0–24h from upload:  file is GUARANTEED kept (no deletion possible —
--                         review/print/save window). Storage policy enforces.
--   * 24h–3 days:         admin may delete manually (🗑 in the file viewer).
--   * at 3 days:          deleted AUTOMATICALLY — two mechanisms:
--                         (a) lazy client purge on admin page loads (instant,
--                             no config), and
--                         (b) hourly cron `purge_expired_ids()` calling the
--                             Storage REST API via pg_net (SQL can't delete
--                             storage objects directly). The cron is a silent
--                             no-op until Vault holds `service_role_key` +
--                             `project_url` (scripts/setup-id-purge.mjs).
-- ============================================================

-- 1) Minimum window: 7 days → 24 hours.
drop policy if exists "admin deletes valid ids" on storage.objects;
create policy "admin deletes valid ids" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'valid-ids'
    and public.is_admin()
    -- minimum 24h retention from upload; unknown age (legacy) and orphaned
    -- files (account deleted) are deletable immediately
    and not exists (
      select 1 from public.customers c
      where c.user_id::text = (storage.foldername(name))[1]
        and c.valid_id_uploaded_at >= now() - interval '24 hours'
    )
  );

-- 2) Server-side auto-purge at 3 days (Storage REST API via pg_net).
create or replace function public.purge_expired_ids()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_key text; v_url text; v_req bigint; v_count int := 0;
  r record;
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  exception when others then v_key := null;
  end;
  if v_key is null or v_url is null then
    return 0; -- not configured yet — lazy client purge still applies
  end if;

  for r in
    select id, valid_id_path from public.customers
    where valid_id_path is not null
      and valid_id_uploaded_at is not null
      and valid_id_uploaded_at < now() - interval '3 days'
    limit 50
  loop
    select net.http_delete(
      url     := v_url || '/storage/v1/object/valid-ids/' || r.valid_id_path,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key)
    ) into v_req;
    insert into public.outbound_requests (kind, label, request_id)
    values ('id_purge', 'auto-delete expired ID (3-day retention)', v_req);
    -- clear the reference; the stamp trigger clears valid_id_uploaded_at
    update public.customers set valid_id_path = null where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.purge_expired_ids() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('purge-expired-ids');
exception when others then null;
end $$;
select cron.schedule('purge-expired-ids', '35 * * * *', $job$ select public.purge_expired_ids(); $job$);
