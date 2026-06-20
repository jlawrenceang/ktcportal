-- ============================================================
-- 0121 — owner-only "send a test push" RPC (2026-06-20).
-- Lets the owner fire a REAL Web Push to any user's subscribed devices from the
-- admin UI, to confirm delivery — without creating a notification row. Reuses the
-- same Vault url/secret + pg_net path as the 0114 triggers. Returns the number of
-- target subscriptions so the UI can report scope (0 = user not subscribed).
-- ============================================================
create or replace function public.owner_send_test_push(
  p_user_id uuid,
  p_title   text default 'KTC test 🔔',
  p_body    text default 'This is a test notification from KTC Online Portal.'
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text; v_count int;
begin
  -- Owner-only (server-enforced; never trust the frontend).
  if not coalesce((select is_owner from public.customers where user_id = auth.uid()), false) then
    raise exception 'Only the owner can send test notifications' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_count from public.push_subscriptions where user_id = p_user_id;
  if v_count = 0 then return 0; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then
    raise exception 'Push is not configured yet (missing Vault push_url / push_secret).';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('x-push-secret', v_secret, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'user_ids', jsonb_build_array(p_user_id),
      'title', coalesce(nullif(btrim(p_title), ''), 'KTC test 🔔'),
      'body', coalesce(p_body, ''),
      'url', '/'
    )
  );
  return v_count;
end $$;

revoke all on function public.owner_send_test_push(uuid, text, text) from public, anon;
grant execute on function public.owner_send_test_push(uuid, text, text) to authenticated;
