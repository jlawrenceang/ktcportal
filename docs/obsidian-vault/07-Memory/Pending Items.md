---
title: Pending Items
tags: [memory, pending, backlog]
type: memory
last_updated: 2026-06-13
---

# 📋 Pending Items

Detailed backlog. For sequencing, see [[Roadmap]]. (Pre-v1.1.0 completed items moved to [[Completed Milestones]] / `CHANGELOG.md`.)

## ST02 / trial run (NOW)

- [ ] **ST02 manual Lanes 1–8** on `portal.ktcterminal.com` (`docs/smoke-test-02-portal.md`). Preflight P1–P8 ✅ (P8 cleared 2026-06-13 after E2E key regen → Playwright 16/16). Owner walking lanes now.
- [ ] **P9 / Lane 5.0 data entry:** real X-Ray rate + admin/print fees, bank/GCash details + QR upload (Settings, owner).
- [ ] **ST02 teardown:** suspend/remove test accounts + orders, reset `jo_number_seq` / `broker_code_seq` (only safe at zero orders) so the first real order is `JO-000001`.

## Go-live gate (NEXT)

- [ ] **Counsel sign-off on Customer Agreement v2** — DPO designation, NPC registration check, liability cap amount. Bump `AGREEMENT_VERSION` on material change.
- [ ] Enforce re-acceptance when `AGREEMENT_VERSION` changes for already-registered customers.
- [ ] Public-launch call (remove the prod-testing restriction).

## Payments / pricing open decisions

- [ ] **Invoice generation trigger** — when is the cashier's Service Invoice produced (on `completed`? "ready for payment"? on demand)? Invoice lives in the **ERP**; app records `OR-INV-`/`BI-INV-` + pad no. as PAID/BILLED.
- [ ] **Payment ↔ cashier handoff** — does an admin-confirmed online payment proof replace the cashier visit for the official BIR invoice/OR, or still require it?
- [ ] Pricing for non-X-ray services (only X-Ray priced today; DEA/OOG = 0 placeholders).

## Integrations / automation

- [ ] **BOC Sheets mirror** — blocked on Google service-account creds (`scripts/setup-boc-mirror.mjs`). One-way app→Sheet only (no two-way sync — bypasses RLS/caps/guards).
- [ ] **Bounded admin import** (staff template sheet → validated RPC upsert) if staff data-entry need materializes; decide fields/who/cadence. Prefer import-to-staging + admin confirm.
- [ ] **Regenerate a real `sbp_` personal access token** — `SUPABASE_ACCESS_TOKEN` in `.env.local` is a secret API key; the 4 Management-API scripts fail until then (see `docs/agent/tooling-inventory.md`).

## Deferred features

- [ ] JO operational fields: container size, vessel/voyage, plug-in/out timestamps (deferred 2026-06-11).
- [ ] Per-customer accredited-consignee scoping (ADR-0007 keeps the open master list; revisit on chokepoints).
- [ ] JO draft persistence; document attachments on orders.
- [ ] Status-change notification emails beyond the current set (decide after lifecycle finalization).
- [ ] Possible **employee role** distinct from admin for in-house filing division.

## Testing / CI (LATER)

- [ ] Implement the 4 Playwright mutation `fixme` lanes (registration→approval, consignee CRUD, JO submit, staff creation).
- [ ] Wire Playwright into CI (GitHub Actions) once a workflow exists.
- [ ] Process the 2,488 imported consignees through accreditation over time.

## Ops notes

- Turnstile secret lives only in Supabase; site key in Vercel env (`VITE_TURNSTILE_SITE_KEY`). Env changes need a redeploy.
- Session pooler (`:5432`) can exhaust mid-session → use transaction pooler (`:6543`) for one-off scripts.
- ID purge cron is ACTIVE (Vault has `service_role_key` + `project_url`; verified 2026-06-13). All 6 crons green.

## Related

- [[Roadmap]] · [[Current State]] · [[Home]]
