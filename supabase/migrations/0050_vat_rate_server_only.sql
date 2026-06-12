-- ============================================================
-- 0050 — VAT rate is server-only (request 2026-06-12).
--
-- PH VAT is statutory (12%, TRAIN law) — it must not be editable from the
-- portal, even by an admin with manage_pricing. The UI shows it read-only;
-- this trigger enforces it: any client session (auth.uid() set) changing
-- pricing_settings.vat_rate is rejected. Server connections (postgres /
-- migrations) can still change it if the law ever does.
-- ============================================================

create or replace function public.guard_vat_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and old.key = 'vat_rate'
     and new.value is distinct from old.value then
    raise exception 'The VAT rate is fixed by law (12%%) and can only be changed server-side.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_settings_guard_vat on public.pricing_settings;
create trigger pricing_settings_guard_vat before update on public.pricing_settings
  for each row execute function public.guard_vat_rate();

-- belt & braces: deleting the row would break the calculator — block client deletes too
create or replace function public.guard_vat_rate_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.key = 'vat_rate' then
    raise exception 'The VAT rate setting can''t be removed.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
drop trigger if exists pricing_settings_guard_vat_delete on public.pricing_settings;
create trigger pricing_settings_guard_vat_delete before delete on public.pricing_settings
  for each row execute function public.guard_vat_rate_delete();
