-- 0235 - Customer email change confirmation owned by the new email.
-- Supabase's built-in secure email change can send the actionable link to the
-- current email depending on project settings. KTC's UX requires:
--   1) confirmation link goes to the NEW email address,
--   2) current email gets a security notice only,
--   3) auth/customers email changes only after the new address confirms.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.customer_email_change_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null,
  old_email text not null,
  new_email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  confirmed_at timestamptz,
  superseded_at timestamptz
);

create index if not exists customer_email_change_requests_customer_idx
  on public.customer_email_change_requests(customer_id, created_at desc);
create index if not exists customer_email_change_requests_open_idx
  on public.customer_email_change_requests(token_hash)
  where confirmed_at is null and superseded_at is null;

alter table public.customer_email_change_requests enable row level security;
revoke all on public.customer_email_change_requests from public, anon, authenticated;

drop policy if exists "customers read own email change requests" on public.customer_email_change_requests;
create policy "customers read own email change requests" on public.customer_email_change_requests
for select using (user_id = auth.uid());

create or replace function public.request_customer_email_change(
  p_new_email text,
  p_redirect_base text default 'https://portal.ktcterminal.com'
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer public.customers%rowtype;
  v_new text := lower(trim(coalesce(p_new_email, '')));
  v_old text;
  v_token text;
  v_hash text;
  v_base text;
  v_url text;
begin
  select * into v_customer from public.customers where user_id = auth.uid();
  if v_customer.id is null then
    raise exception 'Customer account not found.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(v_customer.email, '') like '%@ktc-staff.local' then
    raise exception 'Staff emails are managed by the owner.' using errcode = 'insufficient_privilege';
  end if;

  v_old := lower(trim(coalesce(v_customer.email, auth.email(), '')));
  if v_new !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid new email address.' using errcode = 'check_violation';
  end if;
  if v_new = v_old then
    raise exception 'That is already your email.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_new and id <> auth.uid()) then
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.customers where lower(email) = v_new and user_id <> auth.uid()) then
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;

  update public.customer_email_change_requests
     set superseded_at = now()
   where customer_id = v_customer.id
     and confirmed_at is null
     and superseded_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_base := case
    when trim(coalesce(p_redirect_base, '')) = 'https://portal.ktcterminal.com'
      then 'https://portal.ktcterminal.com'
    when trim(coalesce(p_redirect_base, '')) like 'http://localhost:%'
      then rtrim(trim(p_redirect_base), '/')
    when trim(coalesce(p_redirect_base, '')) like 'http://127.0.0.1:%'
      then rtrim(trim(p_redirect_base), '/')
    else 'https://portal.ktcterminal.com'
  end;
  v_url := v_base || '/email-change-confirm?token=' || v_token;

  insert into public.customer_email_change_requests(customer_id, user_id, old_email, new_email, token_hash)
  values (v_customer.id, auth.uid(), v_old, v_new, v_hash);

  perform public.send_portal_email(
    v_new,
    coalesce(v_customer.full_name, 'there'),
    'Confirm your new KTC portal email',
    'Confirm your new email',
    'please confirm that this email address should be used for your KTC Online Portal account. Your account email will not change until you confirm this link.',
    v_url,
    'Confirm new email'
  );

  perform public.send_portal_email(
    v_old,
    coalesce(v_customer.full_name, 'there'),
    'Security notice: KTC portal email change requested',
    'Email change requested',
    'a request was made to change your KTC Online Portal email address. If this was you, no action is needed. If this was not you, contact KTC support immediately or file a support report in the portal.',
    'https://portal.ktcterminal.com/support',
    'Contact support'
  );

  return 'sent';
end;
$$;

create or replace function public.confirm_customer_email_change(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_req public.customer_email_change_requests%rowtype;
begin
  select * into v_req
    from public.customer_email_change_requests
   where token_hash = v_hash
     and confirmed_at is null
     and superseded_at is null
   for update;

  if v_req.id is null then
    raise exception 'This email-change link is invalid or has already been used.' using errcode = 'invalid_parameter_value';
  end if;
  if v_req.expires_at < now() then
    update public.customer_email_change_requests set superseded_at = now() where id = v_req.id;
    raise exception 'This email-change link has expired. Please request a new one.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(v_req.new_email) and id <> v_req.user_id) then
    update public.customer_email_change_requests set superseded_at = now() where id = v_req.id;
    raise exception 'That email already has an account.' using errcode = 'unique_violation';
  end if;

  update auth.users
     set email = v_req.new_email,
         email_confirmed_at = now(),
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_sent_at = null,
         email_change_confirm_status = 0,
         updated_at = now(),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('email', v_req.new_email, 'email_verified', true)
   where id = v_req.user_id;

  update auth.identities
     set email = v_req.new_email,
         identity_data = coalesce(identity_data, '{}'::jsonb)
           || jsonb_build_object('email', v_req.new_email, 'email_verified', true),
         updated_at = now()
   where user_id = v_req.user_id
     and provider = 'email';

  update public.customers
     set email = v_req.new_email
   where id = v_req.customer_id;

  update public.customer_email_change_requests
     set confirmed_at = now()
   where id = v_req.id;

  return 'confirmed';
end;
$$;

revoke all on function public.request_customer_email_change(text, text) from public, anon;
grant execute on function public.request_customer_email_change(text, text) to authenticated;

revoke all on function public.confirm_customer_email_change(text) from public, anon, authenticated;
grant execute on function public.confirm_customer_email_change(text) to anon, authenticated;
