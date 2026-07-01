-- ============================================================
-- 0233 - bulletin archive (2026-07-01)
--
-- Bulletin posts can now be archived instead of deleted. Archived posts leave
-- the active customer board and admin active list, but remain selectable by
-- admins for review/restore. Customer visibility remains protected by RLS:
-- published + live window + not archived.
-- ============================================================

alter table public.bulletin_posts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

create index if not exists bulletin_posts_archived_idx
  on public.bulletin_posts (archived_at desc)
  where archived_at is not null;

create index if not exists bulletin_posts_active_published_order_idx
  on public.bulletin_posts (pinned desc, sort_order, created_at desc)
  where is_published and archived_at is null;

drop policy if exists "read bulletins" on public.bulletin_posts;
create policy "read bulletins" on public.bulletin_posts
  for select to authenticated using (
    (
      archived_at is null
      and is_published
      and publish_at <= now()
      and (expires_at is null or expires_at > now())
    )
    or public.is_admin()
  );
