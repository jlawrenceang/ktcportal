-- ============================================================
-- 0102 — Comment visibility (staff-only internal notes) + escalation flag
--         (owner, 2026-06-16)
--
-- Owner spec: "the customer can file comments but it will be reviewed by the
-- CS; when we reply it posts the comment + the CS answer. Categorize comments
-- as viewed by STAFF ONLY. We can escalate/flag it as a complaint via the
-- comments."
--
-- JO comments live in public.job_order_events (event = 'comment'), surfaced by
-- the jo_timeline SECURITY DEFINER reader (0070/0072). Customers NEVER query
-- job_order_events directly — its SELECT RLS is already staff-only
-- (view_job_orders), and customers only ever read the timeline through
-- jo_timeline (which filters by ownership). So:
--   * visibility  — 'public' (shown to the customer + staff) or 'staff_only'
--                   (internal note, NEVER shown to the customer).
--   * flagged     — a complaint/escalation flag, surfaced to STAFF ONLY.
-- Both columns apply only to comment rows; lifecycle/system events keep the
-- defaults and are unaffected.
--
-- This migration:
--   1. adds the two columns,
--   2. adds add_jo_staff_note()  — staff post an internal staff-only comment,
--   3. adds flag_jo_comment()    — staff flag/unflag a comment as a complaint,
--   4. rebuilds jo_timeline()    — exposes visibility/flagged and hides
--                                  staff_only rows from the customer.
-- The existing customer-comment (add_jo_comment) + moderation (delete_jo_entry)
-- flows are left intact.
-- ============================================================

-- ---------- 1. columns (comment rows only; system events keep defaults) ----------
alter table public.job_order_events
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'staff_only'));
alter table public.job_order_events
  add column if not exists flagged boolean not null default false;

-- ---------- 2. staff internal (staff-only) note ----------
-- Gated by view_job_orders OR manage_support. The note is stored as a 'comment'
-- event with visibility='staff_only' — it is NEVER returned to the customer.
create or replace function public.add_jo_staff_note(p_jo uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('view_job_orders') or public.has_permission('manage_support')) then
    raise exception 'Staff only.';
  end if;
  if coalesce(trim(p_text), '') = '' then
    raise exception 'Write a note first.';
  end if;
  insert into public.job_order_events (job_order_id, actor, event, detail, visibility)
  values (p_jo, auth.uid(), 'comment',
          jsonb_build_object('text', left(trim(p_text), 2000)), 'staff_only');
end;
$$;
revoke all on function public.add_jo_staff_note(uuid, text) from public, anon;
grant execute on function public.add_jo_staff_note(uuid, text) to authenticated;

-- ---------- 3. flag a comment as a complaint / escalation (staff only) ----------
create or replace function public.flag_jo_comment(p_id uuid, p_flagged boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('view_job_orders') or public.has_permission('manage_support')) then
    raise exception 'Staff only.';
  end if;
  update public.job_order_events
     set flagged = coalesce(p_flagged, false)
   where id = p_id and event = 'comment';
end;
$$;
revoke all on function public.flag_jo_comment(uuid, boolean) from public, anon;
grant execute on function public.flag_jo_comment(uuid, boolean) to authenticated;

-- ---------- 4. rebuild jo_timeline with visibility + flagged ----------
-- Signature changes (new output columns) → drop first.
drop function if exists public.jo_timeline(uuid);
create or replace function public.jo_timeline(p_jo uuid)
returns table (
  row_id uuid, source text, kind text, event_name text, detail jsonb, who text,
  body text, doc_path text, doc_filename text, deletable boolean,
  visibility text, flagged boolean, at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_staff  boolean := public.has_permission('view_job_orders');
  v_broker uuid := public.current_broker_id();
  v_owner  boolean;
begin
  select exists (select 1 from public.job_orders where id = p_jo and customer_id = v_broker) into v_owner;
  if not (v_staff or v_owner) then return; end if;

  return query
  select
    e.id,
    'event',
    case when e.event = 'comment' then 'comment' else 'event' end,
    e.event,
    e.detail,
    case
      when e.actor is null then 'KTC'
      when e.actor = v_uid then 'You'
      when exists (select 1 from public.customers c where c.user_id = e.actor
                   and (c.is_admin or c.is_owner or c.staff_role is not null))
        then case when v_staff
                  then coalesce((select full_name from public.customers where user_id = e.actor), 'KTC staff')
                  else 'KTC' end
      else coalesce((select full_name from public.customers where user_id = e.actor), 'Customer')
    end,
    case when e.event = 'comment' then e.detail->>'text' end,
    null::text, null::text,
    (e.event = 'comment' and (e.actor = v_uid or v_staff)),
    e.visibility,
    e.flagged,
    e.created_at
  from public.job_order_events e
  where e.job_order_id = p_jo
    -- staff_only comments are NEVER shown to the customer.
    and (v_staff or e.visibility = 'public')

  union all

  select
    d.id, 'document', 'document', null::text, null::jsonb,
    case when d.uploaded_by = v_broker then 'You'
         else coalesce((select full_name from public.customers where id = d.uploaded_by), 'Customer') end,
    d.note, d.path, d.filename,
    (d.uploaded_by = v_broker or v_staff),
    'public'::text, false,
    d.created_at
  from public.job_order_documents d
  where d.job_order_id = p_jo

  order by 13 asc; -- positional: the 13th output column (at)
end;
$$;
revoke all on function public.jo_timeline(uuid) from public, anon;
grant execute on function public.jo_timeline(uuid) to authenticated;
