-- ============================================================
-- 0217 — Serving number resets MONTHLY (ADR-0037 Phase A cutover · Stage 2b)
--
-- Owner decision 2026-06-29: the per-lane serving number resets MONTHLY and is
-- displayed as `YYMM-XXXX` (XXXX = the 4-digit per-month sequence; rendered in the
-- frontend from the period + serving_no). The only DB change is the reset boundary:
-- serving_week() now returns the FIRST OF THE MONTH (PH time) instead of the Monday,
-- so assign_serving_numbers() / now_serving() (which scope `max(serving_no)+1` and the
-- board to week_start = serving_week()) restart numbering each month automatically.
--
-- The column is still named `week_start` (now holds the month-start) — kept to avoid
-- churn across assign_serving_numbers / now_serving / the unique index; it is a period
-- boundary, not literally a week. Lane routing (queue/priority/rexray) is unchanged.
-- ============================================================

create or replace function public.serving_week()
returns date language sql stable set search_path = public as $$
  -- period boundary for the serving counter: first day of the current month, PH time.
  select (date_trunc('month', (now() at time zone 'Asia/Manila')))::date;
$$;

comment on function public.serving_week() is
  'ADR-0037: the serving-number reset period — first of the month (Asia/Manila). Despite the legacy name, serving numbers reset MONTHLY; displayed as YYMM-XXXX.';

notify pgrst, 'reload schema';
