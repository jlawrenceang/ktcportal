-- ============================================================
-- 0241 — BT-03: stop the consignee-PII scrape via throwaway filing
--
-- Break-test BT-03 (docs/audits/2026-07-02-sandbox-breaktest.md): 0218 lets an approved
-- broker read a consignee's FULL row (TIN, tel, mobile, email, doc paths) for ANY consignee
-- that appears on one of their job_orders/releases. But filing is open (any approved broker
-- may file against any catalogue consignee), so a throwaway JO unlocks arbitrary consignee PII.
--
-- What a broker legitimately needs:
--   * order DISPLAY: only the consignee CODE + NAME (rendered via PostgREST embeds), and
--   * their OWN consignee requests: the full detail they themselves submitted (MyRequests).
--
-- Fix:
--   1) `consignees_public` — a code/name-only projection (NO PII) for the display embeds.
--      A definer view (bypasses consignees RLS) so it renders regardless of the narrowed base
--      policy; code/name are already enumerable via search_consignees, so this exposes nothing
--      new that matters (business code/name, never TIN/contacts/docs).
--   2) Narrow the BROKER branch of the consignees read policy to `requested_by = me` (their own
--      submitted data only). Staff branches (is_admin / review_consignee_requests) and the
--      separate staff-view policy are untouched. A broker can no longer full-read a consignee
--      just because they filed against it — the scrape is closed.
-- ============================================================

drop view if exists public.consignees_public;
create view public.consignees_public as
  select id, code, name from public.consignees;
grant select on public.consignees_public to authenticated;
comment on view public.consignees_public is
  'BT-03 (0241): code/name-only projection of consignees for order-display embeds. NO PII (no tin/tel/mobile/email/doc paths). Definer view so brokers render their orders'' consignee without a full-row read of the base table.';

drop policy if exists "approved consignees readable" on public.consignees;
create policy "approved consignees readable" on public.consignees
  for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('review_consignee_requests')
    or (public.broker_is_approved() and requested_by = public.current_broker_id())
  );

notify pgrst, 'reload schema';
