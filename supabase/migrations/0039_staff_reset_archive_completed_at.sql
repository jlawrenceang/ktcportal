-- ============================================================
-- 0039 — gap fixes G7 + G4/G5 support + weekly archive (2026-06-11).
--
-- 1) reset_staff_password — owner-only. Staff sign in with synthetic
--    @ktc-staff.local emails, so the email reset flow can't reach them; a
--    locked-out checker/cashier previously meant a new account.
-- 2) completed_at — stamped when a JO reaches 'completed' (the checker RPC
--    and the admin button both just set status, so a trigger catches both).
--    Drives the unpaid-completed AGING report (G4).
-- 3) Archive — archived_at on job_orders. A JO is archivable once it's
--    COMPLETED + PAID (service_invoice_no on file). Weekly pg_cron run
--    (Mon 00:30 PH) + a manual "archive now" RPC for staff. Archived orders
--    leave the default admin queue (an Archived filter still shows them);
--    customers keep seeing their own history unchanged.
-- ============================================================

-- 1) Owner-only staff password reset (same policy as create_staff: 8+ w/ letter+digit).
create or replace function public.reset_staff_password(p_username text, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := lower(trim(p_username)) || '@ktc-staff.local';
begin
  if not coalesce((select is_owner from public.customers where user_id = auth.uid()), false) then
    raise exception 'Only the owner can reset staff passwords';
  end if;
  if length(coalesce(p_password, '')) < 8
     or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'Password must be at least 8 characters and include a letter and a number';
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where email = v_email;
  if not found then raise exception 'No staff account "%"', lower(trim(p_username)); end if;
end;
$$;
revoke all on function public.reset_staff_password(text, text) from public, anon;
grant execute on function public.reset_staff_password(text, text) to authenticated;

-- 2) completed_at stamp (for unpaid-completed aging).
alter table public.job_orders add column if not exists completed_at timestamptz;

create or replace function public.stamp_completed_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists job_orders_completed_at on public.job_orders;
create trigger job_orders_completed_at before update of status on public.job_orders
  for each row execute function public.stamp_completed_at();

-- Backfill existing completed orders (best effort: x-ray stamp, else created).
update public.job_orders
set completed_at = coalesce(xray_performed_at, created_at)
where status = 'completed' and completed_at is null;

-- 3) Archive.
alter table public.job_orders add column if not exists archived_at timestamptz;
create index if not exists job_orders_archived_idx on public.job_orders (archived_at) where archived_at is not null;

-- Archives every COMPLETED + PAID, not-yet-archived order. Callable by staff
-- with process_job_orders (manual button) and by the cron (no auth context).
create or replace function public.archive_done_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is not null and not public.has_permission('process_job_orders') then
    raise exception 'You don''t have permission to archive job orders.';
  end if;
  update public.job_orders
  set archived_at = now()
  where status = 'completed'
    and service_invoice_no is not null
    and archived_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.archive_done_orders() from public, anon;
grant execute on function public.archive_done_orders() to authenticated;

-- Weekly run: Monday 00:30 Asia/Manila = Sunday 16:30 UTC.
do $$
begin
  perform cron.unschedule('archive-done-orders-weekly');
exception when others then null;
end $$;
select cron.schedule(
  'archive-done-orders-weekly',
  '30 16 * * 0',
  $job$ select public.archive_done_orders(); $job$
);
