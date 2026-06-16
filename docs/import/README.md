# Seed data — templates, manual import, and the vessel auto-sync

Two pipelines:

- **Consignees** — manual import, weekly / as-needed (no schedule).
- **Vessel schedule** — manual import **or** an hourly auto-sync from a Google Sheet (below).

Templates come in both **`.xlsx`** (for staff who work in Excel) and `.csv` — the
importers accept either (`scripts/sheetGrid.mjs` detects by extension). Both
importers are **re-runnable** (safe to import the same file twice). Regenerate the
xlsx templates with `node scripts/gen-import-templates.mjs`.

> Run the scripts from the repo root with `DATABASE_URL` passed inline (session
> pooler `:5432`, or transaction pooler `:6543` for large files). `npm install`
> first (the xlsx reader needs the `exceljs` dev dependency).

## 1. Consignees — `consignees-template.xlsx` / `.csv`

The master list customers pick from when filing a Job Order.

| column | required | notes |
|---|---|---|
| `name` | ✅ | the consignee/company name (dedup is by name, case-insensitive) |
| `code` | optional | leave **blank** to auto-generate `CN-#####`; or set your own (unique) |

```
DATABASE_URL="postgresql://...:6543/postgres" node scripts/import-consignees.mjs "C:/path/consignees.xlsx"
```

(Address / TIN / approval status are managed later in the admin **Consignees**
screen; the quick importer loads name + code.)

## 2. Vessel schedule — `vessel-schedule-template.xlsx` / `.csv`

| column | required | notes |
|---|---|---|
| `vessel_visit` | ✅ | unique key (a re-import / sync updates the matching visit) |
| `vessel_name` | ✅ | |
| `voyage_number` | ✅ | |
| `shipping_line` | optional | |
| `actual_arrival` | optional | date `YYYY-MM-DD` |
| `finish_discharging` | optional | date `YYYY-MM-DD` (drives import free-storage timing) |
| `berth` | optional | |
| `remarks` | optional | |
| `cancelled` | optional | `TRUE` to retire a visit (used by the auto-sync) |

Manual import:

```
DATABASE_URL="postgresql://...:6543/postgres" node scripts/import-vessels.mjs "C:/path/vessels.xlsx"
```

### Hourly Google-Sheet auto-sync (`vessel-sync` Edge Function + cron)

Keep your vessel schedule in a Google Sheet and the app pulls it **every hour**
(one-way Sheet → app, upsert on `vessel_visit`, never deletes; mark
`cancelled=TRUE` to retire a visit). Same infra pattern as `boc-mirror`.

**One-time setup:**
1. Create the Google Sheet; row 1 = the headers above (order doesn't matter).
2. Share it as **Viewer** with the **same service-account email** boc-mirror uses
   (`GOOGLE_SA_EMAIL`).
3. In `.env.local` set `VESSEL_SHEET_ID` (the long id in the Sheet URL); reuse the
   existing `GOOGLE_SA_EMAIL` / `GOOGLE_SA_KEY`. Optionally `VESSEL_CRON_SECRET`.
4. Deploy + configure: `node scripts/setup-vessel-sync.mjs`
5. Apply the cron: `node scripts/run-migrations.mjs` (migration `0107`, hourly at :20).

Manual test: `curl -X POST https://<ref>.supabase.co/functions/v1/vessel-sync -H "x-cron-secret: <VESSEL_CRON_SECRET>"`
→ `{ "ok": true, "sheet_rows": N, "upserted": N, "skipped": 0 }`.

Delete the `SAMPLE …` rows before importing/syncing.
