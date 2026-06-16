-- ============================================================
-- 0113 — bulletin posts can carry one attachment (memo file)
--        (owner, 2026-06-17)
--
-- Each bulletin post may attach a single file (a memo / official document).
-- Customers see a "View attachment" button inside the post's modal that opens
-- the file in an in-app viewer (nested modal). Admin uploads; any authenticated
-- user can read (the file is only ever surfaced through a published post, and
-- the read path uses short-lived signed URLs).
-- ============================================================

alter table public.bulletin_posts
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

-- Private bucket — PDF + images, 10 MB cap (room for scanned memos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('bulletin-files', 'bulletin-files', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

-- Read: any authenticated user (needed so customers can mint a signed URL).
drop policy if exists "read bulletin files" on storage.objects;
create policy "read bulletin files" on storage.objects
  for select to authenticated
  using (bucket_id = 'bulletin-files');

-- Write/replace/delete: admins only (same gate as the posts themselves).
drop policy if exists "admin writes bulletin files" on storage.objects;
create policy "admin writes bulletin files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bulletin-files' and public.is_admin());

drop policy if exists "admin updates bulletin files" on storage.objects;
create policy "admin updates bulletin files" on storage.objects
  for update to authenticated
  using (bucket_id = 'bulletin-files' and public.is_admin())
  with check (bucket_id = 'bulletin-files' and public.is_admin());

drop policy if exists "admin deletes bulletin files" on storage.objects;
create policy "admin deletes bulletin files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bulletin-files' and public.is_admin());
