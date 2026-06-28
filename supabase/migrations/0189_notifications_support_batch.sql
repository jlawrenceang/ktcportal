-- ============================================================
-- 0189 — Phase 2 Batch D: notifications & support (owner, 2026-06-28)
--
-- Audit T2-22/23/25 (T2-24 is a frontend copy/filter change — see src/).
--   T2-22 · notify_staff_account fired ONLY on the first ID upload
--           (old.valid_id_path IS NULL), so a name-change re-verification
--           (approved→pending with the ID still on file) never pinged the
--           approvals desk. Add a branch for that gap, guarded on
--           new.valid_id_path IS NOT NULL so it can never double-fire with the
--           first-upload branch (which requires old.valid_id_path IS NULL) —
--           robust whether or not the re-verify path clears the ID.
--   T2-23 · staff_unread_count() — exact unread count for the staff bell, which
--           today derives unread from only the latest 20 rows (under-counts).
--   T2-25 · staff_open_ticket() — let manage_support staff open a ticket on a
--           customer's behalf (phone / walk-in / proactive); mirrors open_ticket
--           (0083) but customer-scoped + no per-customer cap.
--
-- notify_staff_account recreated from 0085 VERBATIM + the one added branch.
-- ============================================================

-- ------------------------------------------------------------
-- T2-22 — also ping the approvals desk on a re-verification (approved→pending).
-- ------------------------------------------------------------
create or replace function public.notify_staff_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- first ID upload by a pending account (unchanged from 0085)
  if new.valid_id_path is not null and old.valid_id_path is null and new.status = 'pending' then
    perform public.notify_staff(
      'manage_approvals', 'account',
      'New account awaiting verification: ' || coalesce(new.full_name, ''), null, null);
  end if;
  -- T2-22: a profile change re-pended an approved account WITHOUT clearing the
  -- ID (the gap the branch above misses). The first-upload branch can't also
  -- fire here (it needs old.valid_id_path IS NULL), so no duplicate.
  if old.status = 'approved' and new.status = 'pending' and new.valid_id_path is not null then
    perform public.notify_staff(
      'manage_approvals', 'account',
      'Account re-verification needed (profile change): ' || coalesce(new.full_name, ''), null, null);
  end if;
  return new;
end;
$$;
-- (trigger customers_notify_staff_account already bound in 0085 — unchanged.)

-- ------------------------------------------------------------
-- T2-23 — exact unread count for the staff bell (not capped at the latest 20).
-- ------------------------------------------------------------
create or replace function public.staff_unread_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.staff_notifications sn
  where public.has_permission(sn.required_permission)
    and not exists (
      select 1 from public.staff_notification_reads r
      where r.notification_id = sn.id and r.staff_uid = auth.uid());
$$;
revoke all on function public.staff_unread_count() from public, anon;
grant execute on function public.staff_unread_count() to authenticated;

-- ------------------------------------------------------------
-- T2-25 — staff open a ticket on a customer's behalf (phone / walk-in / proactive).
-- Mirrors open_ticket (0083) but customer-scoped, no per-customer cap, and the
-- first message is logged is_staff=true (so notify_support_reply lets the
-- customer see the thread). Category validated by the support_tickets CHECK.
-- ------------------------------------------------------------
create or replace function public.staff_open_ticket(
  p_customer uuid, p_subject text, p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cat    text := coalesce(nullif(trim(p_category), ''), 'other');
  v_ticket uuid;
begin
  if not public.has_permission('manage_support') then
    raise exception 'You don''t have permission to open support tickets.';
  end if;
  if not exists (select 1 from public.customers where id = p_customer) then
    raise exception 'Select a valid customer.';
  end if;
  if length(coalesce(trim(p_subject), '')) = 0 then
    raise exception 'Please enter a subject.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;

  insert into public.support_tickets (customer_id, subject, category)
  values (p_customer, trim(p_subject), v_cat)
  returning id into v_ticket;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (v_ticket, auth.uid(), true, trim(p_body));

  return v_ticket;
end;
$$;
revoke all on function public.staff_open_ticket(uuid, text, text, text) from public, anon;
grant execute on function public.staff_open_ticket(uuid, text, text, text) to authenticated;
