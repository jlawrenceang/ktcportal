-- ============================================================
-- 0083 — customer support tickets (framework)
--
-- A logged system-of-record for customer support. Customers open tickets and
-- exchange threaded messages with KTC staff. A "talk to an agent" hand-off
-- deep-links to call / email / Viber / SMS off-platform; that choice is logged
-- back onto the ticket so the conversation trail stays complete.
--
-- Access model mirrors the rest of the portal:
--   * customers see/act on their OWN tickets (current_broker_id());
--   * staff with the new 'manage_support' gate see/act on ALL tickets;
--   * all WRITES go through SECURITY DEFINER RPCs (no direct insert/update
--     policies) so ownership, caps, and status transitions are enforced
--     server-side. RLS exposes SELECT only.
--
-- A staff reply also raises a customer notification (kind 'support_reply',
-- via the 0071 notifications table) so the bell picks it up.
-- ============================================================

-- ---------- tables ----------
create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers(id) on delete cascade,
  subject         text not null,
  category        text not null default 'other'
                    check (category in ('account','accreditation','job_order','payment','other')),
  status          text not null default 'open'
                    check (status in ('open','answered','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists support_tickets_customer_idx
  on public.support_tickets (customer_id, last_message_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, last_message_at desc);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author      uuid,
  is_staff    boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);

-- ---------- permission gate ----------
-- Staff support inbox is gated on 'manage_support'. Admin + operations handle
-- support; cashier + checker do not (seeded false so they're visible in the
-- owner's Settings matrix and explicitly off). Owner bypasses via has_permission.
insert into public.role_permissions (role, permission, allowed) values
  ('admin',      'manage_support', true),
  ('operations', 'manage_support', true),
  ('cashier',    'manage_support', false),
  ('checker',    'manage_support', false)
on conflict (role, permission) do nothing;

-- ---------- RLS ----------
alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;

-- Customers read their own tickets; staff with the gate read all.
drop policy if exists "read own or managed tickets" on public.support_tickets;
create policy "read own or managed tickets" on public.support_tickets
  for select to authenticated
  using (customer_id = public.current_broker_id() or public.has_permission('manage_support'));

-- Messages are readable when the parent ticket is readable (same condition).
drop policy if exists "read messages of readable tickets" on public.support_messages;
create policy "read messages of readable tickets" on public.support_messages
  for select to authenticated
  using (exists (
    select 1 from public.support_tickets st
    where st.id = ticket_id
      and (st.customer_id = public.current_broker_id() or public.has_permission('manage_support'))
  ));

-- No INSERT/UPDATE/DELETE policies — all writes go through the RPCs below.

-- ---------- RPCs ----------
-- Open a new ticket + its first message. Cap: max 5 open/answered tickets per
-- customer (closed tickets don't count) to keep the queue sane.
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
  if v_cat not in ('account','accreditation','job_order','payment','other') then
    raise exception 'Unknown category %.', v_cat;
  end if;

  select count(*) into v_open
  from public.support_tickets
  where customer_id = v_cust and status in ('open','answered');
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

-- Post a message to a ticket. Owner-of-ticket or manage_support staff only.
-- A staff reply -> 'answered'; a customer message -> 'open' (reopens a closed
-- ticket if the customer writes again).
create or replace function public.post_ticket_message(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cust     uuid := public.current_broker_id();
  v_is_staff boolean := public.has_permission('manage_support');
  v_owner    uuid;
begin
  if length(coalesce(trim(p_body), '')) = 0 then
    raise exception 'Please enter a message.' using errcode = 'check_violation';
  end if;
  select customer_id into v_owner from public.support_tickets where id = p_ticket;
  if not found then
    raise exception 'Support ticket not found.';
  end if;
  if not (v_is_staff or v_owner = v_cust) then
    raise exception 'You don''t have access to this ticket.';
  end if;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (p_ticket, auth.uid(), v_is_staff, trim(p_body));

  update public.support_tickets
  set last_message_at = now(),
      updated_at = now(),
      status = case when v_is_staff then 'answered' else 'open' end
  where id = p_ticket;
end;
$$;

-- Staff set the ticket status (mark answered / close / reopen).
create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('manage_support') then
    raise exception 'You don''t have permission to manage support tickets.';
  end if;
  if p_status not in ('open','answered','closed') then
    raise exception 'Unknown status %.', p_status;
  end if;
  update public.support_tickets
  set status = p_status, updated_at = now()
  where id = p_ticket;
  if not found then raise exception 'Support ticket not found.'; end if;
end;
$$;

-- Log an off-platform hand-off (customer chose to continue via call/email/etc.)
-- as a message on the ticket, so the trail stays complete. Customer owns it.
create or replace function public.log_ticket_escalation(p_ticket uuid, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cust  uuid := public.current_broker_id();
  v_owner uuid;
  v_chan  text := coalesce(nullif(trim(p_channel), ''), 'another channel');
begin
  select customer_id into v_owner from public.support_tickets where id = p_ticket;
  if not found then
    raise exception 'Support ticket not found.';
  end if;
  if v_owner is distinct from v_cust then
    raise exception 'You don''t have access to this ticket.';
  end if;

  insert into public.support_messages (ticket_id, author, is_staff, body)
  values (p_ticket, auth.uid(), false, 'Customer chose to continue via ' || v_chan);

  update public.support_tickets
  set last_message_at = now()
  where id = p_ticket;
end;
$$;

revoke all on function public.open_ticket(text, text, text)        from public, anon;
revoke all on function public.post_ticket_message(uuid, text)      from public, anon;
revoke all on function public.set_ticket_status(uuid, text)        from public, anon;
revoke all on function public.log_ticket_escalation(uuid, text)    from public, anon;
grant execute on function public.open_ticket(text, text, text)     to authenticated;
grant execute on function public.post_ticket_message(uuid, text)   to authenticated;
grant execute on function public.set_ticket_status(uuid, text)     to authenticated;
grant execute on function public.log_ticket_escalation(uuid, text) to authenticated;

-- ---------- staff-reply notification ----------
-- When KTC replies, drop a notification on the ticket owner so the bell lights
-- up (reuses the 0071 notifications table; job_order_id is null for support).
create or replace function public.notify_support_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_staff then
    insert into public.notifications (customer_id, job_order_id, kind, title)
    values (
      (select customer_id from public.support_tickets where id = new.ticket_id),
      null,
      'support_reply',
      'KTC replied to your support ticket'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists support_messages_notify on public.support_messages;
create trigger support_messages_notify after insert on public.support_messages
  for each row execute function public.notify_support_reply();

-- ---------- support contact settings ----------
-- Deep-link targets for the "talk to an agent" hand-off. Read by any customer
-- (to build the links); only admin/owner can edit. Seeded empty.
create table if not exists public.support_contact (
  key   text primary key,
  value text
);
alter table public.support_contact enable row level security;

drop policy if exists "read support contact" on public.support_contact;
create policy "read support contact" on public.support_contact
  for select to authenticated using (true);

drop policy if exists "admin writes support contact" on public.support_contact;
create policy "admin writes support contact" on public.support_contact
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.support_contact (key, value) values
  ('phone', ''),
  ('email', ''),
  ('viber', ''),
  ('sms',   ''),
  ('hours', '')
on conflict (key) do nothing;
