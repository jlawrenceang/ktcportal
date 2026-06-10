-- ============================================================
-- 0027 — let admins delete valid-ID files, so an approved/suspended
-- customer's ID is removed once it's been reviewed (data minimisation,
-- DPA storage limitation). The frontend deletes the file on the approve/
-- suspend decision and clears customers.valid_id_path.
-- ============================================================

drop policy if exists "admin deletes valid ids" on storage.objects;
create policy "admin deletes valid ids" on storage.objects
  for delete to authenticated
  using (bucket_id = 'valid-ids' and public.is_admin());
