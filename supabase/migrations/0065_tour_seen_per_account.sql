-- ============================================================
-- 0065 — "tour seen" is per ACCOUNT, not per browser (owner, 2026-06-13)
--
-- The guided walkthrough used to be gated by a localStorage flag, so it never
-- re-appeared in a browser that had seen it once — even for a brand-new
-- account. Move the gate to the customer row so every new customer/staff
-- account gets the walkthrough on first login, on any device. A help (?) icon
-- replays it on demand.
-- ============================================================

alter table public.customers add column if not exists tour_seen boolean not null default false;

create or replace function public.mark_tour_seen()
returns void language sql security definer set search_path = public as $$
  update public.customers set tour_seen = true where user_id = auth.uid();
$$;
revoke all on function public.mark_tour_seen() from public, anon;
grant execute on function public.mark_tour_seen() to authenticated;
