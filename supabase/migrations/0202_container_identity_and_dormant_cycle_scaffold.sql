-- ============================================================
-- 0202 — Container as a first-class identity + dormant container-cycle scaffold
--        (ADR-0037 move-spine foundation; owner 2026-06-29)
--
-- WHY: today a container exists only as free text on a job_order_line, so the
-- same physical box on two orders is two unrelated strings (the KTC-06 swap-bug
-- class). The north-star TOS spine is the container's journey. KTC already runs
-- the live gate-in→gate-out lifecycle in its EXISTING TOS, so here we:
--   (1) make the container a real, ISO-6346-validated record everything points at
--       — LIVE, used by the X-ray build; and
--   (2) lay container_cycles + container_events as a DORMANT scaffold (RLS-locked,
--       no API access, no triggers, no UI) — the future seam to mirror/integrate
--       the TOS. Cycle = one gate-in + one gate-out, then it closes; the same
--       container number returning later is a NEW cycle. Activated in a later phase.
-- Additive only — nothing existing is dropped; prod stays alive.
-- ============================================================

-- ---------- ISO 6346 check-digit validation (pure utility) ----------
-- Format: 4 letters (owner + category) + 6 serial digits + 1 check digit.
-- Letter values skip multiples of 11 (A=10,B=12,…,K=21,L=23,…,U=32,V=34,…,Z=38).
-- check = (Σ value_i · 2^(i-1) for i=1..10) mod 11, with 10 normalised to 0.
create or replace function public.iso6346_valid(p_no text)
returns boolean language plpgsql immutable as $$
declare
  s    text  := upper(regexp_replace(coalesce(p_no, ''), '\s', '', 'g'));
  vals int[] := array[10,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38];
  i int; c text; v int; total int := 0; chk int;
begin
  if s !~ '^[A-Z]{4}[0-9]{7}$' then return false; end if;
  for i in 1..10 loop
    c := substr(s, i, 1);
    if i <= 4 then
      v := vals[ascii(c) - ascii('A') + 1];      -- letter → ISO value
    else
      v := ascii(c) - ascii('0');                -- digit
    end if;
    total := total + v * (2 ^ (i - 1))::int;
  end loop;
  chk := total % 11;
  if chk = 10 then chk := 0; end if;
  return chk = (ascii(substr(s, 11, 1)) - ascii('0'));
end;
$$;

-- ---------- containers: the first-class physical-box identity (LIVE) ----------
create table if not exists public.containers (
  id            uuid primary key default gen_random_uuid(),
  container_no  text not null unique,                 -- canonical, normalised UPPER
  iso_valid     boolean not null default false,       -- ISO 6346 check-digit result
  first_seen_at timestamptz not null default now(),
  created_by    uuid
);

alter table public.containers enable row level security;

-- Read: any authenticated user may resolve a container by number (needed to
-- reference/pick it). A container number is not PII. Writes are RPC-only.
drop policy if exists "containers readable by authenticated" on public.containers;
create policy "containers readable by authenticated" on public.containers
  for select to authenticated using (true);
-- (No INSERT/UPDATE/DELETE policies — population happens via SECURITY DEFINER
--  RPCs during job-order filing in a later migration.)

-- ---------- container_cycles: DORMANT scaffold (one in / one out / close) ----------
create table if not exists public.container_cycles (
  id            uuid primary key default gen_random_uuid(),
  container_id  uuid not null references public.containers(id) on delete cascade,
  cycle_no      int  not null default 1,              -- increments per re-entry of the same box
  status        text not null default 'open' check (status in ('open','closed')),
  gate_in_at    timestamptz,
  gate_out_at   timestamptz,
  opened_source text,                                 -- 'tos' | 'portal' (future)
  created_at    timestamptz not null default now()
);
-- At most one OPEN cycle per container (a box is in-port once at a time).
create unique index if not exists container_cycles_one_open
  on public.container_cycles (container_id) where status = 'open';

-- ---------- container_events: DORMANT scaffold (the move-ledger seam) ----------
create table if not exists public.container_events (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references public.container_cycles(id) on delete cascade,
  event_type  text not null,                          -- gate_in | gate_out | move | xray | …
  occurred_at timestamptz not null default now(),
  source      text,                                   -- 'tos' | 'portal'
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists container_events_cycle_idx on public.container_events (cycle_id, occurred_at);

-- DORMANT lock: RLS on with NO policies (deny-all to authenticated/anon) AND the
-- PostgREST role grants revoked, so these tables are inert until a later phase
-- activates them. Only the table owner / service_role can touch them.
alter table public.container_cycles enable row level security;
alter table public.container_events enable row level security;
revoke all on table public.container_cycles from anon, authenticated;
revoke all on table public.container_events from anon, authenticated;

comment on table public.container_cycles is
  'DORMANT scaffold (ADR-0037). One gate-in→gate-out cycle per container; re-entry = new cycle. RLS-locked + grants revoked; no triggers/UI. Activated when the existing TOS is integrated.';
comment on table public.container_events is
  'DORMANT scaffold (ADR-0037). Append-only container move/event ledger — the TOS-integration seam. RLS-locked + grants revoked until activated.';
