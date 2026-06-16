-- ============================================================
-- 0111 — vessel v2 review fixes: case-robust in-house hiding + hardened staff gate
--
-- Adversarial review of 0110 surfaced two real issues:
--  * The customer-hiding SELECT policy compared shipping_line with an exact,
--    case- and whitespace-sensitive `not in (...)`. The Google-Sheet path is
--    dropdown-bounded, but the admin free-text datalist, the CSV import, and the
--    Edge sync all store the line verbatim — so "gothong" or "Gothong " (trailing
--    space) does NOT match the seeded internal name, the NOT IN is TRUE, and the
--    in-house vessel leaks to customers. shipping_line is a soft text ref (FK
--    dropped in 0059), so match case-insensitively on a trimmed comparison.
--  * current_is_staff() (the sole gate that reveals internal-line vessels to
--    staff) omitted session_alive()/aal_satisfied(), unlike every other RLS
--    helper (0049 MFA, 0055 dead-session). An evicted or password-only-MFA staff
--    session therefore kept seeing in-house vessels until JWT expiry. Weave both
--    in to match the hardened-helper pattern (it's SECURITY DEFINER, so it can
--    call the helpers authenticated can't execute directly).
-- ============================================================

create or replace function public.current_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_alive() and public.aal_satisfied() and exists (
    select 1 from public.customers c
    where c.user_id = auth.uid() and (c.is_admin or c.is_owner or c.staff_role is not null)
  );
$$;

drop policy if exists "read vessel schedule" on public.vessel_schedule;
create policy "read vessel schedule" on public.vessel_schedule
  for select to authenticated using (
    public.current_is_staff()
    or shipping_line is null
    or lower(btrim(shipping_line)) not in (
      select lower(btrim(name)) from public.shipping_lines where internal
    )
  );
