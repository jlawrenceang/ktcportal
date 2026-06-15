-- ============================================================
-- 0077 — bulletin read state (owner, 2026-06-15)
--
-- Tracks which bulletin posts each customer has opened, so the board can show
-- an unread dot and clear it once a topic is read. Per-customer, own rows only.
-- ============================================================

create table if not exists public.bulletin_reads (
  customer_id uuid not null references public.customers(id) on delete cascade,
  post_id     uuid not null references public.bulletin_posts(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (customer_id, post_id)
);

alter table public.bulletin_reads enable row level security;
drop policy if exists "own bulletin reads" on public.bulletin_reads;
create policy "own bulletin reads" on public.bulletin_reads
  for all to authenticated
  using (customer_id = public.current_broker_id())
  with check (customer_id = public.current_broker_id());

-- Mark one post read for the current customer (idempotent).
create or replace function public.mark_bulletin_read(p_post uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.bulletin_reads (customer_id, post_id)
  select public.current_broker_id(), p_post
  where public.current_broker_id() is not null
  on conflict (customer_id, post_id) do nothing;
$$;
revoke all on function public.mark_bulletin_read(uuid) from public, anon;
grant execute on function public.mark_bulletin_read(uuid) to authenticated;
