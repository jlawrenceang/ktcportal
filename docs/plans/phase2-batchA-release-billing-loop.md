# Spec — Phase 2 Batch A: Release-billing loop (ADR-0036)

_Status: DRAFT for owner confirm · 2026-06-28 · Implements [ADR-0036](../adr/0036-cash-basis-billing-consignee-payment-terms-deferrals.md) + audit items T2-03/04/05/06 + breaktest backlog._

## What (plain language)

Finish the **pull-out / release billing loop** so it works end-to-end as a manual cash flow, and make every step visible to the right people:

1. **Bill document** — when staff compute a release charge, they can **upload the actual bill/SOA** (PDF/image), and the **customer sees it** before paying (today they only see a peso figure + a note).
2. **Fix a wrong charge** — staff can **correct or remove** a mistaken charge (base amount or an extra charge) **as long as it hasn't been paid**. Today a fat-fingered charge is permanent and blocks the order forever.
3. **Notifications** — the **customer** gets pinged through the release lifecycle (bill ready → pay; payment confirmed/rejected; cleared/OR issued; cancelled). The **release desk + cashier** get pinged when a new release is filed and when a payment proof comes in. Today releases fire **zero** notifications on either side.
4. **Consignee cash/credit flag** — add a **cash | credit** setting on each consignee (default **cash**), set on the admin add/edit form and shown on the consignee view. This only records the terms now; the credit *workflow* stays deferred (ADR-0036).
5. **Suspend stops releases** — suspending or rejecting a customer now also **cancels their in-flight releases** (today it only cancels job orders, leaving releases live — an access-control hole).

## Why

ADR-0036 chose a **cash-only manual release-billing loop** for launch. The pieces exist (file → verify docs → set charge → pay → confirm → record OR → released) but three gaps make it unsafe/incomplete: no bill document, no way to undo a wrong charge, and **no notifications at all** — customers and staff discover release work only by manually refreshing. T2-05 is a real access-control bug.

## Done looks like (acceptance criteria — all testable on the sandbox)

- **Bill doc:** staff set a charge with an attached bill file → customer opens their release and can **view/download the bill** before paying. Staff can replace it while unpaid.
- **Edit/void:** staff change the **base amount** on an unpaid `payable` release and it updates (today: blocked once payable). Staff **remove an extra charge** that is unpaid/rejected, and the OR can then be recorded. A **paid/confirmed** charge **cannot** be voided/edited (guard holds).
- **Customer notifications:** a release reaching **payable** drops a "bill ready — ₱X" notification that routes to `/releases`; confirmed/rejected/released/on_hold/cancelled each notify with the right icon + route.
- **Staff notifications:** filing a release pings the **documents desk** (`verify_release_docs`); a submitted release/supplement payment pings the **cashier** (`review_payments`); both route to `/admin/releases`; the staff bell shows correct icons + an accurate unread count.
- **Consignee terms:** admin sets a consignee to **cash** or **credit** on add/edit; the value shows on the detail view; default is **cash**; existing rows backfill to **cash**. (No behavioural change from credit yet.)
- **Suspend/reject:** suspending a customer cancels their **open** releases (`submitted/docs_verified/payable`) but **skips** `paid`/`released` and any release carrying a `submitted`/`confirmed` supplement; a staff note records why.
- All existing release smoke paths still pass; `check-security-invariants` clean; Jarvis review pass.

## Must / Must-not

- **Must** preserve the current separation of duties (0171): the **documents desk** verifies docs + sets charges; the **cashier** confirms payment + records the OR. (See the one decision below.)
- **Must** recreate every touched SECURITY DEFINER function verbatim from its latest definition with only the documented change; preserve every grant/revoke + RLS policy name exactly.
- **Must-not** let a suspended customer or the desks drive a cancelled release further; must-not orphan in-flight release money.
- **Must-not** build the credit flow, ERP API, or auto-tariff bridge (deferred, ADR-0036).

## Out of scope (deferred per ADR-0036 — NOT in this batch)

