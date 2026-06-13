# Migration plan — Phase 2 (Sheets → Supabase)

Don't do this until Sheets actually hurts. **Triggers** that justify it:

- Repeating / line-item data that doesn't fit one flat row
- Real querying or reporting beyond filter/sort
- Access control (who can see/edit what)
- Volume (thousands+ of rows, sheet getting slow)
- Automation that should react to each submission

## When the trigger hits

1. **Create the table** from [`sheet-schema.md`](sheet-schema.md) — the Postgres-type
   column is already the `CREATE TABLE`.
2. **Backfill** existing rows: export the Google Sheet to CSV → import into the table.
3. **Switch the live feed.** Two options:
   - **Jotform webhook → Supabase Edge Function** (no server to host) — recommended.
   - **Node/TS webhook receiver** under `src/` if more logic is needed.
   Each submission POSTs to the endpoint; the handler validates and inserts a row.
4. **Run both in parallel** briefly (Sheets + Supabase) to confirm parity, then retire
   the Sheets integration.

## Code lands in

`src/` — empty until this phase begins.
