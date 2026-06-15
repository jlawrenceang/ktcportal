-- ============================================================
-- 0072 — Job Order comment/document moderation (owner, 2026-06-15)
--
-- Protect the JO timeline from spam / offensive / irrelevant content:
--   * the AUTHOR can delete their own comment or document, and
--   * any KTC staff (view_job_orders) can delete ANY comment or document.
-- (Edit = delete + re-post — simpler and avoids edit-history ambiguity.)
--
-- jo_timeline now returns each row's id + source + a per-viewer `deletable`
-- flag so the UI can show a delete control only where allowed. System lifecycle
-- events (filed/approved/…) are never deletable.
-- ============================================================

create or replace function public.delete_jo_entry(p_source text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_staff boolean := public.has_permission('view_job_orders');
begin
  if p_source = 'event' then
    -- only comments are removable (never system lifecycle events)
    delete from public.job_order_events
     where id = p_id and event = 'comment' and (actor = auth.uid() or v_staff);
  elsif p_source = 'document' then
    delete from public.job_order_documents
     where id = p_id and (uploaded_by = public.current_broker_id() or v_staff);
  else
    raise exception 'Unknown entry type.';
  end if;
end;
$$;
revoke all on function public.delete_jo_entry(text, uuid) from public, anon;
grant execute on function public.delete_jo_entry(text, uuid) to authenticated;

-- Rebuild jo_timeline with row_id / source / deletable (signature changed → drop).
drop function if exists public.jo_timeline(uuid);
create or replace function public.jo_timeline(p_jo uuid)
returns table (
  row_id uuid, source text, kind text, event_name text, detail jsonb, who text,
  body text, doc_path text, doc_filename text, deletable boolean, at timestamptz
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
    e.created_at
  from public.job_order_events e
  where e.job_order_id = p_jo

  union all

  select
    d.id, 'document', 'document', null::text, null::jsonb,
    case when d.uploaded_by = v_broker then 'You'
         else coalesce((select full_name from public.customers where id = d.uploaded_by), 'Customer') end,
    d.note, d.path, d.filename,
    (d.uploaded_by = v_broker or v_staff),
    d.created_at
  from public.job_order_documents d
  where d.job_order_id = p_jo

  order by 11 asc; -- positional: the 11th output column (at)
end;
$$;
revoke all on function public.jo_timeline(uuid) from public, anon;
grant execute on function public.jo_timeline(uuid) to authenticated;
