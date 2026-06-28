# KTC Portal — Refactor / Structural-Debt Audit (Recommendations Only)

_Date: 2026-06-28 · Lens: `refactor` (code-smell hunt) · Scope: `src/` only · Sources: a 5-agent parallel sweep (one per debt category) + direct owner spot-checks of the role-routing, pricing, types, and shell layers. **Recommendations only — nothing was edited.**_

> This audit is **distinct from** `2026-06-28-process-and-coherence-audit.md`. It deliberately **excludes** dead code, orphans, stubs, and unbuilt features (catalogued there). Everything below is debt in code that **works today but is hard to maintain**. Each item is evidence-cited (`file:line` + snippet) and scored by **maintenance-pain × blast-radius** with effort **S/M/L**.

## 1. Summary

The portal is functionally complete but carries the classic LLM-built debt profile: the **model never saw across files**, so the same concepts were re-implemented per screen. The debt clusters in five places. (1) **Role identity is smeared across ~9 files** — role→home routing, role→label, and role-derivation are each copy-pasted, and the underlying `staff_role` type is a bare `string` whose doc-comment still lists only 3 of the 5 live roles, so the compiler can't catch a typo'd role anywhere. (2) **Two screens have become god components** — `Settings.tsx` (1251 lines, 21 `useState`, 12+ domains) and `AllJobOrders.tsx` (1200 lines, 12+ workflows) — that bundle unrelated editors/desks behind one render. (3) The **same job-order data is fetched 5 different ways** with 5 hand-rolled `load()`+`useState(loading/data/error)` blocks and 5 divergent `select()` strings, begging a shared `useSupabaseQuery` + select presets. (4) **One concept, many renderings** — status chips exist in 3 forms, modals in 6, error banners in 4 — and **23 `as unknown as` casts** paper over the gap between hand-written row types and the real `select()` shape, so a schema change fails silently at runtime. The good news: a lot of this is **cheap, safe consolidation** (the canonical helpers — `peso`, `joPaymentState`, `hasAdminAccess`, `Notice`, `Modal`, `useBroker` — already exist; they're just under-used). Highest leverage: fix the `staff_role` type (S, correctness), then extract the role-routing + select-presets + `useSupabaseQuery` shared layer before splitting the two god files.

## 2. Top 10 (by maintenance-pain × blast-radius)

| # | ID | Title | File(s) | Effort |
|---|----|-------|---------|:------:|
| 1 | TYP-2 | `staff_role` typed bare `string`; comment lists 3 of 5 live roles | `lib/types.ts:38-39` | **S** |
| 2 | DUP-1 | Role→home routing copy-pasted across 4 files | `App.tsx`, `app/AppHome.tsx`, `admin/AdminShell.tsx`, `admin/AdminBottomNav.tsx` | **M** |
| 3 | GOD-1 | `Settings.tsx` — 1251 lines / 21 `useState` / 12+ editor domains | `admin/Settings.tsx` | **L** |
| 4 | GOD-2 | `AllJobOrders.tsx` — 1200 lines / 12+ workflows in one render | `admin/AllJobOrders.tsx` | **L** |
| 5 | ST-1 | 22× hand-rolled `load()`+`useState(loading/data/error)` → `useSupabaseQuery` | 12+ pages/admin screens | **M** |
| 6 | TYP-1 | 23× `as unknown as` casts hide `select()`/type drift | 17 files | **M** |
| 7 | DUP-4 | Status label + color maps redefined 4 ways (chip rendered 3 ways) | `AllJobOrders`, `MyJobOrders`, `admin/Releases`, `pages/Releases`, `AppChecker` | **M** |
| 8 | DUP-6 | Divergent `job_orders` `select()` strings, no shared presets | `AllJobOrders`, `CashierStation`, `Checker`, `AppChecker`, `MyJobOrders` | **S** |
| 9 | DUP-3 | `one()` single-row unwrap copy-pasted in 5 files | `Checker`, `AppChecker`, `AllJobOrders`, `CashierStation`, `admin/Releases` | **S** |
| 10 | INC-3 | Inline error `<div role="alert">` vs shared `<Notice>` (6+ sites, a11y drift) | `admin/*` | **S** |

---

## 3. Category 1 — Cross-file duplication (9)

### DUP-1 — Role→home routing copy-pasted (Effort M, pain HIGH, blast HIGH)
The "where does this role land" map is hand-written in 4 files; adding/renaming a role means editing all 4.
- `app/AppHome.tsx:20-25` — `if (broker?.staff_role === 'checker') return <Navigate to="/app/checker" .../>` … cashier/operations/csr/admin chain.
- `admin/AdminShell.tsx:58-62` — `const home = broker?.staff_role === 'checker' ? '/admin/checker' : … : '/admin'`
- `admin/AdminBottomNav.tsx:81-85` — same `home =` chain (admin variant).
- `App.tsx:79` — `if (broker?.staff_role === 'checker') return <Navigate to="/app/checker"…`
- **Fix:** one `roleHome(broker, { app })` in `lib/roles.ts`. Note the app-mode (`/app/*`) and admin-mode (`/admin/*`) targets differ — the helper takes a flag.

### DUP-2 — Role→label + role-derivation re-rolled (Effort S, pain MED, blast HIGH)
- `admin/AdminShell.tsx:52-57` and `app/AppLayout.tsx:38-43` — **identical** `const role = broker?.is_owner ? 'Owner' : broker?.staff_role === 'cashier' ? 'Cashier' : …` ladder.
- `lib/usePermissions.ts:45` — the canonical role string is derived differently: `broker?.is_owner ? 'owner' : broker?.staff_role ?? (broker?.is_admin ? 'admin' : null)`.
- **Fix:** `roleKey(broker)` + `roleLabel(broker)` in `lib/roles.ts`; have all three call them. Pairs naturally with DUP-1.

### DUP-3 — `one()` single-row unwrap × 5 (Effort S, pain MED, blast MED)
Byte-identical helper in five files:
- `admin/Checker.tsx:32-34`, `app/AppChecker.tsx:27`, `admin/AllJobOrders.tsx:30-32`, `admin/CashierStation.tsx:40-42`, `admin/Releases.tsx:19-21` — `function one<T>(v: T|T[]|null|undefined): T|null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }`
- **Fix:** export `one` from `lib/supabase.ts` (or a new `lib/rows.ts`); delete the 5 copies. Pure win.

### DUP-4 — Status label/color maps redefined 4 ways (Effort M, pain MED, blast MED-HIGH)
- `admin/AllJobOrders.tsx:34-49` — `STATUS_LABEL` + `STATUS_STYLE` (inline `{bg, ink}` CSS-var map).
- `pages/MyJobOrders.tsx:20-39` — `STATUS_LABEL` + `STATUS_TONE` (class-based `ktc-chip--${tone}`).
- `admin/Releases.tsx:26-41` — `STATUS_STYLE` + `SUP_STATUS_LABEL`.
- `app/AppChecker.tsx:41-44` — own `STATUS_LABEL`.
- **Fix:** one `lib/statusLabels.ts` (jo / release / supplement maps) + a `<StatusChip>` (see INC-1). Reconcile with the canonical `RELEASE_STATUS_LABEL` already in `lib/types.ts:236`.

### DUP-5 — Queue lane-rank + serving-key sort × 2 (Effort M, pain MED, blast MED)
- `admin/Checker.tsx:41-45` — `const LANE_RANK = { priority: 0, rexray: 2 }` + `servingKey(o)` (`LANE_RANK[…]*1e6 + serving_no`).
- `app/AppChecker.tsx:32-37` — same `LANE_RANK` + `servingKey` (+ `LANE_TAG`/`servingTag`).
- **Fix:** `lib/queue.ts` with `LANE_RANK`, `servingKey`, `serviceLineOf` (already in types.ts:78). The two checker screens are otherwise duplicate logic.

### DUP-6 — Divergent `job_orders` `select()` strings, no presets (Effort S, pain MED, blast HIGH)
The same table is selected with 5 hand-maintained column strings; a column rename silently breaks whichever screens didn't get updated.
- `admin/AllJobOrders.tsx:64` (full ops view), `admin/CashierStation.tsx:38` (payment fields), `admin/Checker.tsx:36-37` (xray fields), `app/AppChecker.tsx:24` (minimal), `pages/MyJobOrders.tsx:~289` (customer view).
- **Fix:** `lib/selects.ts` exporting `JO_SELECT.queue / .cashier / .checker / .mine` consts. Pure-string refactor, safest high-value win.

### DUP-7 — Upload-to-bucket → RPC pattern × 3 (Effort M, pain MED, blast MED)
- `pages/Payment.tsx:80-111` — `submitProof` / `submitSuppProof`: prepare → path → `storage.from('payment-slips').upload()` → RPC (near-identical twice).
- `admin/Checker.tsx:87-102` — `saveAssessment`: same shape with `storage.from('rps-docs')`.
- **Fix:** `uploadThenRpc({ bucket, file, rpc, args })` helper.

### DUP-8 — Inline `toLocaleString` date formatting × 4 (Effort S, pain LOW, blast MED)
`lib/batch.ts` already exports `batchLabel`/`formatAge`, but components inline their own:
- `components/JoTimeline.tsx:32`, `components/NotificationBell.tsx:38`, `components/StaffNotificationBell.tsx:31` — `new Date(iso).toLocaleString([], { month:'short', … })`; `admin/SupportInbox.tsx:70` — bare `toLocaleString()`.
- **Fix:** add `formatDateTime(iso)` to `lib/batch.ts`; replace the 4 sites.

### DUP-9 — Inline peso (1 site) (Effort S, pain LOW, blast LOW)
- `admin/Checker.tsx:206` — `rate: m.rate.toFixed(2)` instead of the shared `peso()` (`lib/pricing.ts:96`). Single straggler; fold in opportunistically.

---

## 4. Category 2 — God functions / components (8)

> Shared signal: line count + `useState`/`useEffect` density. Several already have **partially-extracted** sub-components living inside the same file — the seam exists, it just hasn't been cut to its own module.

### GOD-1 — `admin/Settings.tsx` — 1251 lines, **21 `useState` / 11 `useEffect`** (Effort L, pain HIGH)
Twelve+ unrelated editor domains in one component: pricing rates/fees/VAT (`43-317`), terminal tariff + storage tiers (`319-381`), shipping-line charge rules (`383-424`) + free days (`92-127`), RPS move rates (`129-145`), ancillary charge types (`147-197`), staff/access mgmt (`481-534`), role-permission gates (`222-245`), payment methods + QR upload (`83-220`), support channels (`426-446`), owner grants (`448-458`), email on/off (`460-477`).
- **Seams:** `PricingEditor`, `TerminalTariffEditor`, `ShippingLineManager`, `StaffAccessManager`, `RolePermissionsEditor`, `PaymentInfoEditor`, `AncillaryChargeTypesEditor`, `MoveRatesEditor` — each owning its own `useState` cluster behind a tab/section.

### GOD-2 — `admin/AllJobOrders.tsx` — 1200 lines, **14 `useState` / 4 `useEffect`** (Effort L, pain HIGH)
12+ workflows: list/filter/paginate (`247-303`), card/list toggle (`233-245`), detail modal (`237-240`), payment review (`688-732`), ERP invoice recording (`409-419`), supplements add/bill/reject (`421-433`), inline edit entry/vessel/voyage (`464-481`), Viber/SMS compose+copy (`483-490`), priority (`327-341`), re-X-ray (`343-358`), status transitions (`314-325`), bulk archive (`305-312`). Sub-comps already inline: `ActionsMenu` (132-190), `OrderCard` (880-920), `OrderBody` (820-875), `OrderActions` (627-817).
- **Seams:** `OrderListView`, `OrderDetailModal`, `OrderActionsPanel`, `InvoiceRecordingForm`, `SupplementManager`, `ChatMessageComposer`, and a shared chip module (see INC-1).

### GOD-3 — `admin/Releases.tsx` — 590 lines, **11 `useState`** (Effort L, pain HIGH)
Two permission-gated desks fused: a **Documents desk** (verify docs `298-330`, set charges `340-369`, add supplements `382-419`) and a **Cashier desk** (review base proofs `438-471`, review supplement proofs `482-521`, record OR+ERP invoice `531-583`), plus shared cancel threaded through 5 spots.
- **Seams:** `DocumentsDesk`, `CashierDesk`, `SupplementPaymentReviewItem`.

### GOD-4 — `pages/Releases.tsx` — 648 lines (Effort M, pain MED)
List + filing form + a large `ReleaseDetail` (309-573) bundling cancel/resubmit-doc/payment-proof + per-status conditional UI.
- **Seams:** `ReleaseFilingForm`, `ReleaseDetailModal`, `PaymentMethodsPanel` (reusable with JO payment), `ReleaseDocumentResubmission`. **Note:** `pages/Releases.tsx` and `admin/Releases.tsx` share payment-proof/supplement logic — extract a common `ReleasePayment*` before they drift.

### GOD-5 — `pages/MyJobOrders.tsx` — 630 lines, **7 `useState`** (Effort M, pain MED)
List/filter/paginate + detail modal + inline `NeedsInfoForm` (132-236) + edit/cancel/timeline. Most chips already extracted inline (`StatusBadge`, `PayPill`, …).
- **Seams:** move `NeedsInfoForm` to its own file; `JobOrderList` + `JobOrderDetailModal`; shared chip module.

### GOD-6 — `pages/Calculator.tsx` — 502 lines (Effort M, pain MED)
6-query parallel load (`66-88`) + shipment form + container grid + ancillary/reefer special-case + a 110-line charge `useMemo` (`121-232`) doing basic/line-rule/storage-tier/reefer/VAT math.
- **Seams:** extract `useChargeCalculator()` hook + `ShipmentDetailsForm` + `AncillaryServicesPanel` + `EstimatePanel`. The `useMemo` is the highest-value extraction (testable in isolation).

### GOD-7 — `pages/Login.tsx` — 434 lines, **11 `useState` / 5 `useEffect`** (Effort M, pain MED)
Sign-in + sign-up + brute-force lockout (`21-46`,`161-196`) + agreement scroll-gate (`118-129`,`324-372`) + CAPTCHA + disposable-email hint + resend + one-off sessionStorage notices (`132-152`) in one form.
- **Seams:** `useBruteForceLock()` hook, `AgreementModal`, `useOneOffNotices()` hook, split `SignInView` / `SignUpView`.

### GOD-8 — `admin/CashierStation.tsx` — 289 lines (Effort M, pain MED)
Four queues (review proofs / collect window / record invoice / supplements) + inline office-payment modal. Cleaner than the others but still 4 workflows + 4 RPC paths in one render.
- **Seams:** `PaymentReviewQueue`, `WindowPaymentQueue`, `InvoiceRecordingQueue`, `SupplementQueue`; export the inline `Card`/`Section`/`ReviewActions`.

---

## 5. Category 3 — Inconsistent implementations (4)

### INC-1 — Status chip rendered 3 ways (Effort M, pain MED, blast MED-HIGH)
- **A (admin):** inline `{bg, ink}` style map → `<span style={…}>` — `admin/AllJobOrders.tsx:42-49`, `admin/Releases.tsx:26-34`.
- **B (customer):** class-based `<span className={`ktc-chip ktc-chip--${tone}`}>` — `pages/MyJobOrders.tsx:77-84`, `pages/Releases.tsx:57-64`.
- **C (inline ternary):** supplement pill — `admin/AllJobOrders.tsx:832-834` (`requested ? '' : … 'ktc-chip--success' : …`).
- **Keep B.** Promote a `<StatusChip kind="jo|release|supplement" status=…>` over `lib/statusLabels.ts` (DUP-4); migrate A and C.

### INC-2 — No canonical modal primitive; 6 patterns (Effort M, pain MED, blast MED)
A shared `components/Modal.tsx` (portal) exists but most call sites hand-roll `ktc-modal-backdrop` + `ktc-glass`: `FileViewerModal.tsx:172-249` (own portal), `IdleWarning.tsx:10-22` (no portal), `SessionConflictModal.tsx` / `SessionSupersededOverlay.tsx:27-46` (no shared backdrop), inline modals in `CashierStation.tsx:274-286`, `AllJobOrders.tsx`, `Checker.tsx`, `Consignees.tsx`.
- **Fix:** pick ONE — either adopt `Modal.tsx` everywhere (add Esc + backdrop-click) or bless `ktc-modal-backdrop` as the documented primitive and route all overlays through one small wrapper. (Whether `Modal.tsx` is currently wired is a dead-code question for the other audit — here the issue is the **absence of a single pattern**.)

### INC-3 — Error/alert banner 4 ways; `<Notice>` under-used (Effort S, pain MED, blast MED)
Canonical `components/Notice.tsx` (`role="status"`, tone system) is used in `Login`/`Payment`/`MyRequests`, but admin screens hand-roll an identical `<div role="alert" style={{…var(--c-h0-…)…}}>` (`CashierStation.tsx:184`, `Checker`, `Releases`, …6+), some with no `role` at all (`Brokers.tsx:225`, `Settings.tsx`).
- **Fix:** replace inline error divs with `<Notice tone="error">`. Mechanical, improves a11y consistency.

### INC-4 — "Add charge" vs "Request charge" split, JO-only (Effort S/M, pain LOW-MED, blast LOW)
- JO: permission-gated two-path — `admin/AllJobOrders.tsx:~390` (`can('bill_supplement') ? add_supplement : request_supplement`).
- Release: always-bill — `admin/Releases.tsx:137` (`add_release_charge`, amount required).
- **Decision, not pure refactor:** if releases should also support a "request (price later)" flow, mirror the JO pattern; otherwise add a one-line code comment marking the divergence intentional. (The payment **confirm** paths across `CashierStation` vs `AllJobOrders` were reviewed and are an **intentional** desk/queue separation — *not* a finding.)

---

## 6. Category 4 — Type debt (6)

### TYP-1 — 23× `as unknown as` casts hide `select()` drift (Effort M, pain MED-HIGH, blast HIGH)
Every list fetch double-casts the Supabase result to a hand-written row type, e.g. `admin/AllJobOrders.tsx:261` `((data ?? []) as unknown as AdminJobOrder[]).map(…)`; same shape in `app/AppChecker.tsx:75,89,107`, `admin/Checker.tsx:110,137,138`, `admin/CashierStation.tsx:68`, `pages/Releases.tsx:99,112`, `pages/MyJobOrders.tsx:289`, `admin/SupportInbox.tsx:111`, `admin/CustomerDetail.tsx:67`, `pages/Payment.tsx:47`, `pages/JobOrderPrint.tsx:58`, `admin/SystemHealth.tsx:52`, `admin/Logs.tsx:56`, `chat/actions.ts:106,147`, `admin/NewJobOrder.tsx:84`. A renamed/removed column compiles clean and fails at runtime.
- **Fix:** adopt `supabase gen types` (generated DB types) or a thin typed query wrapper that validates the row shape; then the `unknown` hop disappears. Highest-leverage type fix.

### TYP-2 — `staff_role` is bare `string`; comment is stale (Effort S, pain MED, blast HIGH)
- `lib/types.ts:38-39` — `/** Staff role ('admin' | 'cashier' | 'checker'); null for customers. */ staff_role: string | null`. But the live app branches on **`operations`** and **`csr`** too (`app/AppLayout.tsx:41-42`, `admin/AdminShell.tsx:55-56`, `app/AppHome.tsx:22-23`). So the type is too loose (a typo'd role passes the compiler) **and** the comment under-counts the roles.
- **Fix:** `export type StaffRole = 'admin'|'cashier'|'checker'|'operations'|'csr'`; `staff_role: StaffRole | null`; correct the comment. Then every `staff_role === '…'` gets exhaustiveness checking — closes the door on the DUP-1/DUP-2 role typos.

### TYP-3 — Per-file row projections + a duplicated interface (Effort S-M, pain MED, blast MED)
- Duplicate `Ticket`/`Message` interfaces: `admin/SupportInbox.tsx:15,26` vs `pages/SupportTickets.tsx:12,21` (inbox adds `customer`/`customer_id`; they drift independently). → export from a shared `lib/support.ts`.
- Legit-but-undocumented projections: `AdminJobOrder` (AllJobOrders:20), `Order` (AppChecker:17), `CheckerOrder` (Checker:18), `CashOrder` (CashierStation:18), `PrintOrder` (JobOrderPrint:6), `Filed` (NewJobOrder:17). Keeping them local is fine, but each must stay in sync with its `select()` string (see DUP-6) — add a TSDoc note tying each to its preset, or co-locate in `lib/types.ts` as `JobOrderXView`.

### TYP-4 — `as unknown as Record<string,string>` dynamic-key casts (Effort M, pain MED, blast LOW)
- `admin/Settings.tsx:342` and `:368` — `(r as unknown as Record<string,string>)[k]` to read dynamic dimension keys off `TermRate`. Defeats type safety on the tariff grid.
- **Fix:** type the dimension keys explicitly (`Pick<TermRate, DimensionKey>` / a `DimensionKey` union) so a renamed dimension is a compile error.

### TYP-5 — 16 undocumented `eslint-disable react-hooks/exhaustive-deps` (Effort S, pain LOW, blast MED)
Mostly `void load() }, [])` mount-once loaders: `AllJobOrders:275`, `Checker:121`, `Logs:117`, `Releases:109`, `MyJobOrders:158,302`, `Payment:53`, `MyRequests:46`, `Consignees:138`, `ContainerLinesEditor:46`, `Tour:39,76`, `TourProvider:74,84`, `Turnstile:73`, `JoTimeline:51`.
- **Fix:** mostly evaporate once `useSupabaseQuery` (ST-1) owns the effect; the rest get a one-line "why omitted" comment.

### TYP-6 — Misc loose types (Effort S, pain LOW, blast LOW)
- `admin/Logs.tsx:56` — inline intersection join type; name it `JobOrderEventWithJo` in `lib/types.ts`.
- `lib/lazyWithReload.ts:20` — `ComponentType<any>` (mirrors `React.lazy`; acceptable — document that callers supply the prop type).

---

## 7. Category 5 — State / data-fetch debt (7)

### ST-1 — 22× hand-rolled `load()`+`useState(loading/data/error)` → `useSupabaseQuery` (Effort M, pain MED-HIGH, blast HIGH)
The same fetch scaffold (state trio + `useEffect(() => void load(), [])` + `useAutoRefresh(load)`) is re-implemented in `CashierStation.tsx:63-72`, `Checker.tsx:104-122`, `AllJobOrders` (load+paginate), `Brokers.tsx:35-44`, `Consignees.tsx:118-146` (+debounce), `Approvals.tsx:69-75`, `Payment.tsx:37-52`, `MyJobOrders` (paginate), `AppChecker.tsx:71-82`, etc.
- **Fix:** `useSupabaseQuery<T>(queryFn, { autoRefresh, debounceMs })` returning `{ data, loading, error, refresh }`. Collapses ~22 blocks and absorbs most of TYP-5.

### ST-2 — Pricing config fetched two ways (Effort S, pain MED, blast MED)
- `lib/pricing.ts:29-44` `loadPricingConfig()` (service_rates+pricing_settings+move_rates) is the canonical loader (used by `Payment.tsx:43`), but `pages/Calculator.tsx:66-88` re-rolls its own 6-query `Promise.all` that re-fetches `service_rates`+`pricing_settings` independently.
- **Fix:** `usePricingConfig()` wrapping `loadPricingConfig()` with a module-level cache (mirror `useBroker`'s cache pattern, `useBroker.ts:11-14`); have Calculator extend it rather than duplicate.

### ST-3 — Notification bells duplicate the whole polling+dropdown loop (Effort S, pain MED, blast LOW)
- `components/NotificationBell.tsx:49-76` and `components/StaffNotificationBell.tsx:42-68` — same `useAutoRefresh` fetch + **identical** ref-based click-outside close logic, differing only in table name.
- **Fix:** extract `useClickOutside(ref, onClose)` (reusable far beyond these two) and optionally a generic `useNotificationFeed(table, readsTable)`.

### ST-4 — No `BrokerContext`; role + permissions re-fetched per page (Effort M, pain MED, blast MED)
`AuthContext` only holds session/signOut. `useBroker` caches at module level but `usePermissions.ts:38-64` re-fetches `role_permissions` on every mount of every gated screen.
- **Fix:** a `BrokerContext` (broker + permission `Set`) provided once at the shell, invalidated on sign-out — removes redundant `role_permissions` round-trips and the minor prop-drilling in ST-6.

### ST-5 — Polling/interval boilerplate across 3 hooks (Effort S, pain LOW, blast MED)
`useSessionGuard.ts:14-61`, `useIdleLogout.ts:40-47`, `useAutoRefresh.ts:12-47` each re-implement visibilitychange/focus + `setInterval`/cleanup.
- **Fix:** a shared `useVisibilityInterval(fn, ms)`; make `useSessionGuard`/`useAutoRefresh` thin wrappers.

### ST-6 — Minor prop-drilling of `broker` (Effort S, pain LOW, blast LOW)
`Shell.tsx:24,75,79,94` fetches `broker` then passes it to `BrokerStatusBanner.tsx:12` and `PendingPanel.tsx:12`, which could read it themselves. Only worth doing alongside ST-4 (keep the `onRefresh` callback so the shell still controls refresh cadence).

### ST-7 — Manual refetch callbacks instead of cache invalidation (Effort M, pain MED, blast MED)
`onDone`/`load()` is threaded through forms (`EditJobOrderForm.tsx:16-21,65`), and every CashierStation action (`CashierStation.tsx:84,91,100,107,114`) `await load()`s manually; `PendingPanel.tsx:43` even `window.location.reload()`s. Easy to forget → stale screens.
- **Fix:** once `useSupabaseQuery` (ST-1) exists, add lightweight keyed cache-invalidation so mutations refresh subscribers automatically. (Largest of the state items; do last.)

---

## 8. Suggested sequence (cheap-and-safe first)
1. **TYP-2** (`StaffRole` union) — unblocks exhaustiveness for all role checks. **S.**
2. **DUP-3 / DUP-6 / ST-2** (extract `one()`, `lib/selects.ts`, `usePricingConfig`) — pure consolidation, no behavior change. **S.**
3. **DUP-1 / DUP-2** (`lib/roles.ts`: `roleHome`/`roleKey`/`roleLabel`). **M.**
4. **ST-1** (`useSupabaseQuery`) + **TYP-1** (generated DB types) — the big fetch/type cleanup; absorbs TYP-5. **M.**
5. **DUP-4 + INC-1 + INC-3** (`lib/statusLabels.ts`, `<StatusChip>`, route errors through `<Notice>`). **M.**
6. **GOD-1 / GOD-2 / GOD-3** — split the three god files last, on top of the now-shared helpers. **L.**
