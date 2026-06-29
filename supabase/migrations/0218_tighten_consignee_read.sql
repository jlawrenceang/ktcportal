-- ============================================================
-- 0218 — Tighten consignee read: no mass PII scraping (ADR-0037 Phase A cutover · Stage 2c)
--
-- Before: any approved broker could SELECT EVERY approved consignee row over the API,
-- including TIN / contact / address (the broad "status = 'approved'" clause, 0185).
-- That is a PII-scrape surface. The job-order/release consignee PICKER now browses via
-- the column-scoped `search_consignees` RPC (id/code/name only, limit 20 — 0208), so the
-- broad table read is no longer needed for browsing.
--
-- After: a broker reads a consignee's full row ONLY for consignees they have a real
-- relationship with — ones they REQUESTED, or that appear on their OWN job orders /
-- releases (so order display keeps working). They can no longer enumerate the master
-- list's PII. Staff keep full access (is_admin / review_consignee_requests / the
-- separate "staff view consignees" policy on view_job_orders).
-- RUTHLESS cutover: this breaks the old direct-table picker until the frontend switches
-- to search_consignees (done in the same Stage-2 frontend pass).
-- ============================================================

drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('review_consignee_requests')
    or (
      public.broker_is_approved() and (
        (requested_by = public.current_broker_id()
           and status in ('approved','pending','needs_info','rejected'))
        or exists (select 1 from public.job_orders jo
                    where jo.consignee_id = consignees.id and jo.customer_id = public.current_broker_id())
        or exists (select 1 from public.release_orders ro
                    where ro.consignee_id = consignees.id and ro.customer_id = public.current_broker_id())
      )
    )
  );

notify pgrst, 'reload schema';
