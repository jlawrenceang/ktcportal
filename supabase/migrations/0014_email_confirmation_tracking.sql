-- ============================================================
-- 0014 — mirror auth email-confirmation status onto the broker row
-- so admins can see whether a broker has confirmed their email.
-- ============================================================

alter table public.brokers add column if not exists email_confirmed_at timestamptz;
comment on column public.brokers.email_confirmed_at is 'When the broker confirmed their email (mirrored from auth.users.email_confirmed_at).';

-- Keep it in sync: when auth.users.email_confirmed_at changes, copy it over.
create or replace function public.sync_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.brokers set email_confirmed_at = new.email_confirmed_at where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update on auth.users
  for each row execute function public.sync_email_confirmed();

-- Backfill existing brokers from the current auth state.
update public.brokers b
set email_confirmed_at = u.email_confirmed_at
from auth.users u
where u.id = b.user_id and b.email_confirmed_at is null and u.email_confirmed_at is not null;
