-- ============================================================
-- 0112 — support: new categories, open/closed only, locked-on-close
--        (owner, 2026-06-17)
--
-- Three changes to the 0083 support framework:
--   1. Expanded categories — add App/System (bugs + system concerns),
--      Customer service, and Operations alongside the originals.
--   2. Status collapses to OPEN / CLOSED only. "answered" (which just meant
--      "KTC replied") was redundant with an open conversation, so it folds
--      into 'open'.
--   3. A CLOSED ticket is LOCKED — no new messages from either side until a
--      staffer reopens it (post_ticket_message rejects a closed ticket).
-- ============================================================

-- ---------- 1) categories ----------
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets
  add constraint support_tickets_category_check
  check (category in (
    'account','accreditation','job_order','payment',
    'app_system','customer_service','operations','other'
  ));

-- ---------- 2) status: open / closed only ----------
update public.support_tickets set status = 'open' where status = 'answered';
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open','closed'));

-- ---------- 3) RPCs ----------
-- Open a ticket. Accept the expanded category set; cap = 5 OPEN tickets.
create or replace function public.open_ticket(p_subject text, p_category text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cust   uuid := public.current_broker_id();
  v_cat    text := coalesce(nullif(trim(p_category), ''), 'other');
  v_ticket uuid;
  v_open   int;
begin
  if v_cust is null then
    raise exception 'Only customers can open support tickets.';
  end if;
  if length(coalesce(trim(p_subject), '')) = 0 then
    raise exception 'Please enter a subject.' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  if v_cat not in ('account','accreditation','job_order','payment',
                   'app_system','customer_service','operations','other') then
    raise exception 'Unknown category %.', v_cat;
  end if;

  select count(*) into v_open
  from public.support_tickets
  where customer_id = v_cust and status = 'open';
  if v_open >= 5 then
    raise exception 'You already have 5 open support tickets. Please close one before opening another.';
  end if;

  insert into public.support_tickets (customer_id, subject, category)
  values (v_cust, trim(p_subject), v_cat)
  returning id into v_ticket;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (v_ticket, auth.uid(), false, trim(p_body));

  return v_ticket;
end;
$$;

-- Post a message. Owner-of-ticket or manage_support staff only. A CLOSED ticket
-- is locked: nobody can post until a staffer reopens it. Any message keeps the
-- ticket 'open' (no more 'answered').
create or replace function public.post_ticket_message(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cust     uuid := public.current_broker_id();
  v_is_staff boolean := public.has_permission('manage_support');
  v_owner    uuid;
  v_status   text;
begin
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  select customer_id, status into v_owner, v_status
  from public.support_tickets where id = p_ticket;
  if not found then
    raise exception 'Support ticket not found.';
  end if;
  if not (v_is_staff or v_owner = v_cust) then
    raise exception 'You don''t have access to this ticket.';
  end if;
  if v_status = 'closed' then
    raise exception 'This ticket is closed. A KTC staffer must reopen it before new messages can be added.';
  end if;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (p_ticket, auth.uid(), v_is_staff, trim(p_body));

  update public.support_tickets
  set last_message_at = now(), updated_at = now(), status = 'open'
  where id = p_ticket;
end;
$$;

-- Staff set the ticket status — open / closed only now.
create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('manage_support') then
    raise exception 'You don''t have permission to manage support tickets.';
  end if;
  if p_status not in ('open','closed') then
    raise exception 'Unknown status %.', p_status;
  end if;
  update public.support_tickets
  set status = p_status, updated_at = now()
  where id = p_ticket;
  if not found then raise exception 'Support ticket not found.'; end if;
end;
$$;

-- Re-assert the grants (create or replace keeps them, but be explicit).
revoke all on function public.open_ticket(text, text, text)   from public, anon;
revoke all on function public.post_ticket_message(uuid, text)  from public, anon;
revoke all on function public.set_ticket_status(uuid, text)    from public, anon;
grant execute on function public.open_ticket(text, text, text)  to authenticated;
grant execute on function public.post_ticket_message(uuid, text) to authenticated;
grant execute on function public.set_ticket_status(uuid, text)   to authenticated;
