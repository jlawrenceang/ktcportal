-- ============================================================
-- 0006 — auto-generate a consignee code when none is supplied.
-- Admins can still pass an explicit code (e.g. legacy DICT-style numbers);
-- leaving it blank yields CN-00001, CN-00002, ...
-- ============================================================

create sequence if not exists public.consignee_code_seq;

alter table public.consignees
  alter column code set default ('CN-' || lpad(nextval('public.consignee_code_seq')::text, 5, '0'));
