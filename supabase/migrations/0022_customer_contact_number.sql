-- ============================================================
-- 0022 — capture a contact number at registration.
-- Added to customers and populated by handle_new_user from the signup
-- metadata (works with email-confirmation ON, where there's no session yet).
-- ============================================================

alter table public.customers add column if not exists contact_number text;
comment on column public.customers.contact_number is 'Contact phone number provided at registration.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.customers (user_id, email, full_name, contact_number)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'contact_number','')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
