---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-10
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]].

## Prod-testing readiness (NOW)

- [ ] Execute **ST01 browser lanes** (`docs/smoke-test-01-portal.md`, lanes 1–5) on `portal.ktcterminal.com`. Preflight P1–P7 already PASS (2026-06-07); lanes 1–5 need a manual walk.
- [ ] Supabase Auth → URL Configuration: Site URL `https://portal.ktcterminal.com`; add Redirect URL `https://portal.ktcterminal.com/**`.

## Apply migrations

- [x] **All migrations 0001–0029 applied + tracked** (latest 2026-06-10). `DATABASE_URL` (session pooler) lives in gitignored `.env.local`; `node scripts/run-migrations.mjs` records each in `public._migrations` and applies only new files. Latest: `0028` (reverify on name change), `0029` (admin JO processing: `on_hold`/`rejected` statuses + `admin_note` + admin UPDATE policy).

## Legal docs / consents (NEXT)

- [ ] KTC + counsel to finalize the **one** template `src/content/broker-agreement.md` — DPO contact, retention periods, venue, fees, penalties, legal citations; confirm **NPC registration** obligations. Bump `AGREEMENT_VERSION` on material change.
- [ ] Enforce re-acceptance when `AGREEMENT_VERSION` changes for already-registered brokers (compare stored vs current on login).
- [x] Surface the consent version + timestamp in the admin Approvals view (valid-ID + Terms/DPA badges on each broker card). *(Brokers list could get the same treatment later.)*

## Admin / processing

- [x] **`/admin/job-orders` status workflow + decisions** (approve→processing / complete / hold-for-info / reject-with-note) — ADR-0014, migration `0029` (2026-06-10).
- [x] **`/admin` dashboard metrics** — live counts (pending accounts/accreditations/consignees, customers, consignees, job orders) on square frosted-glass tiles.
- [x] **Printable job-order slip** — A6 invoice-style at `/job-order/:id/print`, ON PROCESS watermark (2026-06-10).
- [x] **My Account self-service** — `/account` (name/contact/email/password; approved name change → re-verify), migration `0028`.
- [ ] **Pricing on job orders** — add rate/amount fields + totals; the printable slip already reserves the Amount column + totals slot.
- [ ] **Online payment (non-gated)** — optional "Pay online" to settle a JO (skip the counter); JO stays processable without payment. Depends on pricing. Decide gateway (PayMongo / Xendit / Maya / DragonPay — GCash + Maya + cards), Official Receipt issuance (BIR `OR-INV-…`), `payment_status` / `paid_at` / reference on `job_orders`, admin reconciliation.
- [ ] **Google Sheets link (view + entry)** — keep Supabase as source of truth (a Sheet bypasses RLS/caps/guards → no live two-way sync). Build a one-way **app→Sheet mirror** (read-only) for checking + add missing operational fields to the in-app JO form and/or a **bounded admin import** for data entry. Decide which fields, who may import, mirror cadence. **Scheduled imports** feasible via a scheduled Edge Function (or `pg_cron`→`pg_net`→Edge Function) + Google service account — must be validated, idempotent (upsert key + `last_synced`), logged, scoped to specific fields; prefer import-to-staging + admin confirm for sensitive data.
- [ ] Per-customer accredited-consignee scoping — restrict job-order targets to a customer's accredited consignees.
- [ ] Job-order draft persistence; document attachments; customer edit/cancel of own order.

## Go-live hardening (LATER)

- [ ] Resend SMTP — broker email confirmation + password reset. Needs SPF/DKIM/MX on `ktcterminal.com` and Supabase SMTP config.
- [x] Automated smoke tests — Playwright Phase 1 (`e2e/smoke.spec.ts`, 11 tests) passing vs the deployed URL.
- [x] **Playwright Phase 2 harness built** — `mintSession` (service-role magic link) + role/surface tests in `e2e/authenticated.spec.ts` (ADR-0010). Skips until configured.
- [ ] **Run Phase 2** — create a dedicated test Supabase project (Option A), apply migrations, disable CAPTCHA / seed accounts, set `E2E_*` env, and implement the 4 mutation `fixme` lanes. See `e2e/README.md`.
- [ ] Wire Phase 1 Playwright into CI (GitHub Actions) once a workflow exists.
- [ ] Process the 2,488 imported consignees through accreditation over time.
- [ ] Public launch (remove access restriction).

## Ops notes

- Turnstile secret rotated; lives only in Supabase. Site key in Vercel env (`VITE_TURNSTILE_SITE_KEY`).
- Changing a Vercel env var requires a redeploy.

## Related

- [[Roadmap]] · [[Current State]] · [[Home]]
