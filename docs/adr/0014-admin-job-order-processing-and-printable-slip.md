# ADR-0014: Admin job-order processing ("approve = start processing") + printable slip

* Status: Accepted
* Deciders: KTC project stakeholders (owner)
* Date: 2026-06-10
* Category: Workflow

## Context and Problem Statement

After ADR-0012, job orders from verified customers reached the admin queue as `submitted`, but `/admin/job-orders` was **read-only** — there was no way to act on an individual order, and there was no per-order "approved" concept (only account approval existed). KTC also wanted a **printable job-order document** for approved orders, sized to a quarter sheet and visually matching the existing **KTC Service Invoice**.

Two decisions were needed: (1) how per-order approval should work, and (2) the printable format.

## Considered Options

**Per-order approval:**
* **A — Add explicit Approve/Reject per order** (new `approved` status).
* **B — Auto-approved on submit** (no per-order review).
* **C — Approve = start processing (chosen):** reuse existing statuses; the admin moving an order to **`processing`** *is* the approval, and unlocks the slip.

**Printable format:**
* **Print-friendly quarter sheet (chosen):** a dedicated print view + print CSS (`@page { size: A6 }`); browser Print → print or Save-as-PDF. No new dependency.
* Downloadable PDF via a library (jsPDF) — rejected (extra dependency/maintenance).

## Decision Outcome

**Per-order processing (migration `0029`).** The admin Job Orders page advances an order:

* `submitted | on_hold` → **Approve & process** (`processing`) — *this is the approval.*
* `processing` → **Mark completed** (`completed`).
* `submitted | processing` → **Hold for info** (`on_hold`).
* `submitted | processing | on_hold` → **Reject** (`rejected`).

**Hold** and **Reject** require a **customer-visible note** (`admin_note` column), surfaced on the customer's My Job Orders ("Information needed: …" / "Rejected: …"). Two new statuses **`on_hold`** and **`rejected`** were added — deliberately distinct from **`held`** (the account-unverified, queue-hidden state from ADR-0012) so an admin hold doesn't vanish from the queue. An **admin UPDATE policy** on `job_orders` (`using is_admin()`, owner included) was added; customers still have **no** UPDATE policy. `on_hold` now counts toward a customer's 10 open-order slots (`enforce_order_caps`).

**Printable slip (`/job-order/:id/print`).** An **A6 quarter-sheet** rendered as a mini KTC Service Invoice: logo + company name / TIN / Davao address header, **JOB ORDER** + red **JO No.** + date, a bordered **JOB ORDER FOR** customer block (name, customer code, consignee, entry no., status), a line-item table (`Container No. · Nature of Service · Qty · Amount`), a **TOTAL CONTAINERS** row, and **Prepared by / Received by** signature lines, with the invoice's navy rules and gray header fills. The **Amount** column shows `—` and a totals slot is reserved so **prices can be added later** without a redesign. Print via `window.print()` with `@page { size: A6 portrait }` and `print-color-adjust: exact`. The slip is available once an order is **approved** (`processing` or `completed`); RLS lets a customer print their own and an admin print any. While `processing`, a diagonal **"ON PROCESS" watermark** + a "STILL ON PROCESS — NOT YET COMPLETED" banner render (and disappear once `completed`) so an in-progress slip can't be mistaken for a final one.

### Positive Consequences

* No new status vocabulary for "approved" — `processing` doubles as approval, matching how staff actually work the queue.
* Hold/reject give the admin a structured way to bounce an order back with a reason instead of silent rejection.
* The slip is dependency-free, prints/saves as PDF anywhere, and is pre-structured for pricing.

### Negative Consequences / Trade-offs

* `processing` now means both "approved" and "work in progress" — they can't be distinguished. Acceptable per the chosen model; a distinct `approved` status can be added later if needed.
* Three "hold-like" concepts exist (`held`, `on_hold`, plus rejected/cancelled); the distinction (account gate vs per-order hold) must be kept clear in UI copy.
* The A6 slip is fixed-size; a 100-container order flows to multiple A6 pages.

## Open question (deferred)

* **Pricing** — job orders carry no rate/amount fields yet. When added, the slip's Amount column + totals slot are ready; VAT/withholding handling (as on the Service Invoice) is a future decision.

## Related ADRs

* Builds on [ADR-0012](0012-pending-brokers-enter-portal-submit-gated.md) (held lifecycle; the admin queue still excludes `held`).

## References

* `src/admin/AllJobOrders.tsx` (processing actions + note modal) · `src/pages/JobOrderPrint.tsx` (A6 slip) · `src/pages/MyJobOrders.tsx` (status badges, admin note, Print slip)
* `supabase/migrations/0029_admin_job_order_processing.sql` (statuses, `admin_note`, admin UPDATE policy, cap update)
