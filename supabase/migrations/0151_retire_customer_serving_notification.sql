-- 0151: Retire the customer "serving number" notification. (Item 2)
-- The serving-number system still runs for OPS (the X-ray queue keeps its #),
-- but customers and CSR must NOT see a serving/queue number anywhere — orders are
-- tracked by daily Batch + working-hours aging. This drops the AFTER INSERT
-- trigger that still pushed "Serving number for … #N" into the customer's bell.

drop trigger if exists serving_numbers_notify on public.serving_numbers;
drop function if exists public.notify_serving_assigned();

-- Tidy: clear any already-delivered serving notifications from customer bells.
delete from public.notifications where kind = 'serving';
