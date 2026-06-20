-- ============================================================
-- 0120 — consignees can be approved WITHOUT full accreditation details.
-- Business decision (2026-06-20): the seeded master list has only name + code.
-- We approve consignees so they're immediately pickable in job orders and fill
-- in address / TIN / 2303 as we go. The hard pre-approval requirement from 0009
-- is dropped; the admin UI still flags incomplete records as a soft warning.
-- (Reversible: restore the 0009 body to re-enforce.)
-- ============================================================
create or replace function public.guard_consignee_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 0009 required address + TIN + 2303 before approval; now optional —
  -- completeness is encouraged in the admin UI, not DB-enforced.
  return new;
end;
$$;
