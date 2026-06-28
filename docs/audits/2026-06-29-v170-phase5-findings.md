# v1.7.0 Phase-5 findings — ship-review + UX/UI audit (2026-06-29)

Two ultracode workflows over the shipped v1.7.0. Full transcripts in the session's `subagents/workflows/` dirs (`wf_3d248f86` ship-review, `wf_00327614` ux-ui). This is the actionable distillation.

## A. Ship-review (adversarial code + security) — 16 confirmed (4 medium, 12 low)

### Real bugs worth fixing (medium)
1. **Money — extra charge can be PAID + CONFIRMED on a CANCELLED release (no OR / no refund trail).** A `payable` release carrying an **unpaid** supplement can be cancelled (the cancel guard only blocks `submitted`/`confirmed` supplements), the supplement row survives, and the customer's pay control + the cashier's review queue both ignore the parent `status` — so a real payment gets confirmed against a cancelled order. It's the release-side twin of the JO gap fixed in 0186 (KTC-34) and the base-release gap fixed in 0178. _Fix:_ add a parent-release terminal-status guard to `submit_release_supplement_payment` + `confirm_release_supplement_payment` (reject when `release_orders.status in ('cancelled','released')`), and gate the UI pay control + `toReviewSup` queue on `r.status`. `0125`/`0159` + `src/pages/Releases.tsx` + `src/admin/Releases.tsx`.
2. **Compat regression shipped in v1.7.0 — mobile checker dead-ends on a `submitted` order.** `0187` (KTC-16) made `record_van_xray` reject any status not in `processing/on_hold` (dropped the submitted→processing auto-promote). The desktop `Checker.tsx` queue was aligned (`processing/on_hold`), but the **mobile `AppChecker.tsx` still queues `submitted` orders (line 70) and renders the Confirm-X-ray button (line 243)** → a checker taps Confirm and gets a hard error where it used to work. Aggravated by installed-PWA caching. _Fix:_ align `AppChecker.tsx:70` queue + `:243` button gate to `['processing','on_hold']`; show an "Awaiting ops acceptance" chip for `submitted`.

_The 12 lows + the other 2 mediums are in the transcript (mostly defensive hardening + minor doc/UX)._

## B. Whole-app UX/UI audit — 256 enhancements (23 high, 144 medium, 89 low)

### Design direction (synthesis)
Two surfaces (phone-first customer portal + dense desktop ops) under a **heavily glassy/gradient skin** — backdrop-filter on ~8+ stacked layers in one customer journey; the single brand accent does triple duty (primary / alert / error) so nothing resolves to one focal point. **Highest-leverage move: strip glass+gradient to a flat, hairline-bordered, single-accent system and let the data be the hero** (JO/serving numbers, balances, queue counts), reserving glass for floating chrome only, and split the accent into real semantic tokens (`--ok`/`--warn`/`--danger`). This also fixes low-end-Android paint cost.

### Cross-cutting issues (highest reach)
- **★ Error-blind data loaders (~13 views)** — `const { data } = await…` discards the Supabase `error`, so a failed / RLS-denied / offline fetch collapses to `rows=[]` and renders the **success empty state** ("queue clear", "no orders"). **This is the read-side of the "looks fine but isn't working" failure mode** — staff told "queue clear" when the load failed; customers told to re-file orders they already have. (Home, Notifications, NotificationBell, MyJobOrders, JoTimeline, JobOrderPrint, Payment, Releases, MyRequests, Vessels, Dashboard, CustomerDetail, AllJobOrders.) _Fix: one template — capture `error`, distinct error branch + Retry, reserve empty copy for `count===0 && !error`._
- **Weak modal a11y** — ~10 hand-rolled overlays lack `role=dialog`/`aria-modal`/Escape/focus-trap/return (a good shared `Modal` exists; adopt it everywhere).
- **Sub-44px touch targets** on the phone-first surface (bell, avatar, checkboxes, JO rows, ✕ glyphs, seg chips, link-actions incl. destructive next to safe).
- **Accent overload / missing semantic tokens** — error copy in `var(--acc-2)`; `--ok`/`--danger` referenced but undefined (fall back to off-system hex).
- **Fragmented status-pill + error-display systems** (3–4 uncoordinated pill systems; errors split between shared `Notice` and bare divs with no `role=alert`).
- **Inline-style / magic-number sprawl** (11.5/12.5/13.5… fractional sizes, one-off paddings).
- **No last-action confirmation** — JO/release filing + admin transitions drop to a list with no toast/highlight; JO RPC even discards the returned `jo_number`.
- **Unlabeled form controls** (file inputs, selects, textareas).

### Notable specific highs
- **Approvals "Account approved" modal asserts "Their valid ID was removed from storage" — but `decideBroker` never deletes it** (ID kept per the retention policy). False claim → remove or actually trigger + report the delete.
- **New Job Order submit** — no confirmation, discards the returned id (pair with the error-blind fix: prove the write landed).
- **Brokers list** — `select('*')` no search/filter/pagination on the primary ops account screen.

## Next
1. Customer happy+break e2e lane running (live prod) — proves the *write* wires; the error-blind finding is the *read* wires.
2. Consolidate ship-review + UX/UI + e2e + sandbox into one prioritized remediation, fix confirmed bugs.
3. Annotated smoke test for the owner's blind→guided side-by-side comparison.
