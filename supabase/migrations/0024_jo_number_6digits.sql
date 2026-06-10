-- ============================================================
-- 0024 — widen the JO series to 6 digits: 'JO-000001'.
-- (No existing job orders to migrate.)
-- ============================================================

create or replace function public.ensure_jo_number()
returns trigger language plpgsql as $$
begin
  if new.jo_number is null and new.status in ('submitted','processing','completed') then
    new.jo_number := 'JO-' || lpad(nextval('public.jo_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
