-- ============================================================
-- 0192 — bulletin board scheduling + expiry (Phase 3 Batch 3D)
--
-- T3-23: bulletin posts can now be scheduled to go live in the future and/or
-- expire automatically. Adds publish_at (defaults to now() so every existing
-- post stays live the instant this runs) and a nullable expires_at (null =
-- never expires).
--
-- Customer visibility is gated by the "read bulletins" RLS SELECT policy. It is
-- extended here so a post is customer-visible ONLY when it is published AND
-- inside its [publish_at, expires_at) window — a scheduled or expired post can
-- therefore never leak to a customer, even via a hand-crafted query. Admins
-- keep full visibility (drafts / scheduled / expired) so they can manage them.
-- ============================================================

-- T3-23: scheduling-window columns (idempotent).
alter table public.bulletin_posts
  add column if not exists publish_at timestamptz not null default now(),  -- T3-23: when the post goes live
  add column if not exists expires_at timestamptz;                          -- T3-23: when it auto-hides (null = never)

-- T3-23: customer SELECT = published AND within the time window; admins see all.
-- This is the correctness-critical gate: it replaces the old `is_published`-only
-- customer branch so scheduled/expired posts are invisible at the row level.
drop policy if exists "read bulletins" on public.bulletin_posts;
create policy "read bulletins" on public.bulletin_posts
  for select to authenticated using (
    (
      is_published
      and publish_at <= now()
      and (expires_at is null or expires_at > now())
    )
    or public.is_admin()
  );

-- T3-23: supports the customer board's order (pinned, sort_order, created_at)
-- restricted to published rows — the common, hot read path.
create index if not exists bulletin_posts_published_order_idx
  on public.bulletin_posts (pinned desc, sort_order, created_at desc)
  where is_published;
