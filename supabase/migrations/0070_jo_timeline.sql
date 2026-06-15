-- ============================================================
-- 0070 — Job Order timeline + two-way comments (owner, 2026-06-15)
--
-- Surfaces the whole life of a JO (filed → approved → on-hold → x-ray done →
-- paid → completed …) to BOTH the customer and KTC staff, merged with the
-- supporting notes/documents (0069) and free comments. Two-way: customer and
-- staff comment on the same thread.
--
-- Reuses the existing audit trail (job_order_events, 0040). Comments are just
-- a 'comment' event. A SECURITY DEFINER reader returns the merged, ordered
-- timeline with actor labels resolved per-viewer (individual staff names are
-- never exposed to customers — they see "KTC").
-- ============================================================

-- Add a comment (staff on any JO they can see; customer on their own).
create or replace function public.add_jo_comment(p_jo uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'Write a comment first.';
  end if;
  if not (
    public.has_permission('view_job_orders')
    or exists (select 1 from public.job_orders where id = p_jo and customer_id = public.current_broker_id())
  ) then
    raise exception 'You can only comment on your own job orders.';
  end if;
  perform public.log_jo_event(p_jo, 'comment', jsonb_build_object('text', left(trim(p_text), 2000)));
end;
$$;
revoke all on function public.add_jo_comment(uuid, text) from public, anon;
grant execute on function public.add_jo_comment(uuid, text) to authenticated;

-- Merged timeline: lifecycle events + comments + supporting documents, ordered.
-- 'who' is viewer-aware: your own actions read "You"; staff see real names,
-- customers see "KTC" for any KTC-side actor.
create or replace function public.jo_timeline(p_jo uuid)
returns table (
  kind text, event_name text, detail jsonb, who text, body text,
  doc_path text, doc_filename text, at timestamptz
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
    e.created_at
  from public.job_order_events e
  where e.job_order_id = p_jo

  union all

  select
    'document', null::text, null::jsonb,
    case when d.uploaded_by = v_broker then 'You'
         else coalesce((select full_name from public.customers where id = d.uploaded_by), 'Customer') end,
    d.note, d.path, d.filename, d.created_at
  from public.job_order_documents d
  where d.job_order_id = p_jo

  order by 8 asc; -- positional: the 8th output column (at) — UNION can't order by alias
end;
$$;
revoke all on function public.jo_timeline(uuid) from public, anon;
grant execute on function public.jo_timeline(uuid) to authenticated;
