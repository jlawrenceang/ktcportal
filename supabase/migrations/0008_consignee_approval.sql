-- ============================================================
-- 0008 — consignee approval. New consignees require admin approval;
-- only approved ones are visible to brokers.
-- (Existing rows = the established master list -> approved.)
-- ============================================================

alter table public.consignees add column if not exists status text;
alter table public.consignees add column if not exists decided_at timestamptz;

-- rows that existed before this migration are the established list -> approve
update public.consignees set status = 'approved' where status is null;

-- everything added from here on starts pending
alter table public.consignees alter column status set default 'pending';
alter table public.consignees alter column status set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consignees_status_check') then
    alter table public.consignees add constraint consignees_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- brokers see only approved consignees; admins/owner see all
drop policy if exists "consignees readable" on public.consignees;
drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated using (status = 'approved' or public.is_admin());
