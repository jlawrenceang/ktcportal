-- ============================================================
-- 0234 - published tariff images (2026-07-01)
--
-- Admin-managed image set shown from the Rate Calculator via "View Published
-- Tariff". Private bucket: the app signs short-lived URLs for approved users
-- and staff; admins manage the files.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tariff-images',
  'tariff-images',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read tariff images" on storage.objects;
create policy "read tariff images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tariff-images'
    and (public.is_admin() or public.broker_is_approved())
  );

drop policy if exists "admin writes tariff images" on storage.objects;
create policy "admin writes tariff images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tariff-images' and public.is_admin());

drop policy if exists "admin updates tariff images" on storage.objects;
create policy "admin updates tariff images" on storage.objects
  for update to authenticated
  using (bucket_id = 'tariff-images' and public.is_admin())
  with check (bucket_id = 'tariff-images' and public.is_admin());

drop policy if exists "admin deletes tariff images" on storage.objects;
create policy "admin deletes tariff images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tariff-images' and public.is_admin());
