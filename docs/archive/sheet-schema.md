# Sheet schema — Google Sheet ⇄ future Postgres

One row per submission. Column order/names here should match the Google Sheet exactly.
The **Postgres type** column is the payoff: when Phase 2 arrives, this table *is* the
`CREATE TABLE`, so fill it in thoughtfully now.

| Sheet column | From field key | Postgres type (Phase 2) | Notes |
|---|---|---|---|
| `submission_id` | _(Jotform meta)_ | `text primary key` | Jotform's submission ID — stable unique key |
| `submitted_at` | _(Jotform meta)_ | `timestamptz` | submission timestamp |
| `full_name` | `full_name` | `text` | |
| `email` | `email` | `text` | |
| | | | |

## Rules that keep migration cheap

- **Stable column names** — once a column has data, don't rename it; add a new one instead.
- **One concept per column.** Avoid stuffing "Item 1, Item 2, Item 3" into one cell —
  if the form has repeating items, that's the signal you've outgrown Sheets (a flat
  spreadsheet can't model one-to-many). Note it here when it happens.
- **Keep types honest** — store dates as dates, numbers as numbers in the form so the
  sheet doesn't fill with text that needs cleaning later.
