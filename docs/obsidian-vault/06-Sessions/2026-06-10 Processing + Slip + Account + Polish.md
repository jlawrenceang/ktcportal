---
title: 2026-06-10 Processing + Slip + Account + Polish
tags: [session]
type: session
date: 2026-06-10
---

# 2026-06-10 — Admin processing, printable slip, account self-service, UX polish

## What shipped (committed `aeac344`, tag `checkpoint-2026-06-10`, live)

- **Admin job-order processing** (ADR-0014, migration `0029`) — approve→`processing` / `completed`, `on_hold` / `rejected` with a customer-visible `admin_note`. Admin UPDATE policy on `job_orders`; customers still can't self-update. New statuses `on_hold` + `rejected` (distinct from account-gated `held`).
- **Printable A6 job-order slip** (`/job-order/:id/print`) styled as a mini KTC Service Invoice; **ON PROCESS** watermark while `processing`. Amount column + totals slot reserved for future pricing.
- **My Account** (ADR-0013, migration `0028`) — `/account`: edit name/contact, change email (re-confirm), change password (+ reset-by-email). Approved name change → re-verify (`approved → pending` self-transition now permitted by the guard).
- **Login lockout** (5 wrong passwords → 60s), **bulk-paste** containers (uncapped), file→My-Job-Orders redirect, collapsible My-Job-Orders cards, unified `Notice` component, Back-to-Home/Dashboard buttons + clickable logo, square frosted-glass admin dashboard.

## Flow as it stands

**Customer account lifecycle:** register (name + contact + email + password + 1 consent + CAPTCHA) → confirm email (`/confirmed` → sign in) → sign in `pending` → upload valid ID at `/verify-id` (or skip & file held orders) → admin reviews at `/admin/approvals` → **Approve** (needs ID on file; releases held orders → `submitted`, sends approval email, **deletes the ID**) or **Reject** (ID-unreadable / needs-info = recoverable `rejected` resubmit; **Suspend** = terminal). 48h TTL auto-rejects pending customers who never upload an ID.

**Job-order lifecycle:** customer files → `held` (pending, ≤10, queue-hidden) or `submitted` (approved, ≤10 open). Admin: `submitted → processing (=approved) → completed`; or `on_hold` / `rejected` with a note. Customer sees status badges + note in My Job Orders; **Print slip** when `processing`/`completed`.

**Account self-service:** `/account` for name/contact/email/password; approved name change triggers re-verification.

**Security:** login lockout (5→60s), idle logout (10 min), server-enforced CAPTCHA, owner failsafe, invite-only staff.

## Open decisions / flow gaps to answer before proceeding

1. **Pricing model (biggest).** Job orders have no rate/amount. Who sets rates, per what unit (per container? per reefer plug-in/plug-out hour, like the electricity-billing invoice)? Do customers see prices? VAT / withholding handling? Is the official **BIR Service Invoice** (pre-printed, printer-accredited) generated outside the portal, with our slip being only the internal job-order document?
1b. **Online payment (non-gated, convenience).** Customer wants an optional **"Pay online"** to settle a JO and skip the counter/line — but the JO is **still processable without payment** (payment never blocks processing). **Depends on #1** (need an amount to settle). Open: payment gateway (PH: PayMongo / Xendit / Maya / DragonPay — GCash + Maya + cards), what's issued (BIR **Official Receipt**; invoice shows `OR-INV-…`), `payment_status` / `paid_at` / reference fields on `job_orders`, and an admin reconciliation view. Build after pricing is decided.
2. **Job-order data model vs the invoice.** The Service Invoice carries fields we don't capture: container **SIZE** (20/40), **Vessel / Voyage**, and **plug-in / plug-out timestamps** (which drive billable hours). Decide which fields each service requires.
3. **`on_hold` resolution path.** A customer sees "information needed" but **can't edit/respond** to the order in-app — they'd contact admin out-of-band. Should `on_hold` let the customer update the order and resubmit?
4. **Rejected order recovery.** A `rejected` order is terminal — no resubmit path for the *order* (only for a rejected *account*). Should customers be able to fix & refile?
5. **Edit / cancel own order.** Customers can't edit or cancel a filed order (e.g., wrong container number). Needed?
6. **Who files in real ops.** Only the customer files today. Does KTC staff need an admin "create job order on behalf of" path (walk-ins)?
7. **Status-change notifications.** Only account-approval emails exist. Email the customer on JO `processing` / `on_hold` / `rejected` / `completed`?
8. **Service catalogue completeness.** `SERVICE_REQUESTS` = X-ray / DEA variants / OOG stripping. The sample invoice shows **electricity/reefer billing** — confirm the full list of billable services.
9. **Consignee scoping.** Any customer can pick any consignee (accreditation disabled, ADR-0007). Final, or restrict to accredited consignees?
10. **Go-live.** Finalize Customer Agreement with counsel; bump `AGREEMENT_VERSION`; public-launch hardening; run **ST02** end-to-end on the live domain.
11. **Google Sheets link (decided: both view + entry).** Constraint: Supabase stays source of truth — a Sheet bypasses RLS / caps / JO-numbering / status guards, so **live two-way sync is rejected**. Recommended: (a) one-way **app→Sheet mirror** (read-only, Sheets API + service account via Edge Function/cron) for checking/reporting; (b) for "fill up", **add the missing operational fields to the in-app JO form** (validated) — container size, vessel/voyage, plug-in/plug-out timestamps (ties to #2) — and/or a **bounded admin import** (template sheet → admin "Import" → validated RPC). Not bidirectional live sync. **Scheduled imports (requested):** feasible via a **scheduled Edge Function** (or `pg_cron`→`pg_net`→Edge Function, like the email/expiry jobs) + a Google service account. Must be validated (same RPC/rules), idempotent (upsert key + `last_synced` marker), logged (imported/skipped/errored, surface bad rows), and scoped to specific operational fields; prefer **import-to-staging + admin confirm** for sensitive changes since no human reviews each unattended run.

## Related
- [[Current State]] · [[Job Orders]] · [[Pending Items]] · ADR-0013, ADR-0014
- `CHANGELOG` 2026-06-10 (session 2)
