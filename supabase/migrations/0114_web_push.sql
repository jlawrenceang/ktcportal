-- ============================================================
-- 0114 — Web Push notifications (phone alerts) — owner, 2026-06-17
--
-- Lets staff + customers receive real push notifications on their phone
-- (Android now; iOS once the portal is installed to the home screen). A browser
-- registers a PushSubscription which we store; whenever a notification row is
-- created, an AFTER INSERT trigger fire-and-forgets a pg_net call to the
-- `send-push` Edge Function (scripts/setup-push.mjs deploys it + writes the
-- Vault url/secret). Until those Vault rows exist the triggers are silent
-- no-ops, so this migration is safe to apply before the function is configured.
--
-- pg_net is async/fire-and-forget: a push failure NEVER blocks the notification
-- insert (low blast radius).
-- ============================================================

create extension if not exists pg_net;

-- ---------- stored browser subscriptions ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "manage own push subs" on public.push_subscriptions;
create policy "manage own push subs" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- public config (the VAPID public key the browser subscribes with) ----------
create table if not exists public.push_config (key text primary key, value text);
alter table public.push_config enable row level security;
drop policy if exists "read push config" on public.push_config;
create policy "read push config" on public.push_config
  for select to authenticated using (true);
-- No write policy → only the service role (setup script) writes it.

-- ---------- recipient resolution (staff who can see a given permission) ----------
-- Returns the user_ids of SUBSCRIBED staff whose effective role grants p_perm
-- (owner always; otherwise via role_permissions). Trigger-only: revoked from
-- callers so it can't be used to enumerate users.
create or replace function public.push_user_ids_for_permission(p_perm text)
returns uuid[] language sql security definer set search_path = public stable as $$
  select coalesce(array_agg(distinct ps.user_id), '{}')
  from public.push_subscriptions ps
  join public.customers c on c.user_id = ps.user_id
  where c.is_owner
     or exists (
       select 1 from public.role_permissions rp
       where rp.allowed and rp.permission = p_perm
         and rp.role = case when c.staff_role is not null then c.staff_role
                            when c.is_admin then 'admin' end
     );
$$;
revoke all on function public.push_user_ids_for_permission(text) from public, anon, authenticated;

-- ---------- trigger: customer notification → push the owning customer ----------
create or replace function public.push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;

  select user_id into v_uid from public.customers where id = new.customer_id;
  if v_uid is null then return new; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('x-push-secret', v_secret, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
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
revoke all on function public.push_on_notification() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_on_notification();

-- ---------- trigger: staff notification → push the staff who can see it ----------
create or replace function public.push_on_staff_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uids uuid[]; v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;

  v_uids := public.push_user_ids_for_permission(new.required_permission);
  if v_uids is null or array_length(v_uids, 1) is null then return new; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('x-push-secret', v_secret, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
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
revoke all on function public.push_on_staff_notification() from public, anon, authenticated;

drop trigger if exists staff_notifications_push on public.staff_notifications;
create trigger staff_notifications_push after insert on public.staff_notifications
  for each row execute function public.push_on_staff_notification();
