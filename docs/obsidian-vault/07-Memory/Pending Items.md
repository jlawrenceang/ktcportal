---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-07
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]].

## Prod-testing readiness (NOW)

- [ ] Execute **ST01 browser lanes** (`docs/smoke-test-01-portal.md`, lanes 1–5) on `portal.ktcterminal.com`. Preflight P1–P7 already PASS (2026-06-07); lanes 1–5 need a manual walk.
- [ ] Supabase Auth → URL Configuration: Site URL `https://portal.ktcterminal.com`; add Redirect URL `https://portal.ktcterminal.com/**`.

## Apply migrations

- [ ] **Apply `0011_broker_irr_acceptance.sql` and `0012_broker_consents.sql`** to the KTC DB (`node scripts/run-migrations.mjs` with `DATABASE_URL`, or the SQL Editor) so the broker IRR/Terms/Privacy consent columns exist. Consents are recorded in auth metadata until then.

## Legal docs / consents (NEXT)

- [ ] KTC + counsel to finalize the **one** template `src/content/broker-agreement.md` — DPO contact, retention periods, venue, fees, penalties, legal citations; confirm **NPC registration** obligations. Bump `AGREEMENT_VERSION` on material change.
- [ ] Enforce re-acceptance when `AGREEMENT_VERSION` changes for already-registered brokers (compare stored vs current on login).
- [ ] Surface the consent version + timestamp in the admin Brokers/Approvals view.

## Admin / processing (NEXT)

- [ ] `/admin/job-orders` — status workflow + decisions (process/complete/reject).
- [ ] `/admin` dashboard — live metrics (pending brokers, pending consignees, open job orders).
- [ ] Per-broker accredited-consignee scoping — restrict job-order targets to a broker's accredited consignees.

## Go-live hardening (LATER)

- [ ] Resend SMTP — broker email confirmation + password reset. Needs SPF/DKIM/MX on `ktcterminal.com` and Supabase SMTP config.
- [x] Automated smoke tests — Playwright Phase 1 (`e2e/smoke.spec.ts`, 10 tests) passing vs the deployed URL.
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
