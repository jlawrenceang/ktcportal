---
title: BOC Sheets Mirror
tags: [workflow, integration, sheets, boc]
type: workflow
status: built-awaiting-google-creds
last_updated: 2026-06-11
---

# 📤 BOC Sheets Mirror (one-way app → Google Sheet)

The Bureau of Customs doesn't get portal access, so they read a **read-only
Google Sheet mirror** of job orders instead. **One-way only** — the function
never reads the Sheet back; Supabase stays the source of truth (decision #11;
live two-way sync rejected).

## How it works

- **Edge Function `boc-mirror`** (`supabase/functions/boc-mirror/index.ts`):
  full snapshot every run — clears the first sheet tab and rewrites it with the
  last 60 days of non-`held` job orders, one row per container line:
  `JO Number · Filed · Status · Container · Service · Customer · Consignee ·
  Entry No. · X-ray Done · Service Invoice`. PH-time stamps + a "last updated"
  header row.
- **Trigger:** `pg_cron` hourly at :05 (migration `0037`) POSTs to the function
  with the `x-cron-secret` header. URL + secret live in **Vault**
  (`boc_mirror_url` / `boc_mirror_secret`); until they're set the cron is a
  silent no-op. Manual run: `curl -X POST <fn-url> -H "x-cron-secret: …"`.
- **Deploy/config:** `node scripts/setup-boc-mirror.mjs` (deploys the function
  via the Management API, sets function secrets, writes the Vault pair).

## One-time Google setup (owner, ~10 min) — STILL TO DO

1. Google Cloud Console → create (or reuse) a project → **enable the Google
   Sheets API**.
2. IAM → **Service Accounts** → create one (e.g. `ktc-boc-mirror`) → Keys →
   **add a JSON key** and download it.
3. Create the target Google Sheet → **Share** it with the service account's
   `client_email` as **Editor**.
4. In `.env.local` add (from the JSON key):
   - `GOOGLE_SA_EMAIL=` the `client_email`
   - `GOOGLE_SA_KEY=` the `private_key` (keep the `\n` escapes, quote it)
   - `BOC_SHEET_ID=` the long id from the Sheet URL
5. Rerun `node scripts/setup-boc-mirror.mjs`. The next hourly tick populates
   the Sheet; share the Sheet **view-only** with BOC.

## Invariants

- The Sheet is a **viewport, never an input** — no formulas feeding back, no
  manual edits expected (they're overwritten every hour).
- `held` orders (unverified accounts) never leave the app.
- The function requires the cron secret — it is not publicly invokable.

## Related
- [[Job Order Lifecycle]] §F · [[Payment & Cashier Handoff (proposal)]]
- Migration `0037` · `scripts/setup-boc-mirror.mjs`
