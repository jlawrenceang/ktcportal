-- ============================================================
-- 0232 - Native app push tokens (Capacitor internal APK)
--
-- Adds a separate FCM token store for the Android Capacitor app. Dormant until
-- send-native-push is deployed and Vault has native_push_url/native_push_secret.
-- Existing web push remains unchanged.
-- ============================================================

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text,
  device_id text,
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists native_push_tokens_user_idx on public.native_push_tokens (user_id) where enabled;
create index if not exists native_push_tokens_device_idx on public.native_push_tokens (device_id) where enabled;

alter table public.native_push_tokens enable row level security;

drop policy if exists "manage own native push tokens" on public.native_push_tokens;
create policy "manage own native push tokens" on public.native_push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.native_push_user_ids_for_permission(p_perm text)
returns uuid[] language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(distinct nt.user_id), '{}')
  from public.native_push_tokens nt
  join public.customers c on c.user_id = nt.user_id
  where nt.enabled
    and (
      c.is_owner
      or exists (
        select 1 from public.role_permissions rp
        where rp.allowed and rp.permission = p_perm
          and rp.role = case when c.staff_role is not null then c.staff_role
                             when c.is_admin then 'admin' end
      )
    );
$$;
revoke all on function public.native_push_user_ids_for_permission(text) from public, anon, authenticated;

create or replace function public.native_push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'native_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'native_push_secret';
  if v_url is null or v_secret is null then return new; end if;

  select user_id into v_uid from public.customers where id = new.customer_id;
  if v_uid is null then return new; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('x-native-push-secret', v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(v_uid),
      'title', coalesce(new.title, 'KTC Online Portal'),
      'body', '',
      'url', case when new.kind = 'support_reply' then '/support'
                  when new.job_order_id is not null then '/job-orders'
                  else '/' end
    )
  );
  return new;
end $$;
revoke all on function public.native_push_on_notification() from public, anon, authenticated;

drop trigger if exists notifications_native_push on public.notifications;
create trigger notifications_native_push after insert on public.notifications
  for each row execute function public.native_push_on_notification();

create or replace function public.native_push_on_staff_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uids uuid[]; v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'native_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'native_push_secret';
  if v_url is null or v_secret is null then return new; end if;

  v_uids := public.native_push_user_ids_for_permission(new.required_permission);
  if v_uids is null or array_length(v_uids, 1) is null then return new; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('x-native-push-secret', v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_uids),
      'title', coalesce(new.title, 'KTC Online Portal'),
      'body', '',
      'url', case when new.ticket_id is not null then '/admin/support'
                  when new.job_order_id is not null then '/admin/job-orders'
                  else '/admin' end
    )
  );
  return new;
end $$;
revoke all on function public.native_push_on_staff_notification() from public, anon, authenticated;

drop trigger if exists staff_notifications_native_push on public.staff_notifications;
create trigger staff_notifications_native_push after insert on public.staff_notifications
  for each row execute function public.native_push_on_staff_notification();

notify pgrst, 'reload schema';
