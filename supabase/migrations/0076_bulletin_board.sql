-- ============================================================
-- 0076 — customer bulletin board (owner, 2026-06-15)
--
-- Admin-posted announcements shown on the customer Home as a "bulletin board"
-- of topics; tapping a topic opens its full message in a modal. Admin writes;
-- any authenticated customer reads the PUBLISHED ones (admins also see drafts).
-- ============================================================

create table if not exists public.bulletin_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  is_published boolean not null default true,
  pinned       boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.bulletin_posts enable row level security;
drop policy if exists "read bulletins" on public.bulletin_posts;
create policy "read bulletins" on public.bulletin_posts
  for select to authenticated using (is_published or public.is_admin());
drop policy if exists "admin writes bulletins" on public.bulletin_posts;
create policy "admin writes bulletins" on public.bulletin_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists bulletin_posts_order_idx
  on public.bulletin_posts (pinned desc, sort_order, created_at desc);
