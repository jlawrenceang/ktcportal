-- ============================================================
-- 0051 — service catalogue: display order, renames, safe delete
-- (requests 2026-06-12).
--
--   * sort_order — admin-arranged display order (drag & drop in Settings);
--     drives the JO form, bulk paste, calculator, and Settings list.
--   * Renames: "X-ray" → "X-Ray" (all variants), "DEA ONLY" → "DEA"
--     (and "DEA ONLY (For PDEA)" → "DEA (For PDEA)"). Applied to BOTH
--     service_rates and existing job_order_lines in one transaction —
--     pricing matches lines to rates by exact label, so they must move
--     together. Queue mapping (service_line_of) is substring-based and
--     case-insensitive, so lines keep their X-ray/DEA/OOG queues.
--   * Delete guard: a service can be deleted from the client only when it
--     is INACTIVE and no order line references it; otherwise deactivation
--     is the right tool (history keeps its labels + pricing).
-- ============================================================

-- 1) Display order
alter table public.service_rates add column if not exists sort_order int not null default 100;

-- 2) Renames (rates + order lines together)
update public.service_rates    set service        = replace(service, 'X-ray', 'X-Ray')        where service        like '%X-ray%';
update public.job_order_lines  set service_request = replace(service_request, 'X-ray', 'X-Ray') where service_request like '%X-ray%';
update public.service_rates    set service        = replace(service, 'DEA ONLY', 'DEA')        where service        like '%DEA ONLY%';
update public.job_order_lines  set service_request = replace(service_request, 'DEA ONLY', 'DEA') where service_request like '%DEA ONLY%';

-- 3) Canonical order for the seeded catalogue (new services land after, =100)
update public.service_rates s set sort_order = v.ord
from (values
  ('X-Ray', 1),
  ('DEA', 2),
  ('X-Ray + DEA', 3),
  ('X-Ray + DEA (For PDEA)', 4),
  ('DEA (For PDEA)', 5),
  ('OOG Stripping', 6)
) v(name, ord)
where s.service = v.name;

-- 4) Safe-delete guard (server connections bypass via auth.uid() null)
create or replace function public.guard_service_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if auth.uid() is null then return old; end if;
  if old.active then
    raise exception 'Deactivate "%" first, then delete it.', old.service
      using errcode = 'check_violation';
  end if;
  select count(*) into cnt from public.job_order_lines where service_request = old.service;
  if cnt > 0 then
    raise exception '"%" is used by % existing order line(s) — keep it deactivated so their pricing stays intact.', old.service, cnt
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
drop trigger if exists service_rates_guard_delete on public.service_rates;
create trigger service_rates_guard_delete before delete on public.service_rates
  for each row execute function public.guard_service_delete();