- Credit / billed-on-account (BI-INV) release flow (T2-36) — only the consignee flag lands now.
- ERP/Frappe API verification of the OR control number (T2-35).
- Terminal-tariff → auto-charge bridge (T2-29/30/31) — charges stay manually computed.
- Release manual/tour copy (T2-32/33) — that's Phase 4.

## Decision — CONFIRMED 2026-06-28: cashier does both

Owner confirmed the **cashier computes the charge + uploads the bill + sets the amount AND confirms payment + records the OR** (ADR-0036's literal loop). Implementation:
- Gate `set_release_charges`, `add_release_charge`, `void_release_charge` on **`review_payments` OR `verify_release_docs`** (cashier gains the billing step; admin/CSR retain it).
- Bill-doc storage write allowed to either gate.
- **Doc-verification (`verify_release_order`) stays a `verify_release_docs` step** (a DO/BL legitimacy check, distinct from billing — ADR-0036 didn't ask to merge it; the state machine still requires `docs_verified` before charges). To make the cashier fully self-service from filing, the owner can grant the cashier `verify_release_docs` in the Roles & Gates editor (Batch E exposes it) — no code change needed. **Flag this to the owner in the build report.**

## Technical plan (for the build + Jarvis)

**Migration `0188` (one forward-only migration):**
1. `alter table consignees add column payment_terms text not null default 'cash' check (payment_terms in ('cash','credit'));` — existing rows backfill to `cash`.
2. `alter table release_orders add column bill_doc_path text;`
3. `alter table notifications add column release_order_id uuid references release_orders(id) on delete cascade;`
4. `alter table staff_notifications add column release_order_id uuid references release_orders(id) on delete cascade;`
5. Widen `set_release_charges` to accept `p_bill_doc_path` and to run from `docs_verified` **or** (`payable` and `payment_status in ('unpaid','rejected')`) — enables the edit-before-paid path. Recreate verbatim + the new param/guard only.
6. New `void_release_charge(p_supplement_id uuid)` (gate `verify_release_docs`) — delete/void a supplement only while its `payment_status in ('unpaid','rejected')`.
7. New `notify_release_change()` trigger (AFTER UPDATE on `release_orders`) → customer notifications on the transitions above; new `kind`s `release_payable|release_confirmed|release_rejected|release_released|release_on_hold|release_cancelled`.
8. Extend staff notifications: `notify_staff` calls on release INSERT (`verify_release_docs`/`release_new`) and on release/supplement `payment_status→submitted` (`review_payments`/`release_payment`); new staff `kind`s.
9. Extend the customers status trigger (sibling to `release_held_job_orders`, 0153) to cancel open releases on suspend/reject with the skip rules above.
10. Storage: add `release-docs` policies so `verify_release_docs` staff can write `bills/*` and a customer can read the `bill_doc_path` of their own release (subquery policy against `release_orders`).

**Frontend:**
- `src/admin/Releases.tsx` — bill-doc upload at the set-charge step; Remove control on supplements (void); show consignee terms; ensure staff bell new kinds route to `/admin/releases`.
- `src/pages/Releases.tsx` — view/download the bill doc; surface release notifications via the bell.
- `src/admin/Consignees.tsx` — cash/credit selector on add + edit; show on detail; extend the load SELECT + type with `payment_terms`.
- `src/components/NotificationBell.tsx` — add `release_*` icons + route `release_order_id → /releases`.
- `src/components/StaffNotificationBell.tsx` — add `release_new|release_payment|release_supp_payment` icons + route `release_order_id → /admin/releases`.
- `src/lib/types.ts` — add `payment_terms` to the Consignee type.
- i18n keys deferred to Phase 4 (English renders as fallback; no dead-end).

**Verification chain:** build → apply to sandbox (`zwvzadkgeyhkhyshkwhc`) → behavioural re-test of the release loop + the 5 acceptance areas + suspend-cancels-releases → `check-security-invariants` → Jarvis code-review (grants/guards preserved, no over-blocking) → apply to prod → version bump + CHANGELOG + ship.
