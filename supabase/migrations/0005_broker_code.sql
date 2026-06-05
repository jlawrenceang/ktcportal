-- ============================================================
-- 0005 — human-friendly Broker ID (BR-000001), auto-assigned.
-- The UUID stays the internal PK; this is the displayed identifier.
-- ============================================================

create sequence if not exists public.broker_code_seq;

alter table public.brokers add column if not exists broker_code text;

alter table public.brokers
  alter column broker_code set default ('BR-' || lpad(nextval('public.broker_code_seq')::text, 6, '0'));

-- backfill any existing rows that don't have one yet (ordered by signup)
update public.brokers b
set broker_code = 'BR-' || lpad(nextval('public.broker_code_seq')::text, 6, '0')
from (select id from public.brokers where broker_code is null order by created_at) ordered
where b.id = ordered.id;

create unique index if not exists brokers_broker_code_key on public.brokers (broker_code);
