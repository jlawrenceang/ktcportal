# Changelog

All notable changes to the KTC broker portal. Newest first. Dates are absolute (YYYY-MM-DD).

**Versioning (since v1.1.0):** every deployment bumps `APP_VERSION` in `src/version.ts`, gets a matching `## vX.Y.Z` header here, and a git tag. The portal footers show the full provenance — version, git commit, build date (e.g. `v1.1.0 (3d81eca · 2026-06-13)`) — so the running deployment is always identifiable at a glance.

## Unreleased

- **ADR-0035 doc + test sync** (2026-06-27): brought the architecture map, role flows, core/concept docs, smoke tests, and Playwright specs up to the shipped job-order ops overhaul (migrations `0170`–`0183`). `docs/architecture-overview.md` + `docs/diagrams/role-and-operation-flows.md` now carry the six maker-checker gates (`request_priority`/`approve_priority`, `request_rexray`/`approve_rexray`, `request_supplement`/`bill_supplement`), the `0171` separation-of-duties (cashier money-only; CSR no approval; **operations can't file-on-behalf** — revoked back in `0060`), the `/app/*` staff landings, the automatic serving-number lanes (regular/priority/re-X-ray), auto-complete, and the invoice-gated base payment — matrix re-verified against the live `role_permissions` + the migration seed inserts. Synced the **Job Orders** core page, **Staff Roles & Gates**, and **Job Order Lifecycle §C** to match. New **ST06** smoke test (`docs/smoke-test-06-portal.md`) covering the ADR-0035 deltas (7 canonical lanes); **ST05** marked superseded-in-part; `testing-and-release.md` pointers/counts corrected. Playwright: fixed the two stale `e2e/smoke.spec.ts` tests (signed-out `/` → AuthRail access menu; unknown route → `/`), added `/app/*` staff-PWA route coverage, broadened the minted-staff landing assertion, and added ADR-0035 `fixme` stubs. **Verified: `tsc --noEmit` clean; `e2e/smoke.spec.ts` 15/15 green vs live prod.** Docs + tests only — no runtime/DB change.
- **Incoherence sweep + architecture overview** (2026-06-25): ran the `incoherence` skill (3 evidence-backed detection agents across migration/version, terminology/enum, and spec↔implementation). Clean except current-state doc lag — refreshed `System Scale`, `Home`, `AGENTS.md`, `release-gate.md`, `workflow-invariants.md`, and the role-flow diagram to runtime truth (v1.6.13, migration `0159`, ADRs `0029`, the six-role set incl. backend-only `purchaser`, D-01 closed). Added `docs/architecture-overview.md` — a one-screen structural system map (topology, backend-enforced access model, the two operational spines, module/route map) named by the framework's doc-governance layering; wired into `docs/README.md`, vault `Home`, and the vault `Architecture` page. Docs-only.
- **doc-governance cap policy synced** (2026-06-24): `docs/agent/doc-governance.md` updated from the old "~220 words (up to ~230)" to the global **soft-150 / confirm-150-200 / hard-200** policy (narrative → `Business Context.md`). The old self-justification (third pillar + extra non-negotiable) is obsolete now that the Mission/Pillars narrative lives in Business Context and `CLAUDE.md` is 198 words.
- **Business Context onboarding doc added + CLAUDE.md trimmed** (2026-06-24): new canonical `docs/obsidian-vault/01-System/Business Context.md` — one owning file for business background (who we are / who uses it / why) + product scope (two-pillar roadmap, north star, modules), per the global doc-governance layering. Relocated the Mission detail + the full **Pillars & roadmap** narrative out of `CLAUDE.md` into it, bringing the constitution from ~509 → 198 words (under the global hard-200 cap). Wired discoverability pointers from `CLAUDE.md`, `AGENTS.md`, `Home.md`, and `docs/README.md` (cold reader reaches it in ≤2 hops). Live version/migration counts stay linked from `07-Memory/Current State`, not hardcoded. Docs-only; no runtime or DB change.

## v1.6.73 — 2026-06-27 (Audit closure B+C: notifications, re-X-ray/consignee/vessel guards, copy)

Migration **0183**:
- **Staff are pinged on a request** — `request_supplement` notifies the cashier, `request_rexray` notifies the admin (was: the request sat in limbo). (#437.)
- **Billing a charge on a completed order no longer reopens it** — `bill_supplement`/`add_supplement` leave the order completed (the `has_open_supplement` gate handles the release), killing a wrong "approved / now processing" notice + a spurious serving number. (#426.)
- **Re-X-ray hardening** — a customer can't edit a re-X-ray child (#258); `request_rexray` takes an advisory lock so concurrent requests can't collide on the suffix (#514).
- **Pending accounts can't request consignees** (verify-only lockdown, #481); resubmit shows a friendly name-collision message (#492).
- **Priority grant requires a pending request** + raises on not-found (was a silent no-op on any/nonexistent order). (#525.)
- **Vessel free-day join is case/whitespace-insensitive** — a shipping-line spelling variant no longer keeps a stale call in the picker forever. (#327.)

Frontend:
- Pending-account copy now says orders **can't** be filed until approved (banner + Lara chat), matching the 0163 backend lock. (#393.)
- The release "Paid" notice shows a "settle the charges first" warning when an additional charge is unpaid, instead of telling the customer to claim the OR. (#503.)

Deferred to the **Phase-1 fuel desk** (parked module, no live UI): fuel reconciliation / source-filter / write-RPCs / rate-uniqueness (#316/#547/#558/#569) + the purchaser-role UI (#305).

## v1.6.72 — 2026-06-27 (Audit closure A: cashier-crash regression + checker/payment hardening)

- **Fixed a CashierStation crash** — a *requested* (un-priced) charge made the cashier's "Additional charges" render `peso(null)` and throw; the list now counts only billed charges, with a defensive "—" fallback. (Regression introduced in batch 3, caught by the closure workflow.)
- **Free re-X-ray never shows a balance** — `Payment.tsx` treats a non-billable re-X-ray as zero (was: a phantom X-ray "Balance due" if the page were ever reached). (#536.)
- **Checker no longer hides fetch failures** — `AppChecker` surfaces load/lookup errors instead of a false "Queue is clear." (#371.)

## v1.6.71 — 2026-06-27 (Audit fixes batch 3: phantom balance, serving lanes, queue-jump)

- **No more phantom "Balance to pay"** — a *requested* (not-yet-priced) charge no longer shows the customer a balance or surfaces the order under "Needs action"; only a **billed** charge counts (`joPayment`/`types` + the `has_open_supplement` trigger, migration **0182**, audit #261).
- **Checker serving numbers show their lane** — **P-1** (priority), **R-1** (re-X-ray), **#1** (regular queue) instead of three identical "#1"s; `ServiceLine` + labels gained the priority/re-X-ray lanes. (#349.)
- **Retired the manual queue-jump** — `restore_serving_number` dropped + its admin "Restore #" button removed; jumping the line is now **only** the admin-approved priority lane. (#382.)

## v1.6.70 — 2026-06-27 (Audit fixes batch 2: completion gate, re-X-ray guards, fuel RLS)

- **Completion no longer errors on a coexisting unpaid charge** — `jo_ready_to_complete` + `enforce_two_gate_complete` now both gate on **billed-unpaid** supplements only (0175 had dropped the clause from one but not the other, so confirming the last X-ray / a supplement payment on an order with another unpaid charge rolled back with a check-violation). A *requested* (un-priced) charge never blocks completion. (Migration **0181**, audit #283.)
- **Re-X-ray can't be X-rayed before admin approval** — `record_van_xray` blocks an unapproved re-X-ray child (was: a checker could complete it, then approval knocked it back to processing). (#360.)
- **Customer can't cancel an internal re-X-ray** — `cancel_job_order` refuses re-X-ray children (was UI-only hidden — backend-enforced now). (#258.)
- **Fuel pricing no longer readable by anon** — `fuel_setting_at`/`fuel_rate_at` revoked from public/anon (kept for the authenticated reporting views); `jo_ready_to_complete` revoked as an internal oracle. (#294/#415.)
- **Dashboard "Active orders" excludes hidden re-X-ray children** — the count now matches the list. (#272.)

## v1.6.69 — 2026-06-27 (Audit fixes: vessel-tour copy + lifecycle doc)

- **Removed the misleading "tick vessel not listed" tour step** — the New Job Order tour now says to contact KTC customer service (or ask Lara) to add an unlisted vessel, matching the real flow (the manual-entry control was removed long ago). (Audit #7.)
- **Doc-debt** — the Job Order Lifecycle "source of truth" doc now carries a dated correction note flagging the ADR-0035 ops overhaul (verify-only pending, auto-complete, priority/re-X-ray lanes, ops→cashier billing, invoice-gated payment); a full step rewrite is a pending `/wrap`.

## v1.6.68 — 2026-06-27 (Audit fixes: priority served ahead + vessel dedup data-loss)

- **Priority lane is now actually served ahead** — both the Checker PWA and the desktop Checker sort the X-ray queue by **lane (priority → regular → re-X-ray) then serving number**, instead of the raw per-lane number (which made `P-1` tie `Q-1`); the desktop Checker now loads serving data too. (Audit #9 — closes the phase-4 follow-up.)
- **Vessel dedup no longer destroys distinct calls** — `dedup_vessel_schedule` (migration **0180**) now matches the same physical call (`actual_arrival`) before collapsing a date→week key-flip duplicate, so a genuinely distinct call of the same vessel+voyage survives. (Audit #8.)

## v1.6.67 — 2026-06-27 (Audit fixes: financial-integrity + notification + maker-checker holes)

Fixes for high-severity findings from the whole-app audit (several introduced by the ADR-0035 overhaul):
- **Walk-in payment bypassed the invoice gate** — `record_office_payment` now also requires the ERP + BIR invoice before confirming a base payment (migration **0178**); the **cashier station** can now record the invoice on a processing order with a pending proof (it was deadlocked after 0177).
- **A cancelled release could be revived to "paid"** — `confirm_release_payment` now only confirms a `payable` release (0178).
- **Staff-only internal notes pinged the customer** — `notify_jo_comment` skips `staff_only` comments (0178).
- **Re-X-ray children leaked customer notifications + could be force-accepted** past the approve gate — status/serving notifications suppressed for re-X-ray; `staff_transition_order` + the Approve & process button block re-X-ray children (use Approve re-X-ray) (0178).
- **Security-invariant gaps** — `guard_job_order_consignee_approved` (0169) + `complete_on_service_done` (0172) were definer trigger functions missing their EXECUTE revoke; both revoked (0178/**0179**). `check-security-invariants` is green again.

## v1.6.66 — 2026-06-27 (Follow-up: hide internal re-X-ray + un-billed charges from customers)

- **Re-X-ray child orders** (internal KTC ops) are hidden from the customer's **My Job Orders** — no more phantom `JO-…A` submitted order.
- **Un-billed (requested) charges** no longer show on the customer's **Payment** page as a null-amount payable — only cashier-billed charges appear.

## v1.6.65 — 2026-06-27 (Ops overhaul phases 6–7 — billing flow · ADR-0035 complete)

- **Phase 6 — additional-service request (ops → cashier).** Operations now **Request** an extra charge (label only); the **cashier Bills** it (sets the amount → payable + notifies the customer). Direct add-and-bill is re-gated from operations to the cashier's money lane. New `request_supplement` (ops) + `bill_supplement` (cashier) RPCs/permissions; supplements carry a `bill_status` (requested / billed). Migration **0176**.
- **Phase 7 — payment confirm requires the invoice.** The cashier can't confirm the **base** payment until the **ERP service invoice + BIR pad serial** are on file — recording them is the prerequisite. The invoice can now be recorded on any live order (not just completed), so the flow is pay → record invoice → confirm → auto-complete. Nothing reads "paid" without an official invoice. Migration **0177**.
- **ADR-0035 complete** — all seven phases (roles, auto-complete, queue, priority, re-X-ray, billing request, invoice gate) shipped.

## v1.6.64 — 2026-06-27 (Ops overhaul phase 5 — re-X-ray lane)

- A blurred X-ray on a **completed** order can now be **re-X-rayed**: checker/ops hit **Request re-X-ray** → admin **Approve** (new `request_rexray` + `approve_rexray` permissions). It creates a **child job order** — same containers, a **suffixed number** (`JO-000001A`, `B`…) — that rides its own **re-X-ray serving lane** and completes on services-done (it's **free**; a `rexray_billable` flag sits in the schema for future paid re-X-rays). Cap-exempt (KTC-initiated). Migration **0175**. ADR-0035 phase 5. *(Follow-ups: customer-side visibility of the child + checker-app lane display.)*

## v1.6.63 — 2026-06-27 (Ops overhaul phase 4 — priority lane)

- A job order can now be **prioritised** into a separate **priority lane** (`P-n`) served ahead of the regular queue. **Requested by CS / operations → approved by admin** (new `request_priority` + `approve_priority` permissions). On grant, the order leaves the regular queue and takes a priority number; the admin order shows a **★ Priority** chip and a Request / Approve / Deny action. Migration **0174** (priority_status column, lane-aware `assign_serving_numbers`, request/review RPCs). This is now the only way to jump the line. ADR-0035 phase 4. *(Checker-app "priority first" queue ordering is a follow-up display tweak.)*

## v1.6.62 — 2026-06-27 (Ops overhaul phase 3 — automatic queue lifecycle)

- The serving-number queue now behaves like a real "now serving" line (migration **0173**). Active line = `submitted` + `processing`; an order pulled out (**on hold / rejected / cancelled / completed**) vacates its number (→ 0, off the board); coming back gets a **new number at the tail** (orders already in line keep their place). Jumping the line is now only via the priority lane (phase 4). ADR-0035 phase 3.

## v1.6.61 — 2026-06-27 (Ops overhaul phase 2 — completion fully automatic)

- Job orders now **auto-complete regardless of which gate clears last.** Auto-complete already fired when the base/RPS payment was confirmed last; this adds the mirror — when payment is already confirmed and the **last service is marked done**, the order completes automatically (migration **0172**, trigger on `service_completions`). The manual "Mark completed" button is now a rarely-hit fallback. ADR-0035 phase 2.

## v1.6.60 — 2026-06-27 (Role separation-of-duties pass)

- After a role-permission review: **order approval (accept / hold / reject) stays with operations + admin** — pulled `accept_orders` + `hold_reject_orders` back off **CSR** (a CSR can file on behalf *and* approve = a maker-checker gap), keeping CSR to intake + comms. **Cashier trimmed to money-only** — dropped `hold_reject_orders` + `complete_orders` (the cashier rejects the payment *proof*, not the operational order; completion is becoming automatic anyway). Migration **0171**; supersedes the CSR grant from v1.6.59 and revises ADR-0035 phase 1.

## v1.6.59 — 2026-06-27 (Ops overhaul phase 1 — CSR can approve / hold / reject)

- **CSR (customer service)** now has **Approve & process / Hold for info / Reject** on job orders (alongside admin + operations), via a `role_permissions` grant (migration **0170**). First of the seven-phase job-order ops overhaul — design on record in **ADR-0035** (auto-queue, priority + re-X-ray lanes, auto-complete, invoice-gated payment).

## v1.6.58 — 2026-06-27 (Admin Actions menu no longer clipped on mobile)

- The job-order **Actions** dropdown (admin / ops) is now portaled to the page body with fixed positioning, so it's no longer clipped by the scrollable order-detail panel on mobile. It clamps to the viewport, flips above the button when there's no room below, scrolls if the action list is long, and closes on scroll/resize.

## v1.6.57 — 2026-06-27 (JO consignee gate + filing cleanup)

- **Consignee-approved enforced at filing (migration 0169)** — a Job Order's consignee must be `approved`. `guard_job_order_consignee_approved` blocks attaching a pending/needs_info/rejected consignee on insert (or when the consignee is changed on edit); existing orders are grandfathered. One backstop covering `file_job_order` / `admin_file_job_order` / `update_job_order` and any direct path — the pickers already hid unapproved consignees, now the DB enforces it too.
- **New Job Order form tidy** — removed the dead "you can file now, held until verified" notice and the unreachable not-approved label branches (pending brokers are verify-only since 0163, so they never reach this form).

## v1.6.56 — 2026-06-27 (Resubmit synced to the full CIS)

- When KTC flags a consignee **"needs info"**, the customer's **Edit & resubmit** form (My Requests) now includes the full CIS — customer/registered name, business address line 2, tel, mobile, email — not just name/address/TIN/2303. So *"please add more information"* can ask for any field and the customer can actually provide it. Migration **0168** extends `resubmit_consignee` to match `request_consignee` (old 6-arg overload dropped; single 11-arg, verified).

## v1.6.55 — 2026-06-27 (Consignee 2303 rule — hard-enforced on every path)

- **Approval gate restored (migration 0167)** — a consignee can no longer be **approved** without a business address, TIN, and BIR 2303 on file. This re-enforces the DB guard that migration 0120 had relaxed to a soft warning, and is the single backstop covering **every** creation path (admin add form, CSV import, customer request, resubmit) — they all land `pending` and must pass approval. The already-approved 1,653 master consignees are **grandfathered** (the guard fires only on the transition *into* approved, so they stay editable).
- **Admin "Add consignee"** now requires address + TIN + the 2303 document (was name-only), matching the customer self-service form.
- **"Approve all pending"** now approves only **complete** consignees and reports the real count — incomplete ones are skipped (they can't pass the guard) rather than failing the whole batch.

## v1.6.54 — 2026-06-27 (Consignees: incomplete-info flag)

- Admin Consignees rows now also show an **"incomplete info"** badge when a consignee is missing its business address or TIN — shown on **all** statuses, so the 1,653 approved master-list consignees (all currently doc-less + info-incomplete) are clearly flagged for staff to chase. Pairs with the "2303 on file / needs documents" badge + the "Needs documents" filter. (The unused `needs address/TIN/2303` label it replaced is removed.)

## v1.6.53 — 2026-06-27 (Consignee approval gate + full CIS capture)

- **Approval gate** — a customer-requested consignee is now **pending** and cannot be used to file until KTC approves it. The Job Order + Releases pickers only offer **approved** consignees (no more "selectable but unverified" limbo), mirroring the ID-verification gate.
- **Full Customer Information Sheet online** — the request form now captures the complete CIS (trade name, customer/registered name, business address ×2, TIN/VAT, tel, mobile, email) plus BIR 2303 (required) / 2307 (optional). On submit it creates the consignee **pending KTC approval** (not auto-selected) and offers **Print filled CIS** + **Print blank CIS** — fill online or on paper. Migration **0166** adds the columns + extends `request_consignee`.
- **Admin Consignees — documents at a glance** — every row shows a **"2303 on file ✓" / "needs documents"** badge, plus a new **Needs documents** filter, so staff see who still owes their BIR docs regardless of approval state.

## v1.6.52 — 2026-06-27 (Notifications: Clear read)

- The notification bell now has a **"Clear read"** action next to "Mark all read" — it deletes your already-read notifications and keeps the unread ones. Backed by a new security-definer RPC `clear_read_notifications()` (migration **0165**), scoped to your own rows.

## v1.6.51 — 2026-06-27 (Lara gets a face + typing; branded logo-fill loader)

- **Lara avatar:** the chat launcher + header now show a friendly young-woman face (SVG generated with codex/GPT, theme-coloured) instead of the generic 💬 chat bubble — she reads as a person, not a box.
- **Lara typing:** a "typing…" indicator (three bouncing dots) shows for ~1.4s before each deterministic reply, so the chat feels conversational. Action replies still show their own "Please wait…".
- **Loader:** the route loader is now the **KTC logo filling with colour** bottom-to-top (a CSS mask of the logo with a rising accent fill) — replaces the separate progress bar.

## v1.6.50 — 2026-06-27 (Home cleanup + walkthrough video into the Quick tour, now MP4)

- **Home:** removed the yard photo banner; the welcome tile is now a proper **opaque glass tile** (was 35% transparent — content was washed out).
- **Walkthrough video** moved OUT of Home / Menu / Manual and **into the Quick tour** — its last step ("Replay anytime") has a "Watch video walkthrough" button. The `WalkthroughProvider` now wraps `TourProvider` so the Tour can open it.
- Converted the video to **MP4** (3 MB, plays on iPhones, ~3× faster to load than the 8 MB webm).
- **Quick tour:** dropped the redundant "Release / Pull-out" step (it's in the Menu anyway).
- *Still to do: re-record a tighter ~45s cut + add music.*

## v1.6.49 — 2026-06-27 (Calculator + Lara Tagalog copy sweep)

- Applied the preferred English business terms to the **Rate Calculator** + **Lara (chat)** Tagalog: **"charges"** (not *singil*), **i-estimate** for actions / **"Estimate"** for the step heading, and "rate"/"rates" (already English).
- **Verb forms kept Tagalog** where natural (e.g. *sinisingil* = "is charged", *sisingilin* = "will be charged") — not a blind find-replace.
- **"Contact us"** now stays "Contact us" in Filipino too (was "Makipag-ugnayan").

## v1.6.48 — 2026-06-27 (Landing wrap-up: FIL overflow, contact label, agreement back-to-top, Taglish copy)

- **Fixed the Tagalog overflow** — the contact line no longer forces the card wider than the phone screen (removed `white-space: nowrap`; it wraps instead). FIL mobile now fits exactly (414 = 414, no cut-off).
- **"Need help?" → "Contact us"** (drops "Call"; reads "Contact us · *phone* · Email us"). FIL: "Makipag-ugnayan".
- **Agreement (Privacy & Terms):** added **"← Back · ↑ Back to top"** at the bottom of the document.
- **Tagalog copy** now uses the English business terms preferred: "charges" (not "singil"), **i-assess**, **i-estimate**, "rate" (already English on the landing), and **"Secure"** (not "Ligtas") in the footer + login orientation.

## v1.6.47 — 2026-06-27 (Walkthrough video: clean title-card intro)

- Re-recorded the walkthrough so it **opens on a branded title card**, not the sign-in replay — the login/setup screens are hidden from the very first frame (injected cover), so the demo starts clean.

## v1.6.46 — 2026-06-27 (Video walkthrough embedded in the app)

- New **"Watch walkthrough"** — a short captioned video tour of the customer portal — opens in a modal player. It complements the interactive **Quick tour** (take the tour hands-on, or watch the video).
- Placed in three spots, as chosen: the **Menu** (beside Quick tour), the **Customer Manual**, and a **card on Home**.
- Asset: `public/customer-walkthrough.webm` (its first frame is the title card, so it doubles as the poster). The player is structured to take an **MP4 source** too — to be added for older iOS/Safari (needs ffmpeg; blocked on this arm64 machine for now).

## v1.6.45 — 2026-06-27 (Sign-in declutter + glass + mobile letterhead fixes)

- Removed the "Create an account to begin accreditation." box from the **sign-in** form (it's on the menu, and the "Create one" toggle is at the bottom).
- Bumped `--glass` opacity (light `0.6 → 0.7`, dark `0.62 → 0.72`) so the cards read a bit more solid over the terminal photo (app-wide).
- **Mobile letterhead:** logo no longer stretches (the stacked brand column was forcing it full-width — now `align-items: flex-start`); "Need help? … Email us" stays on one line (11.5px + `nowrap`); and the top photo band is tighter (`8vh → 3vh`) so the card sits higher.

## v1.6.44 — 2026-06-27 (Menu: Google moved up + centered; forms decluttered)

- **"Continue with Google" now lives on the menu (`/`)** alongside Sign in / Create an account (with an "or" divider), and is **removed from the sign-in / create-account forms** — so the three ways in are all on the menu, centered as one group in the right column.
- Removed the redundant **"KTC Online Portal — Container Terminal Services"** subtitle from the forms (the left intro already carries it).

## v1.6.43 — 2026-06-27 (Landing + sign-in + create-account unified into one shell)

The public pages are now **one card**. A shared `PublicShell` (React Router layout) renders the top letterhead + the left intro/services + the footer **once** — they persist across `/`, `/login`, `/register` (never re-mounted); only the **right column swaps** (the Sign in / Create account buttons ↔ the auth form) and fades on navigation. So it reads as one screen you move *within*, not three pages.
- Added a **"← Back to menu"** link on the form (swaps the right column back to the buttons).
- **Phone:** the auth pages are form-focused — the intro/services hide (you just saw them on the landing) so the form is at the top; desktop keeps the intro as the left column.
- The login's entire form logic (captcha, agreement consent, Google sign-in, lockout, mode toggle) is unchanged. The old `Landing.tsx` is superseded by `PublicShell` + `AuthRail` and removed.

## v1.6.42 — 2026-06-27 (Sign-in / create-account fully mirror the landing)

- The auth pages now use the **landing's exact structure**: a **spanning top letterhead** (logo left, address + "Need help?" right) over a **two-column body** ("KTC Online Portal" intro on the left, the form on the right).
- **Left static, right transforms:** switching between Sign in and Create account now changes *only* the right form — the whole left side (letterhead + intro) stays put (it's a state toggle, not a reload).
- **Right-aligned** the address + "Need help?" in the top (was left-of-centre, beside the logo).
- go-live doc: noted the DPO email (`dpo@ktcterminal.com`) on the NPC-registration line.

## v1.6.41 — 2026-06-27 (Branded email wired in)

ImprovMX forwarding is live for `ktcterminal.com` (`dpo@` / `support@` / catch-all → owner's inbox; MX + SPF verified). Wired into the app:
- The **support contact email** is now `support@ktcterminal.com` (the "Email us" target on the public pages + the support desk).
- The **Customer Agreement** now names a proper **dedicated DPO mailbox** `dpo@ktcterminal.com` (privacy / data-protection) and `support@ktcterminal.com` for general questions — closing the earlier "personal-Gmail DPO contact" legal flag **and** the roast's professionalism gap.

## v1.6.40 — 2026-06-27 (Sign-in / create-account match the landing letterhead)

Extracted the landing's letterhead (logo + address + "Need help?") into a shared `PublicBrand` component, now used on the landing **and** the sign-in / create-account pages — so all three read as one family. On the auth pages the letterhead leads the brand panel (desktop) / the card (phone), and the duplicate footer "Need help?" was removed.

## v1.6.39 — 2026-06-27 (Letterhead: address beside the logo, TIN dropped)

Dropped the TIN line from the public letterhead (kept the address) — on landing + sign-in. On **desktop** the address + "Need help?" now sit to the **right of the logo**; on **phone** they stack under it (the address is too long to read beside the logo on a narrow screen). The TIN value stays in `src/lib/org.ts` if it's needed elsewhere later.

## v1.6.38 — 2026-06-27 (Persistent photo backdrop + login letterhead)

- **Sleeker auth transition.** The terminal-photo backdrop is now rendered **once at the app level** (`PublicBackdrop` — a persistent fixed layer behind the routes, shown only on landing / sign-in / create-account) instead of each page mounting its own slideshow. Navigating between them now just **fades the card content over the same photo** — no backdrop re-fade, no page-reload feel. Reuses the existing `RouteFade` for the content fade.
- **Letterhead mirrored on sign-in / create-account.** The registered TIN + address now appear under the logo there too — in the desktop brand panel and under the logo on phone — matching the landing. Extracted into a reusable `OrgInfo` component.

## v1.6.37 — 2026-06-27 (Registered-business letterhead under the logo)

The landing now shows KTC's registration details — **TIN + registered address** — as a small muted letterhead block under the logo, with **"Need help?"** right below it (moved there from the sign-in rail). A legitimacy/trust signal for a terminal operator. The details live in `src/lib/org.ts` (the name comes from the logo, so the block leads with TIN + address to avoid repeating it).

## v1.6.36 — 2026-06-27 (Footer one line on mobile + plain "Need help?")

- Footer trust line shortened to fit **one line on phone**: "🔒 Secure · SSL-encrypted · Privacy & Terms" (dropped "access" + "connection" filler). Line 2 stays version + copyright.
- "Need help?" reverted from a pill to **plain text** matching the other description text on the page.

## v1.6.35 — 2026-06-27 (Footer 2-line + inline lock + "Need help?" pill)

- Footer tightened to **two lines** with the lock glued **inline** to "Secure access" (it was wrapping above): line 1 = 🔒 Secure access · SSL-encrypted connection · Privacy & Terms; line 2 = version + copyright.
- **"Need help?" is now a single compact pill** — "Need help? · Call [phone] · Email us" — the phone visible/tappable, the email a `mailto:` link (which also keeps the interim gmail address off the page until the branded one is set up). Landing + login.

## v1.6.34 — 2026-06-27 (Footer trust block + 3-line "Need help?")

- **Trust signals on the landing + login footers:** a "🔒 Secure access · SSL-encrypted connection" line, a **Privacy & Terms** link (to the public `/agreement` view), then the version + copyright. Surfaces the encryption we already practice (verified: HTTPS + HSTS + a tight CSP) to logged-out visitors — the roast's "missing trust indicators" point.
- **"Need help?" is now three lines** (Need help? / Call … / Email …) for easier scanning on the public pages.
- Mobile landing still fits one screen (trimmed the photo band 1vh to absorb the added lines).

## v1.6.33 — 2026-06-26 (Landing: secure-access line → footer)

Completes v1.6.32's tidy-up — the landing's "Secure access" line now sits in the footer beside the version + copyright (it had only been moved on the login page; the landing still showed it in the sign-in rail). Removed the now-dead `.ktc-landing__secure` style.

## v1.6.32 — 2026-06-26 (Desktop two-column sign-in / create-account + landing copy)

- **Sign-in and create-account now get the landing's desktop treatment.** On desktop (≥860px) the auth card is a two-column glass card — a brand panel (logo + intro) on the left, the form on the right — over the terminal photo, instead of a phone-sized card floating on a big screen. Phone keeps the single-column card (with the logo on top).
- **Copy tidy-up:** the "Secure access" trust line moved into the footer next to the version + copyright (it was redundant with the brand); the sign-in helper now reads simply "Create an account to begin accreditation." (no staff-account line); and the four landing service descriptions were rewritten to the owner's wording. All EN + TL.

## v1.6.31 — 2026-06-26 (Demo tours refreshed for Lara + the admin work-surface)

The role walkthroughs now showcase the new features: the customer welcome tour gains a **"Meet Lara"** step that spotlights the assistant launcher, and the admin dashboard tour gains a **"Needs your attention"** step for the new drill-down work-surface. Both steps are fully localized (EN + TL). Added `data-tour` hooks on the Lara launcher and the dashboard queue.

## v1.6.30 — 2026-06-26 (Landing one-page mobile + admin work-surface + agreement DPO/NPC)

- **Landing fits one screen on mobile.** Service descriptions collapse into tap-to-expand dropdowns (title + chevron; descriptions stay visible on desktop, which has the room); the photo hero band is slimmer; the lede + access copy are tightened. No more scrolling on phone (verified 414/390-wide).
- **Admin dashboard is now a work surface.** Below the count tiles, a "Needs your attention" section surfaces the actual pending accounts + consignee requests as clickable drill-down rows (with a "View all" link per section + an all-caught-up empty state) — so the dashboard lands you on the queue, not just a scoreboard. (Fixes the roast's P2; the tiles were already clickable.)
- **Customer Agreement (v4 refinement):** the owner is named as the interim Data Protection Officer; the explicit National Privacy Commission references were removed for now (NPC registration deferred + tracked in `docs/go-live-todo.md`).

## v1.6.29 — 2026-06-26 (Login: terminal-photo backdrop carries over)

The sign-in and create-account pages now carry the landing's terminal-photo slideshow as their backdrop (behind the frosted login card) — so tapping "Sign in" or "Create an account" keeps the visual continuity instead of dropping to a plain background. Reuses `HeroSlideshow` + the shared scrim; all existing Login behavior (Google button, disposable-email hint, agreement modal, captcha, lockout) is unchanged.

## v1.6.28 — 2026-06-26 (Landing polish: regular CTAs, fits-one-screen, mobile photo hero)

Owner feedback + the surface roast. The desktop sign-in CTAs were rendering as ~368×160px slabs — the desktop column layout turned the `160px` flex-basis into a button *height*. Fixed:
- **Regular auto-height buttons** (full rail width), and the access panel is centered to kill the ~135px bottom void that stranded the footer.
- **Desktop card fits one screen** — tighter spacing, no scroll.
- **Mobile photo hero band** — the terminal slideshow now runs as a real band across the top of the first viewport (it was collapsing to a ~30px strip behind a full-height card).

## v1.6.27 — 2026-06-26 (Customer Agreement v4 + disposable-email block)

**Customer Agreement → v4.0** — redlined after a PH-legal-framework review (DPA, e-Commerce Act, Civil Code, fairness) caught three blockers, all fixed:
- **Privacy section made truthful** — removed the false NPC-compliance + designated-DPO claims; now a genuine commitment, a real contact, and a promise to appoint a DPO + register with the NPC.
- **Liability cap re-pegged to the Service Invoice** (the Job Order carries no fee, so the old cap was illusory and severability would have left KTC *uncapped*): "the greater of trailing-6-months Service-Invoice charges or ₱100,000."
- **Amendments** now require affirmative re-acceptance for material changes, not passive "continued use."
- Plus version reconciled (2.0/v3 drift → **v4.0**), an authority-to-bind clause, and a Notices clause. Remaining real-world items (NPC/DPO registration, final counsel pass, the ₱100k floor) tracked in `docs/go-live-todo.md`.

**Disposable-email block (`0164`)** — signups from throwaway/temporary email domains are rejected **server-side** in `handle_new_user`, using the full **7,578-domain** maintained blocklist (gmail/outlook/etc. pass; mailinator/etc. blocked). An optional inline hint flags obvious throwaways on the signup form. From the owner's anti-abuse research; the DB trigger is the real wall (the frontend can't bypass it).

## v1.6.26 — 2026-06-26 (Landing: 5-photo hero slideshow + responsive rework)

- **The public landing hero is now a 5-photo auto-advancing slideshow** of the real terminal (crossfade ~5s; pauses on hover and when the tab is hidden; respects `prefers-reduced-motion` → a single static still, with the other four never downloaded). Each slide has a tuned focal point so the cranes / yard / waterline stay in frame across crops.
- **Desktop rework** (≥900px): the hero is now a wide two-column glass card — intro + services on the left, a sign-in rail on the right — so it feels intentional at desktop width instead of a phone-sized tile lost on a big screen.
- **Phone** (<900px): the single-column tile is kept, with the photo's focal point + scrim tuned so the terminal stays well-defined behind the frosted card (text stays AA-legible).
- Dependency-free `HeroSlideshow` component; the 5 slides are <400 KB each; the orphaned single `hero.jpg` is removed.

## v1.6.25 — 2026-06-26 (Pending verify-only lockdown + terminal-photo identity)

**Security — pending accounts locked to verify-only (`0163`).** A customer with `status='pending'` (including any Google self-registration) can now ONLY upload a valid ID, see their status, read the Customer Agreement, manage account basics, and sign out. EVERY business surface — filing orders (`file_job_order` is approved-only), the vessel schedule, the rate/calculator config (`terminal_rates`, `service_rates`, `pricing_settings`), the **consignee master list (1,654 rows)**, and bulletins — is locked behind `broker_is_approved()` at the **RLS layer** (the real wall; the Shell route-gating is UX, and Lara is hidden for pending). Verified: no policy bypass (every `FOR ALL` policy is staff-scoped), approved customers + staff read everything (no lockout), pending read nothing. This closes the self-signup data-exposure surface.

**Identity — real KTC terminal photos.** The public landing now leads with a wide aerial of the terminal (cranes + yard + water) under a dark overlay (headline + CTAs stay crisp); the customer and admin dashboards each carry a slim terminal-photo banner (container rows / gantry cranes) with the data still the hero. Optimized to <400 KB each; the ~290 MB of source originals are gitignored + removed from the repo.

## v1.6.24 — 2026-06-26 (Customer Agreement consent — enforced server-side)

Closes the audit's L1 + L2 (the one go-live gate). Customer Agreement / DPA consent is now enforced in the **database**, not just the UI:
- **No transaction without recorded consent.** `file_job_order` and `open_ticket` — the real SECURITY DEFINER write paths — now refuse to run unless `has_recorded_consent()` is true (the RLS `WITH CHECK` is kept as defense-in-depth, but the gate lives where it actually fires). A naive RLS-only fix would have been bypassed, since those functions bypass RLS.
- **Consent can't be spoofed.** The six consent columns are server-stamped only — a raw client UPDATE is pinned back to the old value by the `customers` guard trigger, gated by a transaction-local `ktc.allow_consent_write` flag that only the consent RPCs set (mirroring the existing `ktc.allow_owner_change` pattern). A column-level REVOKE was rejected as a no-op against the table-level grant.
- **One server-stamped writer.** Every consent path — email/password signup, the pending-customer banner sync, the valid-ID page, and the OAuth finish-registration — now records through `record_agreement_consent` (or `complete_oauth_registration`). Migration `0162`. Zero lockout (the 2 existing customers already have consent).

## v1.6.23 — 2026-06-26 (Audit polish — Lara a11y + view-switch + landing)

Fixes from the scoped post-launch audit (0 critical / 0 high; all medium + low). Mostly accessibility on the new Lara widget:
- **Lara accessibility:** keyboard **focus management** — focus moves into the panel on open, **Escape** closes, and focus **restores to the launcher** on close (non-modal: Tab stays free, per ARIA APG); the transcript is now an **`aria-live` polite region** so screen-reader users hear replies and the ticket confirmation.
- **Lara correctness:** cleared stale free-text on navigation so a **tap-opened ticket no longer carries an unrelated earlier line** to staff (data-quality fix); ticket composer button reads **"Add"** (vs "Send") with a nudge to tap Create; composer font back to **16px** (stops iOS zoom-on-focus).
- **View switchers:** defined the missing **`.ktc-btn-ghost`** class — inactive Cards/Table/Calendar toggles now render as quiet frosted pills, clearly distinct from the active one — plus `aria-pressed`, across Vessels / admin VesselSchedule / Checker.
- **Misc:** declared the missing `--c-h210-60-94` color token (Lara user bubbles + support views tint correctly); public landing now uses a semantic services list + a `<main>` landmark + AA-contrast footer; vessel card date-group header parses dates the same way as the card body (no off-by-one in non-PH timezones).

## v1.6.22 — 2026-06-26 (Lara — customer help assistant)

- **Lara, the customer help assistant** — a floating "Ask Lara" widget on the customer side: a warm, guided, **NO-AI** chatbot (a 93-node decision tree + keyword matcher — zero LLM, zero per-message cost, nothing to "drain"). Six tiles — Orders · Vessel schedule · Rates & payment · Container release · Account & verification · Feedback & concerns — plus a standing "Talk to a person" and an always-on text box. Best practices baked in: buttons-first, "Back to menu" everywhere, a two-strike rule, and a real support-ticket fallback (`open_ticket`) for anything she can't answer (stakeholder concerns — customs / shipping line / logistics — filed as tagged tickets KTC can collate for meetings). Live "track my order" + "view all my orders" lookups (RLS-scoped). Lead-time answers (within 24h; X-Ray office hours 9 AM–5 PM). English + Tagalog. Mounted in the customer Shell only. Design: `docs/lara-chatbot-design.md`.
- Built via an ultracode design pass + an independent code review that caught and fixed a **stale-state track bug** (every lookup after the first returned the previous order) and a **ticket-fallback message-loss bug** before ship — both verified fixed (sequential JO lookups now each return the correct order).
- Deferred (noted in docs): release pre-advise/advance-notice; the document-verification guide content; an optional open-ended AI fallback (needs an API key).

## v1.6.21 — 2026-06-26 (Continue with Google sign-in)

- **"Continue with Google" on the login screen** — customers can sign in / sign up with their Google account: no password to manage, and the email comes back already verified (so the email-confirmation step is skipped). Built on Supabase OAuth.
- **A one-time "Finish registration" step for Google sign-ups** — Google gives us the name + email but not the two things the email/password form collects, so a new Google customer is routed once to provide their **contact number** and **Customer Agreement consent** before the portal opens. Recorded server-side via a new `complete_oauth_registration` RPC (`0161`). The gate is **scoped to Google-provider users with no recorded consent**, so email/password customers are completely unaffected (no extra read, no gate). The normal pending → ID-upload → approval flow is unchanged. English + Tagalog.

**Owner action to turn it on:** enable the **Google provider** in the Supabase project — create a Google Cloud OAuth app and paste its client ID + secret into Supabase → Authentication → Providers → Google (add the redirect URL Supabase shows). Until then the button returns a "provider not enabled" error. Please run the full flow once after enabling, since the OAuth redirect can't be tested without that config.

## v1.6.20 — 2026-06-26 (Vessel schedule: card browse)

- **Vessel Schedule gains a card-based "Cards" view (now the default)** — each vessel call renders as a scannable card with the **Last Free Day as the highlighted hero fact** (plus Arrival, Finish Discharging, Berth, shipping line, visit code, and status), grouped under date headers ("not yet arrived" calls float to the top). Mobile-first — cards stack with no horizontal scroll, versus the dense Table view (still available, alongside Calendar). Adapted from the PickleHub browse pattern (the slot-booking model's "Phase 0" restyle — actual time-slot booking is deferred). English + Tagalog. Verified rendering with an injected customer session.

## v1.6.19 — 2026-06-26 (UX sweep: first-run setup, page transitions, public-gate polish)

A multi-part UX pass — designed and reconciled via a multi-agent workflow, then put through a four-angle code review (line-by-line, removed-behavior, cross-file, conventions) whose findings were all fixed and visually verified before ship.

- **One first-run Setup popup** — language + notifications fold into a single step shown once per account after sign-in, replacing the stacked language gate + separate push prompt; the demo tour now follows it (gated on `setupDone`) and stays skippable. A session-local dismiss guarantees the modal can never trap a user if a `localStorage` write fails; the push opt-in is gated to logged-in only and re-fires on login.
- **Branded page transitions** — a KTC-logo route loader (logo + animated progress bar) replaces the plain "Loading…" fallback; a gentle opacity fade plays on each navigation, replayed by reflow (not a React key) so in-page state survives param navigation, with the viewport-height chain preserved so the public pages stay centered.
- **Public-gate polish** — removed the Customer Information Sheet + Customer Agreement links from the landing/login (company materials, not for public exposure); reframed copy from "customs brokers" to **customers / consignees**; a "Need help?" line surfaces the real support phone/email (new `0160` migration — an anon SELECT policy on `support_contact` scoped to phone/email only, with RLS explicitly enabled); a lock/secure-access cue near the CTAs; primary-button weight bumped to 700 for WCAG AA contrast.
- **Consignees admin search** now also matches on address.
- English + Tagalog throughout; `index.html` meta description synced to the new framing.

**Owner action:** seed `support_contact.phone` / `email` in admin Settings, or the "Need help?" line stays hidden by design. (Now-unused `LanguageGate.tsx` / `PushPrompt.tsx` left in place — deletion is owner-only.)

## v1.6.18 — 2026-06-26 (Public landing page)

- **Public landing page at `/`** — a signed-out visitor now sees an orientation landing (what the portal is, who it is for, the four service areas as the hero, and two clear paths in: **Sign in** / **Create an account**) instead of being bounced straight to a bare login. A signed-in session still goes directly to its role landing — no landing detour. **No forced "accept" gate** (legal consent stays at sign-up, where it belongs). New `src/pages/Landing.tsx`; `/` now routes through a `RootGate` (logged-out → Landing, logged-in → app). English + Tagalog. Matches the app's glass identity with the services as the content hero. Also gives the public URL a real page to render (so a link/preview — or an external audit bot — sees the portal, not the CAPTCHA wall).

## v1.6.17 — 2026-06-25 (Login orientation + page metadata)

- **Page metadata + Open Graph** (`index.html`) — added a `<meta name="description">`, Open Graph, and Twitter-card tags so the URL renders a professional link-preview when shared (email/Viber/chat), and search snippets read sensibly. (Prompted by a third-party "landing page" audit that flagged the empty meta description.)
- **Login orientation block** — the sign-in view now opens with a short note explaining what the portal is, who it is for (accredited customs brokers + KTC staff), how to begin accreditation (Create an account), and where to get help with access (KTC customer service / office) — instead of a bare login. Addresses the "missing onboarding context" gap. English + Tagalog. No fabricated contact number (KTC's live contact details remain admin-configured via `support_contact`).

## v1.6.16 — 2026-06-25 (Formal English completes app-wide coverage)

- **Closed the formal-English gap on the 226 newest strings** — the v1.6.14 pass was keyed off the Tagalog map, so the strings that had no Tagalog (release/supplement desk, bulletin, JO lifecycle) had been translated to Tagalog (v1.6.15) but still showed their raw, sometimes-casual English. Added 77 formal overrides for them (`enSimple` now 379 entries), so the formal register is now truly app-wide. Append-only; placeholder/whitespace-validated; build clean.

## v1.6.15 — 2026-06-25 (Tagalog for previously-untranslated strings)

- **Tagalog coverage for the strings that fell back to English** — 174 new entries appended to `src/lib/translations.ts` (tl now ~1,469 keys), covering the newest admin/customer surfaces (release / pull-out desk, additional-charge supplements, bulletin board, JO lifecycle). House style preserved: conversational Taglish with industry terms in English (Job Order, container, DO/BL, OR, RPS, BIR…), a courteous "Paki-/Mangyaring" register to match the formal English pass. Placeholders/glyphs validated; append-only (existing entries untouched). Owner reviews wording before go-live.

## v1.6.14 — 2026-06-25 (Formal English copy pass + staff label fix)

- **English UI copy re-toned to a formal, professional, courteous register** — 302 strings overridden via the `enSimple` layer in `src/lib/translations-en.ts` (no contractions, courteous "Please", professional word choice), repurposing that map from its former "simplified/friendly" intent. Done entirely through the override layer, so **no `t()` call sites or keys changed** and the Tagalog map stays valid; placeholders and glyphs preserved. (Generated app-wide, then validated — placeholder/whitespace-safe; a second polish pass may follow.)
- **Staff role label fix** (`Settings.tsx`) — the "Current staff" list showed **CSR** (and would show **purchaser**) as "Admin"; the label map now renders each role correctly. Closes the tracked cosmetic nit.

## v1.6.13 — 2026-06-25 (Release desk: hold/reject reason now server-enforced)

- **Closed ST05 Defect D-01 (`0159`):** the release-desk RPCs `verify_release_order`, `confirm_release_payment`, and `confirm_release_supplement_payment` now **RAISE on a blank hold/reject reason** (on the `p_ok = false` branch), mirroring the JO side's `hold_job_order` guard. Before, a blank reason was silently stored as NULL — the UI disabled the buttons, but a scripted client could hold/reject a customer's release with no explanation. Backend-only (defense-in-depth); the approve branch and the frontend are unchanged.

## v1.6.12 — 2026-06-23 (My Job Orders: "Cleared for release" badge)

- Added a green **"✓ Cleared for release"** badge (on the card + detail modal) that lights up only when **both gates converge** — all services done **and** payment confirmed — derived from `releaseState()` (the two-gate model), never stored.

## v1.6.11 — 2026-06-23 (My Job Orders card shows both statuses)

- **Card header shows BOTH the operational status and the payment (Balance/Paid) pill** — an order is "cleared for release" only when both gates are met (services done + payment confirmed), so both belong together. (Reverts the card → ops-only change.)

## v1.6.10 — 2026-06-23 (My Job Orders: status split — ops on card, payment on list)

- **List rows** gain a compact **Balance / Paid** accounting pill (before the count badge): `C# · consignee · Balance/Paid · [count]`.
- **Card header** now shows the **operational status only** (the payment pill moved off the card — it's on the list rows, and both still show in the detail modal).

## v1.6.9 — 2026-06-23 (My Job Orders: one-line list rows)

- **List view is now a true one-liner:** **C-number · consignee name · a count badge** (the container-van count). The date moved off the line (still on the card + in the detail modal).

## v1.6.8 — 2026-06-23 (My Job Orders: consignee name only, label-free card)

- **Consignee shows the name only** (the `CN-#####` code is hidden) across the card, list, and detail modal.
- **Card body is now label-free** — just the values stacked (consignee name · vessel & voyage · # of container vans) under the JO# / status / payment / date header.

## v1.6.7 — 2026-06-23 (My Job Orders: distinct card vs list, batch gone everywhere)

- **Card and list views are now distinct.** **Card:** header row = JO# · status · payment · date, then a stacked **Consignee / Vessel & Voyage / # of containers**. **List:** minimal stacked items — **C-number · date**, then **Consignee**, then **# of vans**.
- **Batch chip removed everywhere** in My Job Orders (card, list, and the detail modal) — the date already conveys it.
- Container count relabeled **"N container vans"** (was "N cont.").

## v1.6.6 — 2026-06-23 (My Job Orders: wider column, drop redundant batch pill)

- **My Job Orders page widened** (760 → 960 column via a new `Shell wide` option) so the cards have more room.
- **Removed the "Today/Yesterday" batch chip from the card view** — the filing date is already shown right beside it, so the pill was redundant. (List view keeps its labeled Batch column.)

## v1.6.5 — 2026-06-23 (vessel is dropdown-only everywhere)

- **Removed the "vessel not listed — enter manually" escape hatch app-wide** — the customer **edit-order** form (`EditJobOrderForm`) and the admin **file-on-behalf** form (`NewJobOrder`) are now **dropdown-only** (vessel is schedule-driven). If a vessel isn't listed, customers call KTC customer service and ops add it to the schedule first. (The customer filing form + on-hold resubmit were already dropdown-only.) Ops manual updated.

## v1.6.4 — 2026-06-23 (consignee list polish + clickable detail)

- **Admin consignee list polished + clickable:** rows are now clean, scannable cards (code · name + "customer-requested" chip + a "needs docs" hint + TIN preview + status pill). Clicking a row opens a **detail modal** showing the same fields the customer fills when requesting a consignee — **business address, TIN / VAT Reg #, BIR 2303 (view), BIR 2307 (view)** — plus status, note, dates, the **requester's name + email** (for customer-requested ones), and **Print CIS**. The **Approve / Needs info / Reject / Edit / Delete** actions moved into the modal (review the documents + details together before deciding); "Approve all pending" bulk bar retained.

## v1.6.3 — 2026-06-23 (vessel de-dup + compact admin JO tiles)

- **Vessel list de-duplicated (`0158`):** the sync derives `vessel_visit` as `<name> <voyage> <week-or-arrival-date>`, so when ops filled the sheet's week column for a row first synced without it, the key flipped (`…2026-06-21` → `…W26`) and a **second row** was inserted for the same visit — the duplicate entries. Migration collapses existing dupes (keep newest) and adds a trigger enforcing **one row per (vessel_name, voyage_number)** on every insert/update — duplicates can't recur regardless of key format.
- **Compact admin job-order tiles:** the admin list now shows compact, scannable tiles (JO# · status · balance pill · ERP chip · customer/consignee · a few key chips); **clicking a tile opens a detail modal** with the full order (containers, supplements, release tracks, notes, timeline) and all actions behind their gates. The Cards/List toggle is retained.

## v1.6.2 — 2026-06-23 (Settings: tabs + storage editor polish)

- **Settings is now tabbed** — the long scroll is grouped into **Pricing & tariff · Operations · Access & staff · System** (Language stays pinned on top), so each category is its own short page.
- **Storage tariff editor** restyled to a clean table (day-band columns × 20ft/40ft rows) using the app's standard input/label styling, mirroring the source rate sheet.

## v1.6.1 — 2026-06-23 (rate calculator: per-service granularity + tiered foreign storage)

### Terminal tariff / rate calculator (migration `0157`) — decision in [ADR-0027](docs/adr/0027-per-service-rate-granularity-and-tiered-foreign-storage.md)
- **Per-service rate granularity:** each terminal service (arrastre / wharfage / LoLo / weighing) configures which conditions its rate varies by — any subset of origin / size / fill / kind, or **uniform**. The Settings editor shows only the inputs for the ticked conditions and **fans the value out** to the underlying `terminal_rates` cells, so the calculator's full-key lookup is unchanged. `terminal_rate_config` seeded from the live data: arrastre = origin×size×fill, weighing/wharfage = size, LoLo = uniform. Existing rates were normalized to each service's granularity.
- **Tiered foreign storage (`storage_tiers`):** foreign storage is a **progressive per-day band tariff** per trade direction (Import / Export / Transhipment) × size, charged **cumulatively** after the line's free days (each band's width from its day range, escalating). **Domestic** storage stays a flat per-day rate by size. The calculator computes the cumulative tiered total; **empty** containers use the laden rates. A dedicated storage editor in Settings edits the domestic flat rates + the foreign band rates.
- **Transhipment** added as a foreign trade option in the calculator (with its own storage bands); domestic stays Inbound/Outbound only.

## v1.6.0 — 2026-06-23 (JO lifecycle overhaul, dual-view lists, unified payment, fee + terminology cleanups)

### Job-order lifecycle, payments & UX overhaul (migrations `0151`–`0156`) — decision in [ADR-0026](docs/adr/0026-terminal-reject-field-targeted-needs-info-and-cancel-cascades.md)
- **Vessel is ops-only:** removed the customer "request a vessel" surfaces (My Requests section + resubmit modal + `vessel_*` bell routing); the JO form now just reads *"If the vessel isn't listed here, please call KTC customer service for updates."* Ops keeps the vessel-request review panel.
- **Serving number retired for customers (`0151`):** dropped the `serving_numbers_notify` trigger so customers / CSR no longer get a "Serving number #N" notification (copy scrubbed to batch + aging). The **ops X-ray queue keeps its number**.
- **Reject is terminal; on-hold is field-targeted (`0154`):** a rejected JO is closed (no resubmit) with the reason shown; an on-hold JO now carries `needs_fields` — staff tick exactly which fields (consignee / entry / vessel / containers) the customer must re-enter, and only those unlock on resubmit (`hold_job_order` + `resubmit_needs_info`).
- **Reject/suspend cascades:** rejecting a **consignee** (`0152`) or suspending/rejecting a **customer** (`0153`) now cancels their open job orders with a reason — **except** orders already paid or invoiced (left for manual handling).
- **Unified payment pill:** one **"Balance to pay" / "Paid"** indicator (base + RPS + every supplement) replaces the scattered payment chips; the pay button reads **"Balances"**. Additional charges are now a **dropdown of admin-seeded types** (`additional_charge_types`, `0155`) with an editable amount, managed in Settings.
- **Dual-view JO lists:** both the customer (`MyJobOrders`) and admin (`AllJobOrders`) lists gain a **Cards / List toggle** — zoned cards + a ⋯ actions menu on the admin side, replacing the "wall of text".
- **Admin & print fee merged (`0156`):** the two flat fees become one **"Admin & print fee"** value.
- **Trade terminology + origin pill:** foreign cargo shows **Import / Export**, domestic shows **Inbound / Outbound**; a colour-coded **Foreign / Domestic** pill replaces the plain text in the calculator + tariff editor.
- **Footer trimmed:** the Customer Information Sheet link is removed (still available as "Print CIS" in the consignee flow); the Customer Agreement moved into the User Manual.

---

The work below also ships under v1.6.0 — it was already live on `main` / Vercel under the v1.5.0 banner (new commit hashes, `APP_VERSION` only now bumped):

### Customer-requested consignees & vessels + "needs info" loop (migrations `0132`, `0137`–`0139`)
- **Request a consignee** (`request_consignee`, `0132`): a customer who can't find their consignee files a new one — name + **business address + TIN** (compulsory `0139`) + **BIR 2303** (required) / 2307 (optional). Created as a **pending** consignee on the existing approval machine (`0008`/`0120`) and **usable immediately to file** (file-now; KTC verifies the BIR docs in parallel). Approve/reject in the existing `/admin/consignees`; the requester is notified.
- **Request a vessel** (`request_vessel`, `0137`): mirrors the consignee flow from a modal — an unlisted vessel becomes a **pending** request at submit (the `0068` JO-insert trigger still dedupes); the customer immediately sees it tagged "pending approval".
- **"Needs more info" review state** (`0138`): reviewers tag a request `needs_info` + note instead of a hard approve/reject; the requester is notified and can **edit & resubmit in-app** (→ `pending`) — recoverable, unlike `rejected`. Consignee review = admin + CSR (new permission **`review_consignee_requests`**); vessel review = ops/admin (`manage_vessel_schedule`). New customer **My Requests** view + admin **dashboard pending tile**.
- **Vessel +1-day allowance** (`0139`): the schedule keeps a vessel one day past its last free day before it drops out of the picker.

### Customer Information Sheet = consignee accreditation (migration `0133`, reverted by `0136`)
- The CIS-with-documents **accredits a consignee** (the billed cargo-owner), not a broker account. `0133` first modeled it as a broker-account profile and gated all filing on it; **`0136` tears that gate down** — the customer base is one pool (a broker can also be a consignee), so there is **one CIS, held on the consignee record**, file-now, with missing BIR docs **flagged not blocked**. **Print CIS** renders the *filled* sheet (from consignee data) as a PDF; linked in the customer portal footer.

### Container rate matrix — calculator / JO tariff rework (migration `0141`, 4 phases)
- **`terminal_rates`** (the **calculator's** tariff) gains **fill (empty/full) × kind (dry/reefer)** on top of service/trade/origin/size — re-keyed, all 160 combos seeded (120 new cells start `rate = null`, so the calculator flags **"rate not set"** instead of charging ₱0).
- **`job_order_lines`** gain `size`/`fill`/`kind` (nullable; required in the new filing UI, old rows stay valid); the three line-insert paths persist them per container.
- **Admin tariff editor** gains the empty/full × dry/reefer grid; **calculator redesigned** (merged section, container types, ancillary dropdown). **Live billing is unchanged** — payment still uses `service_rates`; `terminal_rates` is the calculator/quote tariff only.
- **Reverted** the JO container size/fill/kind *filing* UI: the **X-ray JO is operational, not priced**, so per-container pricing dimensions don't belong on it.

### Fuel monitoring — Phase 0 foundations, then DEFERRED (ADR-0025; migrations `0135`, `0140`, `0150`)
- Backend-only **derived-variance fuel module** on the moves spine — `equipment` + two append-only ledgers (`fuel_dispense` OUT / `fuel_delivery` IN), effective-dated `fuel_rates`/`fuel_settings`, interim `move_tally`, 7 derived views, RLS (`view_fuel_reports`/`manage_fuel`/`log_fuel`), audit triggers, CSH-model seeds; a non-admin **`purchaser`** staff role (`0150`). All three migrations applied to prod. **No frontend yet — Phase 1+ deferred; focus returned to the portal / job orders.** Also `0140`: revoke PUBLIC EXECUTE on the `0132` consignee-decision trigger fn (definer-ACL invariant, behaviour-neutral).

### UI polish
- **Modal standardization** — portal modals render into `<body>` (no longer overlap the tabbar/footer); consistent small-screen padding. **Taglish** copy for the new/redesigned screens.

## v1.5.0 — 2026-06-21 (release / pull-out module, ERP link, no-zero number rules, Taglish copy, ktcportal)

### Customer-filed release / pull-out (ADR-0024, migrations `0124`–`0130`)
- **New `release_orders` spine, separate from job orders** (release applies to *every* container; the JO is a service overlay — ADR-0022). Customer flow: file (consignee picker + **BL no.** + **DO/BL** upload to a private `release-docs` bucket) → **CSR documents desk** verifies (`verify_release_docs`; csr/admin) → staff **set charges (once)** → customer **pays** (proof to `payment-slips` + QRPH) → **cashier confirms** (`review_payments`) → **records OR** → `released` for pull-out. Statuses `submitted → docs_verified → payable → paid → released` (+ `on_hold` re-upload loop, `cancelled`). All writes via SECURITY DEFINER RPCs; customers SELECT only their own. This made **online DO verification live**. UI: `src/pages/Releases.tsx` (customer) + `src/admin/Releases.tsx` (two permission-gated desks); nav gains an "any-of-permissions" entry; a dedicated `view_xray_queue` gate (`0123`) makes the X-ray queue an **ops** view (CS can view, cashier can't).
- **Additional charges (set-once base + supplements, `0125`):** the base charge can't be revised once set (financial integrity); missed charges become `release_supplements` lines the customer pays separately, and **the OR is blocked until every supplement is confirmed** (mirrors the JO supplement gate).
- **ERP link (`0126`, combined into Record-OR):** recording captures the physical **BIR OR number** *and* the **ERP (Frappe) service-invoice control no.** in one cashier action — `service_invoice_no` is the link to the ERP document (the app still doesn't issue the official OR; the box can't release without it).
- **Cancel (`0126`):** the owning customer **or** staff (`verify_release_docs`/`review_payments`) can cancel a release only before payment (`submitted|docs_verified|payable|on_hold`) — the previously-dead `cancelled` status is now live.
- **Upfront approval gate:** the customer release page blocks filing for non-`approved` accounts (releases require full approval, unlike JOs which let `pending` file a held order).

### No-zero number rules (migrations `0127`/`0128`)
- **Numbers must be real:** the ERP control no. (release + JO) and pad serial **reject all-zeros**; the release **OR number** is validated (digits, non-zero, was free text); **amounts must be > 0** (`set_release_charges`, JO `add_supplement` — closed a zero-amount supplement gap). The cashier types only the number — a fixed `OR-INV-` prefix + live padded preview; **BIR OR pads to 6 digits, ERP to `OR-INV-00000000` (8), cash/OR only** for now (BI/credit deferred); padding is server-side (`0129`/`0130`). A configurable ERP series window exists but is intentionally left **open** (owner decision).
- **Defaults are empty, never 0:** placeholder rate/fee columns (`service_rates`, `move_rates`, `terminal_rates`, `pricing_settings` admin/print fees) made **nullable** and seeded zeros nulled out (`vat_rate` + real owner-set fees preserved). The frontend (`src/lib/pricing.ts` + Calculator/Payment/Settings/Checker) now treats `null`/≤0 as **"not configured"** — shows a dash, excludes it from totals; never `₱NaN`, never a silent ₱0. Settings inputs are blank-not-zero (clearing one saves NULL). New `scripts/check-i18n.mjs`-style guard not needed here; covered by adversarial review (one MEDIUM fixed pre-apply).

### Bilingual copy — easier Taglish + plainer English
- **English simplified without touching any component:** new `src/lib/translations-en.ts` (`enSimple` override) + a one-line resolver change (`en: enSimple[key] ?? key`; `tl: tl[key] ?? enSimple[key] ?? key`) — the English string stays the t() key, so no call-site refactor.
- **Whole `translations.ts` rewritten** to clear, courteous **professional Taglish** (not deep/formal, not slang; industry terms kept English) + plainer English where jargony, calibrated for a ~Grade-6 reading level. Retired "serving number" copy → daily **Batch + working-hours aging**; stale "broker" → "customer". New **`scripts/check-i18n.mjs`** verifies every value carries the same `{placeholders}` as its key (1,219 entries, 0 mismatches).

### Responsive + demo tours
- **Responsive clipping fixes** (audit verdict: good overall): dense admin-config rows (Settings tariff/free-days/rate + create-staff), the **vessel calendar** now scrolls legibly on phones, the Record-OR editor, the staff-rail title truncation (for longer Tagalog), AccountMenu edge, file-input widths.
- **Demo tours fixed:** the **checker tour now fires** on `/app/checker` (was only wired on the desktop route a checker never visits); an **app-mode ✨ replay button**; retired "serving number / Now serving" copy reworded; a new **Release / Pull-out** step in the customer home tour.

### Project rename + docs
- **Package + repo rename to ktcportal:** removed a dead legacy theme/script, renamed the package + README, scrubbed stale doc refs, and **renamed the GitHub repo** to `jlawrenceang/ktcportal`. The portal is a custom React app.
- **Docs:** per-role + whole-operation **Mermaid flowcharts** (`docs/diagrams/role-and-operation-flows.md`, verified against the live `role_permissions` matrix), **ST04** smoke test (release/pull-out + no-zero), ADR-0024 addendum.

### Verification
- Migrations `0123`–`0131` applied via the Management API + verified. `tsc` + `vite build` clean; `node scripts/check-security-invariants.mjs` OK; `node scripts/check-i18n.mjs` 0 mismatches; **Playwright smoke 14/14 PASS** vs prod (incl. new `/releases` routes). Each substantive piece adversarially reviewed (release base, supplements, ERP/cancel, null-safety, diagrams) + a final consolidated go-live review — **GO** verdict; the edges it flagged were fixed in this release: JO add-charge UI now requires a positive amount, the release set-charges client guard aligned to `> 0`, and **`0131`** blocks cancelling a release that has a paid/pending additional charge (no stranded supplement payment).

## v1.4.0 — 2026-06-16 (vessel monitoring v2 — Google Sheet sync, in-house hiding, busy banner)

### Vessel schedule v2 (migrations `0107`–`0111`, ADR-0023)
- **Operations maintain the vessel schedule in a Google Sheet that syncs to the app** — matching KTC's real "VESSEL MONITORING" sheet (one running list). The `vessel-sync` Edge Function runs **hourly** (pg_cron→pg_net, `0107`) and on-demand via a **"Sync sheet"** button (`trigger_vessel_sync` RPC, `0109`, permission-gated, secret stays server-side). One run does both directions: **pulls** the sheet into `vessel_schedule` and **pushes** the app-computed **Last Free Day** back into a locked mirror column so ops + cashiers see it without opening the portal. All logic is server-side (Google service account, Editor) — **no Apps Script** in the sheet.
- **14-column layout** (`0110`): Shipping Line · Vessel · Voyage · Arrival(date + military-time `1653H`) · Last Discharge(date+time) · **Last Free Day (auto)** · Departure(date+time) · Berth · **Week** · Remarks · Cancelled. Dates stay `date` columns (calendar + last-free-day rely on it); the clock time is a companion text field shown beside it. The sheet has a **visible friendly header over a hidden canonical schema row**, Shipping Line + Cancelled **dropdowns**, and a **locked header block + LFD column** (`scripts/format-vessel-sheet.mjs`).
- **`vessel_visit` is now derived** from vessel name + voyage + a week/arrival discriminator (no longer entered); immutable on in-app edit so a rename can't orphan linked Job Orders.
- **In-house line hiding (`0110`/`0111`):** `shipping_lines.internal` (Gothong/Philcement/New Asia) — those vessels are hidden from customers (backend-enforced SELECT policy, case-insensitive match) and shown to staff via the hardened `current_is_staff()` (`session_alive()` + `aal_satisfied()`). Toggle per line in **Settings**.
- Admin **Vessel Schedule** page reworked for the new fields (date+time display, Week, derived key); per-line "in-house" toggle added to Settings.

### Reliability
- **"Servers are busy" banner:** a wrapped Supabase fetch flags overload (429/502/503/504/network failure) and a debounced global banner shows a friendly notice + a **Refresh** button, instead of a raw error. Reads can retry; a manual reload can't double-submit a filing.

### Verification
- **Pro-tier load test (prod):** 300 customers + full staff roster → ~136 successful filings/sec at 300 in-flight, p50 856ms / p99 5.2s, **zero integrity failures** (no dup serving numbers / JO numbers, cap enforced exactly). Adversarial review of the v2 work fixed the in-house leak, the derived-key collision, and the staff-gate hardening before release.

## v1.3.0 — 2026-06-16 (staff model overhaul — roles, gates, payment/verify floor)

### 2026-06-16 (staff roles, split gates, CSR, multi-owner)
- **Staff roles now five** (+ customer): **admin / operations / cashier / checker / csr** (`customers.staff_role`, guard-protected — owner-only assignment). The owner-tunable **Roles & Gates** matrix (`role_permissions` + `has_permission`) drives every staff capability; restricted roles are NOT `is_admin` and act only through permission-checked SECURITY DEFINER RPCs.
  - **CSR (customer-service desk, migration `0086`):** `file_job_orders` + `manage_support` + view only — relays customer comms, never changes order status. Support inbox is now CSR + Admin/Owner only (removed from Operations). Lands on `/admin/support`.
  - **Operations (migration `0056`):** the floor processing role — accept / complete / hold-reject orders, assess RPS, manage the vessel schedule, file JOs, view; monitors X-ray but no longer confirms it.
- **Split processing gates (migration `0086`):** the single `process_job_orders` gate is split into **`accept_orders` / `hold_reject_orders` / `complete_orders`**, each independently assignable and enforced server-side by the **`staff_transition_order`** RPC (replaced the admin-only direct `job_orders` UPDATE in `AllJobOrders`). Default matrix — admin: all; operations: accept/complete/hold-reject (+ assess_rps, manage_vessel_schedule, process_job_orders, view); cashier: complete/hold-reject (+ review_payments, record_invoice, view); checker: confirm_xray + view; csr: file_job_orders + manage_support + view. `process_job_orders` stays for the internal paths (DEA/OOG service-done, requeue, archive, restore).
- **Two-gate completion (migrations `0086`/`0087`, tightened by `0096`/`0097`/`0101`):** an order reaches `completed` only when **all services are done AND base payment is confirmed AND (RPS not needed or paid) AND every additional-charge supplement is paid** — whoever does the last gate triggers it (`jo_ready_to_complete()` + the `complete_on_payment_confirmed` BEFORE-update trigger).
- **Multiple owners + root-owner grants (migrations `0092`/`0093`):** redundancy owners are supported via `is_owner`, but only the **root owner** (`is_root_owner`, seeded to the current owner, never app-changeable) can mint or revoke owner access through `set_owner_access()`. Privilege-grant attempts are alerted to the owner. The single-session-per-account rule and the owner failsafe are unchanged.

### 2026-06-16 (per-van X-ray, e-signature, public verify-QR, cashier station)
- **Per-van X-ray, Checker-only (migrations `0087`/`0088`/`0095`):** X-ray is now confirmed **per container line** (`job_order_lines.xray_done_at/by`) via `record_van_xray` — gated to **confirm_xray = Checker only** (Operations lost the gate; it just monitors). BOC performs the actual X-ray; the checker confirms each van entered, with an **e-signature** captured per confirmation. The last van done rolls up to the X-ray service completion. Checker UI = a per-van tap-to-confirm list.
- **Public Job-Order verification QR (migrations `0089`/`0090`):** the completed slip carries a QR pointing at **`/verify/:id`** → anonymous `verify_job_order` RPC returns only the minimal non-sensitive facts (JO number, status, completion date, consignee, container count) so a guard / BOC / anyone holding the paper can confirm the slip is genuine. The verify screen shows a **PENDING vs COMPLETED watermark** and a **container cross-check**. (Foundation for a future gate-in/gate-out module — not built yet.)
- **Cashier station + walk-in payment (migration `0091`):** dedicated **`/admin/cashier`** focused payments view; **`record_office_payment`** records a walk-in/office payment so customers who pay at the counter skip the upload-review loop (online payment is still encouraged to skip the line).

### 2026-06-16 (additional-charge supplements + under-review lifecycle)
- **Job-order supplements (migration `0101`) = lightweight additional-charge lines.** `jo_supplements` numbered **JO-####-A/B/C…**, each with its own label, amount, payment status + proof. RPCs: `add_supplement` (gated `process_job_orders` = operations/admin/owner), `submit_supplement_proof` (customer), `review_supplement_payment` + `record_supplement_office_payment` (cashier `review_payments`). Folded into the two-gate completion: **release now requires base payment + RPS + every supplement paid.** Customer pays each as its own section on the payment page; cashier reviews/collects them in the cashier station.
- **"Under review" lifecycle (migrations `0101`/`0104`):** adding a supplement to a `completed` order reverts it to `processing` and clears `completed_at`; confirming the last supplement auto-re-completes. Surfaced via `has_open_supplement` / `hasOutstandingSupplements()` — an **"Under review" chip** on admin + customer rows and a banner on the payment page.

### 2026-06-16 (generalized queue, staff edit, comment escalation, support, notifications, nav)
- **Generalized priority queue (migration `0100`):** ONE priority number per JO (replaces the per-line X-ray/DEA/OOG serving numbers), assigned on `submitted`, **weekly reset**. Re-compartmentalizable per service later.
- **Staff edit (migration `0103`):** `staff_edit_job_order` lets staff fix **header fields only** (consignee / entry / vessel / voyage / vessel visit), gated `process_job_orders OR review_payments OR manage_support` (cashier / operations / CSR — **checker excluded**). Inline "Edit details" in the admin queue.
- **Serving number on edit (migrations `0079`/`0081`):** editing a FILED order **keeps its queue number** and flags it (the `0079` "bump to back" was reverted; keep-place + flag is final).
- **Comment escalation (migration `0102`):** `job_order_events` gained `visibility` (`public`/`staff_only`) + a `flagged` complaint marker; new `add_jo_staff_note` (internal note) and `flag_jo_comment` RPCs; `jo_timeline` hides staff-only rows from customers and exposes the flags.
- **Support ticket system (migration `0083`, both ends):** `support_tickets` + `support_messages` (SELECT-only RLS; writes via `open_ticket` / `post_ticket_message` / `set_ticket_status` / `log_ticket_escalation`; 5-open cap; `manage_support` = CSR + Admin/Owner). Customer `/support` (threads + "talk to an agent" tel/sms/viber/mailto deep links with a prefilled ticket ref); admin `/admin/support` inbox; contact channels editable in Settings. Live chat deliberately NOT built — tickets + the deep-link hand-off are the escalation path.
- **Staff notifications bell (migration `0085`):** `staff_notifications` permission-routed (RLS `has_permission(required_permission)`), so Owner/Admin see all, others only their role's. Triggers: payment proof → `review_payments`, support message → `manage_support`, account-ID → `manage_approvals`. `StaffNotificationBell` in the admin top rail. In-app notifications fire regardless of the customer-email switch.
- **Consolidated customer email (migration `0099`):** the customer-facing status emails collapse into a single deduped, no-detail nudge ("there's an update — sign in to view"); `emails_enabled` is now ON. Owner security/watchdog alerts are unaffected.
- **Admin bottom-tab nav:** the admin portal now uses a floating bottom tab bar + ⊞ Menu (`AdminBottomNav`, permission-gated), mirroring the customer nav; `AdminShell` slimmed to a top rail (logo + role badge + staff bell). The old top-nav dropdowns + `NavDrawer` are gone.
- **Atomic filing (migration `0098`):** `file_job_order` files the order, lines, JO number, and serving number in one transaction (closes the lines-arrive-after-insert race).
- **Rate calculator rework + per-line charge rules (migrations `0078`/`0080`):** guided shipping-line → vessel → trade → import/export → 20/40-count flow with a Generate-estimate step; electrical/reefer min-hours + refundable cash bond; per line × charge × trade waive/discount/surcharge rules (`shipping_line_charge_rules`, seeded data not code), editable in Settings.
- **Bulletin board (migrations `0076`/`0077`):** pinned announcements with per-account read tracking; a new `announcement` notification kind. RPS-assessed and account-approved events also now fire the customer bell (migrations `0082`/`0084`).
- **Desktop/tablet parity:** the mobile-first layouts from v1.2.0 now render correctly across desktop and tablet widths.

## v1.2.0 — 2026-06-15 (blind mobile walkthrough — customer-portal closeout)

### 2026-06-15 (session 12 — customer-portal closeout)
- **Customer notification center** (`NotificationBell` in the top nav, every page): unread badge + dropdown listing recent notifications (read + unread, unread highlighted), mark-all-read, click-through to the order. Backed by the existing `0071` triggers + `mark_notifications_read`; the Home `NotificationBar` stays as the louder inline cue.
- **Owner email on/off switch** (migration `0074`): `app_settings.emails_enabled` (owner-write, default **OFF** = suspended) gates the two customer email triggers (`send_broker_approved_email`, `send_job_order_status_email`). The shared `send_portal_email` helper is deliberately NOT gated, so owner security / watchdog alerts always fire. Toggle in **Settings → Customer notification emails** (owner-only). Customer status/approval emails are **suspended for now** until the owner flips it on.
- **Rate calculator rework** (migration `0073`): `terminal_rates` tariff keyed by service × trade (import/export) × origin (domestic/foreign) × size (20/40). New calculator form — trade/origin toggles, 20ft/40ft counts, vessel dropdown (shows Last Free Day), **planned-pickup date that auto-derives storage days** from the LFD, plus ancillary X-ray vans and reefer/electrical (vans + plug-in/out → billable hours). VAT on the subtotal, flat admin/print fees after. Admin editor in **Settings → Terminal tariff**.
- **JO comment/document moderation** (migration `0072`): authors and KTC staff can delete comments/supporting documents from the timeline (`delete_jo_entry`); system lifecycle events are never deletable. Protects the timeline from spam / offensive / irrelevant content.
- **Mobile/UX pass:** dashboard tiles → 2×3 square grid that auto-scales by device; sidebar drawer restructured into Menu / Account / Language & theme sections with the language + light/dark toggles grouped below; filing a Job Order now lands on **My Job Orders** (no auto-opened modal); JO filter tabs → a "Show" dropdown; Quick-tour added to the **Rate Calculator** and **My Account**; vessel-schedule + table/calendar captions reworded.
- **Customer Agreement bumped to v3 (Version 3.0)** as the go-live candidate (still pending counsel sign-off). No forced re-consent — the app records the accepted version at registration but does not gate existing users on it.

### 2026-06-13 (session 11 — charter expanded: TOS north star + Navis research)
- **Mission broadened:** `CLAUDE.md` now frames KTC as a **container-terminal + port-services + container-depot operator** (three pillars) with the north star of an **Octopi-class, modular Navis-style terminal + depot operating system** — the portal so far solved *ancillary-services queuing* (one module). Constitution word-cap relaxed from a hard "≤200" to a one-screen guideline (~220) in `doc-governance.md`, with the reason recorded. Persistent memory (system identity + project overview) updated to match.
- **Navis research (ultracode):** a multi-agent run (5 facet researchers → adversarial fact-check of 14 claims; 13 confirmed, 1 refuted — *PowerYard is a third-party e4Score YMS, not a Navis product*) produced `docs/research/navis-tos-landscape-2026-06-13.md` (Navis product map, TOS module map, depot M&R, EDI/data standards, KTC gap analysis, modular roadmap, glossary).
- **Vision + decision recorded:** new vault note `09-Future/Terminal & Depot Operating System (North Star).md` and **ADR-0015** (Octopi-class modular TOS; build the **container/EIR data spine** first, lead with Gate/EIR + Depot M&R, explicit "do-not-attempt-early" list). Linked from `Home`, `09-Future/README`, and the **Roadmap** (refreshed — it was stale at "prod-testing"). ADR log updated (was stale at 0012; now through 0015).

### 2026-06-13 (session 11 — doc governance hardened + vault resync; ST02 P8 cleared)
- **Doc governance strengthened to jta-sys parity** (`docs/agent/doc-governance.md`): freshness directive (no stale docs ever — update or archive in the same change; deletion is OWNER-only; vault navigational layer always current), what-belongs-where rules, ≤200-word constitution cap, deferred-folder registry (`plans/`, `audits/`, `operator-guide/`, `flows/` created on first need).
- **`docs/archive/` created** (holding pen per the new directive) — legacy/superseded docs moved in, plus the original ST02 lifecycle script (superseded by `smoke-test-02-portal.md`). `docs/README.md` map refreshed.
- **`docs/agent/tooling-inventory.md` completed:** all 11 `scripts/` entries documented with purpose + env needs; flagged that `SUPABASE_ACCESS_TOKEN` currently holds a secret API key (not a `sbp_` PAT), so the 4 Management-API scripts are broken until a PAT is generated; `apply-theme.sh` marked legacy.
- **Vault resynced to v1.1.0 reality:** `System Scale` (29→55 migrations, roles, crons, buckets, routes), `Current State` (2026-06-13 snapshot of sessions 10a–10s), `Pending Items` (rewritten around ST02/go-live gate), `Home` (new at-a-glance metrics block). `workflow-invariants.md` gained the brokers→customers naming note (migration `0021`).
- **ST02 P8 cleared:** test-project API keys regenerated (new `sb_publishable_`/`sb_secret_` format) → Playwright **16/16** against the localhost test build. Preflight now P1–P8 green; P9 + manual lanes with the owner.
- **`CLAUDE.md` brought under the ≤200-word cap** (268 → 198 words, matching the new doc-governance rule and jta-sys parity): prose tightened, the redundant intro pointers dropped (Supporting docs already indexes them), and the working-style directive "fix root causes, not symptoms — no blind edits" relocated to its owning file `docs/agent/coding-guardrails.md`. All five non-negotiables (incl. the jta-sys-MCP cross-wiring warning) intact.

## v1.1.0 — 2026-06-13 (trial-run release)

### 2026-06-13 (session 10s — version provenance in the footers)
- `APP_VERSION` bumped to **v1.1.0**; build now auto-stamps the **git commit + build date** (`vite.config.ts` define → `VERSION_LABEL`), shown in the login + customer footers and a new slim admin footer. Release ritual documented in `src/version.ts`.

### 2026-06-13 (session 10s — user manual + demo tour, per role)
- **User manuals for all 5 roles**, written as repo markdown (`src/content/manual-{customer,admin,cashier,checker}.md`) and rendered by the existing `MarkdownDoc` renderer:
  - **Customer** at `/manual` (new "User Manual" footer link): register→verify→file→queue→pay→print, statuses, account self-service, security expectations (15-min idle, single session, lockout).
  - **Staff** at `/admin/manual` (new "Manual" nav tab, visible to every role): cashier and checker each see *their own* guide; admin/owner get tabs for all four guides. "Print this guide" button on both pages.
- **Demo tours per role:** the customer Quick tour's card UI extracted into a shared `Tour` component; new `AdminTour` with role-specific steps — **admin/owner** (6 steps: dashboard→approvals→processing→payments/invoices→file-on-behalf→settings/logs/security), **cashier** (4 steps) and **checker** (4 steps). Auto-opens once per browser per role on the first admin-portal visit; replayable from a new **✨** nav button. Customer tour unchanged.
- ST02: new checks 1.6 (customer manual) and 6.5 (per-role tours + manual tabs).

### 2026-06-13 (session 10r — dead-session hardening + security headers)
- **Evicted-JWT caveat closed (migration `0055`):** `session_alive()` — true only while the JWT's session row still exists in `auth.sessions` (eviction/auto-suspend deletes it) — is now woven into all five core RLS helpers (`current_broker_id`, `broker_is_approved`, `broker_is_pending`, `is_admin`, `has_permission`). A kicked session's unexpired JWT now gets nothing from any helper-gated policy instantly, raw REST included. Server contexts (no `session_id` claim) pass untouched. Accepted remainder: raw-`auth.uid()` policies (own profile row / own storage folders) honor a dead JWT ≤1h — same-account data only.
- **Eviction audit trail:** `claim_session()` logs `session_evicted` to `security_events` when it actually kicked something — visible in Logs → Security (new label), and deliberately NOT in the watchdog's alert filter (routine device switches don't email the owner).
- **Browser security headers (vercel.json):** full CSP (self + Supabase + Turnstile + Google Fonts + blob: for the file viewer; `object-src 'none'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` — previously only Vercel's default HSTS.
- ST02 Lane 7 rewritten as a **full security-feature checklist** (inventory header + new checks 7.3d eviction log, 7.3e dead-JWT replay, 7.8 headers, 7.9 CSP-didn't-break-anything, 7.10 URL gating).

### 2026-06-13 (session 10r — one session per account, last login wins)
- **Single session per account (migration `0054`, everyone — customers + all staff):** a fresh sign-in calls `claim_session()`, which records the new session id in server-only `active_sessions` and **deletes every other auth session / refresh token** for that user (the 0047 eviction mechanism). The evicted browser signs itself out within ~a minute (`useSessionGuard` in both shells polls `is_current_session()` on mount/focus/60s — local-scope sign-out so it can't revoke the winner) and the login page explains: "signed in on another device… if that wasn't you, change your password."
- **Why kick-old, not refuse-new:** refusing the new login creates a lockout loophole (close the browser without signing out → wait out the idle timeout). Last-login-wins has no wait, and makes a credential thief *visible* — their login throws the real user out, who then resets the password (revoking everything).
- **MFA guard:** accounts with a verified TOTP factor can only claim at `aal2` — the claim runs after the 6-digit verify, so a stolen password alone can never evict the real session. Pre-rollout sessions are grandfathered until their next sign-in. Residual: an evicted JWT stays valid ≤1h for raw REST (same account, RLS/aal2 still apply).
- Note: multiple tabs/windows of the same browser are one shared session — unaffected.

### 2026-06-13 (session 10r — idle timeout everywhere + "still there?" prompt)
- **Every signed-in session now times out on inactivity** (was: only customers; the whole admin portal was exempt): **customers 15 min** (up from 10), **all staff — owner, admin, cashier, checker — 60 min**. Same persisted-marker mechanics everywhere (survives a closed browser, multi-tab aware), wired into `AdminShell` via a new `enabled` flag on `useIdleLogout` (off until the broker row loads, so nobody is kicked by a stale marker during the loading flash).
- **"Are you still there?" prompt one minute before sign-out** (new `IdleWarning` modal in both shells): any click, keypress or mouse movement — including pressing the prompt's button — resets the timer and dismisses it. The hook now returns the warning state.
- Login inactivity notice now states the actual window (the sessionStorage flag carries the minutes: `15` customer / `60` staff).
- ST02 refreshed to current behavior (covers `0050`–`0053`): new checks for the pricing lock + payment-details entry (5.0), catalogue add/deactivate/delete (5.0b), idle timeouts + warning prompt (7.3/7.3b), ID retention windows (8.4); teardown notes the `JO-000001`/`BR-000001` sequence reset for go-live.

## v1.0 — everything below shipped before versioned releases (≤ 2026-06-12)

### 2026-06-12 (session 10q — ID retention finalized: 24h guaranteed · 3-day auto-purge)
- **Final policy (migration `0053`, supersedes 0052's 7-day window):** uploaded IDs are guaranteed kept **24 hours** (storage policy blocks any deletion — review/print/save window) → **manually deletable 24h–3 days** (🗑 in the viewer) → **auto-deleted at 3 days** so storage never bloats.
- **Auto-purge, two layers:** (a) **lazy client purge** — any admin page load deletes expired files (hourly-throttled per browser, active immediately); (b) **hourly pg_cron `purge_expired_ids()`** calling the Storage REST API via `pg_net` (SQL can't delete storage objects) — silent no-op until Vault holds the service key (`scripts/setup-id-purge.mjs`; needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`). Purge calls are logged to `outbound_requests` (watchdog-visible).
- Agreement §4 retention updated: "automatically and securely deleted no later than 3 days after upload."

### 2026-06-12 (session 10p — clean slate; valid-ID delete + 7-day retention window)
- **Production wiped for go-live** (owner request): all job orders (+ lines, serving numbers, completions, events) and all non-staff users deleted; `jo_number_seq` reset — the first real order will be `JO-000001`. Remaining accounts: owner + admin fallback. Ops/monitoring logs kept. (One leftover stored ID file flagged for dashboard deletion — SQL can't delete storage objects.)
- **Valid-ID retention policy changed (migration `0052`):** IDs are **no longer deleted instantly on approval** — they're kept a **minimum of 7 days from upload** (verification + dispute window), then deletable. New `valid_id_uploaded_at` stamp (trigger); the storage DELETE policy enforces the window **server-side** (legacy/orphaned files stay deletable). Agreement §4 retention wording updated to match.
- **🗑 Delete in the file viewer:** the attachment modal (Print / Save) gains an optional two-step **Delete** — wired on the Customers list + customer detail "View ID" (appears only once the window has passed; clears `valid_id_path` after removing the file).

### 2026-06-12 (session 10o — catalogue ordering, safe delete, renames)
- **Drag & drop ordering (migration `0051`):** new `sort_order` drives the service order everywhere (JO form, bulk paste, calculator, Settings). Unlock the pricing card and drag rows by the ⠿ handle; order persists on Save.
- **Safe delete:** inactive services get a ✕ (two-step confirm). A DB trigger only permits deleting a service that is **inactive AND never used by any order line** — otherwise it tells you to keep it deactivated so history keeps its pricing.
- **Renames applied to live data:** `X-ray` → **X-Ray** (all variants) and `DEA ONLY` → **DEA** / `DEA ONLY (For PDEA)` → **DEA (For PDEA)** — updated in `service_rates` **and** all existing `job_order_lines` together (pricing matches by exact label). Queue mapping unaffected (substring, case-insensitive). Fallback list + both projects updated.

### 2026-06-12 (session 10n — service catalogue is data, not code)
- **Add / deactivate services from Settings** (no code changes, no migration — `service_rates` was already built for it): each rate row gains an **active** toggle, and an unlocked card offers **+ Add service** (name + VATable; name is the primary key, so it can't be renamed later — deactivate instead). Customer + admin JO forms and the bulk-paste selector now read the **live active catalogue** (`useServices`, cached, falls back to the built-in list); the Calculator already did. Deactivating removes a service from new filings only — existing orders keep their label and pricing (`computeCharges` loads all rates), and a draft row already carrying a deactivated service keeps it selectable so editing doesn't silently change it.
- Queue routing note: service names containing “X-ray” / “DEA” / “OOG” join those serving-number lines; anything else queues under “Other”.

### 2026-06-12 (session 10m — pricing lock + statutory VAT; honest dashboard counts)
- **Pricing lock:** the Settings rates/fees card is **locked by default** — inputs disabled (dimmed), Save disabled — until "🔒 Locked — unlock to edit" is tapped; saving re-locks automatically. No more accidental nudges.
- **VAT rate is now read-only everywhere** (shown as "12% · statutory · fixed") and **server-guarded (migration `0050`)**: a database trigger rejects any client-session change or delete of `pricing_settings.vat_rate` — even an admin via direct API. If the law ever changes it, it's a one-line server-side update. Applied to prod + test projects.
- **Dashboard/Customers counts fixed** (earlier in session): staff/admin/owner rows no longer counted as customers; job-orders tile counts the open queue it links to; restricted staff excluded from the Customers list.

### 2026-06-12 (session 10l — Playwright Phase 2 LIVE: 16/16 on the test project)
- **Dedicated test Supabase project** (`zwvzadkgeyhkhyshkwhc`, ADR-0010 Option A) stood up: all **49 migrations applied**, e2e accounts seeded (owner promoted / customer approved / staff via the real `create_staff` RPC — none with MFA), consignees seeded (the test project's own compliance trigger validated them — schema fidelity confirmed). New `E2E_DATABASE_URL` / `E2E_PUBLISHABLE_KEY` entries in `.env.local`; local test build runs on `:3000` (matches the project's default redirect, no dashboard config needed).
- **Harness fixes:** `mintSession` had a race — it navigated away before supabase-js persisted the magic-link session (the old "left /login" check passed instantly); now waits for the `sb-*-auth-token` localStorage key. Two stale strict-mode selectors fixed (nav-scoped Consignees link; exact-match New Job Order). CAPTCHA-mount smoke test auto-skips on localhost test builds (CAPTCHA is intentionally off there; prod still runs it).
- **Result: 16 passed / 0 failed** — 11 smoke + 5 authenticated lanes (owner→admin landing, consignees admin, owner settings, customer home + consignee typeahead, staff landing). Remaining 4 mutation lanes are `test.fixme` stubs to implement later. Note: with `.env.local` filled, `npx playwright test` targets the local test build by default — set `BASE_URL=https://portal.ktcterminal.com` to smoke prod.

### 2026-06-12 (session 10k — Customer Agreement v2: DPA-aligned protective redraft)
- **Customer Agreement rewritten as Version 2.0** (`AGREEMENT_VERSION = 'v2'` — new registrants record v2; prior acceptances are test accounts). Drafted for **maximum lawful protection**, not blanket immunity (blanket waivers are void under the DPA + Civil Code):
  - **Account security:** customer solely responsible for credentials/devices; all account activity deemed theirs; KTC not responsible for unauthorized use caused by their failure to safeguard (to the extent permitted by law).
  - **NDA hardened:** unauthorized use/disclosure/exploitation of Portal data = material breach; injunctive relief; KTC-side promise limited to "personnel/processors bound by confidentiality" (no absolute-safety warranty).
  - **Liability:** "as is"; no indirect/consequential damages; aggregate cap = fees paid for the job order(s) at issue; third-party criminal acts + customer-side incidents excluded **conditioned on KTC's DPA-compliant safeguards**; statutory carve-out (fraud/gross negligence/non-excludable liability) kept — that's what makes the rest enforceable.
  - **Customer indemnity expanded:** false submissions, acting without consignee authority, **their leak/misuse of data accessed via the Portal**, unsafeguarded account use, violations of law.
  - **DPA compliance restored/added:** DPO line (name TBC), NPC complaint + damages right, security-measures clause (matches what's actually built: RLS, encryption, MFA, audit logs), 72h-style breach-notification commitment, retention incl. customs/tax record rules.
  - **General:** force majeure, exclusive Davao City venue, severability, no-waiver, assignment, entire-agreement.
- ⚠️ Still requires **counsel sign-off before public launch** (release gate) — esp. the DPO designation, NPC registration check, and the liability cap amount.

### 2026-06-12 (session 10j — 2FA scoped to admin/owner, demo tour, ST02 script)
- **2FA scoped to admin + owner for now:** the "2FA" nav tab and `/admin/security` page now require admin access (cashier/checker get a notice). Enforcement keys off enrollment, so unenrolled floor roles are untouched.
- **New-customer demo tour:** a 6-step "Quick tour" (welcome → verify ID → file → serving number → pay → print/release) **auto-opens on a customer's first Home visit** (remembered per browser) and stays re-openable via the "Quick tour ▸" link. Pure frontend, no backend.
- **ST02 manual smoke-test script** (`docs/smoke-test-02-portal.md`): 8 lanes × ~40 checks covering everything since ST01 — onboarding+tour, filing+serving numbers, processing loops, checker, payments+invoice (incl. BILLED/PAID), roles & gates, security & monitoring (2FA, auto-suspend, Logs, health), housekeeping. Ready to execute on live.
- **Phase 2 e2e prep:** README updated — minted sessions are `aal1`, so Phase 2 must use non-MFA test accounts; still blocked on `E2E_SERVICE_ROLE_KEY` (+ ideally a dedicated test project).

### 2026-06-12 (session 10i — owner transfer + TOTP MFA, server-enforced)
- **Owner transferred** to `jlawrenceang@gmail.com` (the owner's 2FA-protected main account; was already a confirmed customer row — promoted to `is_owner` + admin). `jla.ktcport@gmail.com` demoted to a **plain admin** (fallback login; no failsafe). Watchdog/security alerts now go to the new owner email automatically (they follow the `is_owner` row). Current-state docs + seed script + e2e default updated; ADR-0004 amended.
- **TOTP MFA (migration `0049` + `/admin/security`, new "2FA" nav tab for all staff):** enroll an authenticator app (QR or manual key → 6-digit verify), remove with confirm. Sign-in then shows a code challenge (`MfaChallenge` gate in `ProtectedRoute`). **Enforced server-side, not just UI:** once an account has a verified factor, `is_admin()` and `has_permission()` return false unless the session's JWT is `aal2` — a stolen password alone can't read or touch anything staff-gated. Accounts without a factor are unaffected. Lost-authenticator rescue: owner deletes the row from `auth.mfa_factors` via the server connection.
- Note: `SUPABASE_ACCESS_TOKEN` in `.env.local` is returning 401 (expired?) — regenerate before the next Management-API script run.

### 2026-06-12 (session 10h — Activity Log tab + privilege-audit lockdown)
- **Activity Log (`/admin/logs`, new "Logs" nav tab):** one paginated place (25/page, auto-refresh) for everything the portal records — **Job orders** (full audit trail with actor names + JO numbers), **Security** (owner-only tab: escalation attempts, role-gate changes), **Client errors**, **Emails & sync** (every outbound call with its HTTP result). RLS does the real gating; shared event labels extracted to `src/lib/eventLabels.ts`.
- **Privilege-audit lockdown (migration `0048`):** ran a live grants audit and fixed the findings — `_migrations` (migration tracker) had **no RLS** (default Supabase grants = anon-writable; now server-only), and several definer functions were anon-executable via the default PUBLIC grant (maintenance + trigger functions revoked from everyone; RLS helpers pinned to authenticated-only). Post-fix audit: **every public table has RLS; the only anon-callable definer function is `log_client_error`** (intentional, capped). All definer functions have pinned `search_path` (verified).

### 2026-06-12 (session 10g — auto-suspend + kick on escalation attempts)
- **Migration `0047`:** a privilege-escalation attempt by a **customer on their own row** (crafted API call touching `is_admin`/`is_owner`/`status`/`staff_role` — the real UI never sends these, so no accidental triggers) now: reverts the change, **auto-suspends the account** (terminal lock — RLS blocks everything, portal shows the locked panel, held orders cancelled), **revokes their auth sessions/refresh tokens**, and logs `auto_suspended: true` → 🚨 owner email within 15 min. Attempts **by staff** (e.g. an admin touching the owner row) are alerted but NOT auto-revoked — the owner decides, so a false positive can never lock out the ops floor.

### 2026-06-12 (session 10f — security alerts: anything bad emails the owner)
- **Breach-attempt detection (migration `0046`):** new owner-readable **`security_events`** log. The `guard_broker_protected_fields` trigger — which silently reverted attempts to change `is_owner`/`is_admin`/`status`/`staff_role` — now **records every attempt** (`protected_field_attempt`, with the fields tried and the actor). Role-gate matrix edits are logged too (`role_gate_changed`, audit).
- **Watchdog upgraded:** runs every **15 minutes** (was hourly) and emails the owner on **any** client error (was ≥10/h spike) and **any** blocked privilege-escalation attempt (🚨 subject line), plus the existing failed-cron / failed-send alerts. One combined email per run with **per-category dedupe** (security 1h, others 6h) so a noisy category can't mute a new one.
- **System health panel** now shows security events (owner only; admins get an empty list).

### 2026-06-12 (session 10e — G12 observability + stale-session logout)
- **Observability (G12, migration `0045`)** — all in-Supabase, no third-party SDK:
  - **Client error tracking:** global `error`/`unhandledrejection` handlers + a React **ErrorBoundary** (friendly "Something went wrong — reload" panel instead of a white screen) report to the `log_client_error` RPC → `app_errors` table. Throttled client-side (5/min, once per distinct error per session, browser noise ignored) and capped server-side (20/h per user, 200/h global); pruned at 30 days; admin-read only.
  - **Outbound-call log:** `send_portal_email` and the BOC mirror call (now `run_boc_mirror()`) record every `pg_net` request id in `outbound_requests`; results (HTTP status / timeout / error) are reconciled from `net._http_response` — sends are no longer fire-and-forget.
  - **Settings → System health panel:** one-click snapshot via the admin-gated `system_health()` RPC — each pg_cron job's last run + status (with plain-language hints), outbound failures this week, client errors in 24h.
  - **Hourly watchdog (`ops-watchdog-hourly`):** emails the **owner** when a cron run failed, an outbound call failed, or client errors spike (≥10/h) — deduped to at most one alert per 6 hours; also prunes `app_errors`/`outbound_requests` (30d) and `cron.job_run_details` (14d). Verified once against the live DB.
- **Stale-session logout:** the 10-minute idle rule now survives a closed browser — last activity is persisted (`localStorage`), so reopening the portal past the limit signs the customer out immediately instead of resuming the old session. Bonus: the shared marker makes the idle timer **multi-tab aware** (activity in any tab keeps the others alive). Fresh sign-ins stamp the clock so a leftover marker can't insta-logout a new session. Admin portal stays exempt (checker tablet / cashier station must stay signed in).

### 2026-06-12 (session 10d — recording an invoice requires BOTH numbers)
- **Both control numbers now required (migration `0044`):** recording an invoice takes the **ERP control no.** (`OR-INV-…` / `BI-INV-…`, normalized) **and** the **printed invoice serial** (OR / Billing Invoice pad no., e.g. `001323`, leading zeros kept → new `invoice_pad_no` column) — validated separately, saved atomically, both logged in the audit event. The queue form shows two hinted inputs; the chip and history show `PAID/BILLED · OR-INV-… · #094303`; the customer's payment page now quotes the **printed** receipt/invoice number (the paper they hold).

### 2026-06-12 (session 10c — G9 invoice-number validation, real ERP formats)
- **Invoice formats confirmed from the ERP** (erp.ktcport.com, Frappe): **OR #** = 5-digit printed Official Receipt pad serial (cash; BIR series 50001–125000) · **Billing Invoice** = 6-digit printed pad serial (credit) · **ERP control no.** = `OR-INV-########` (cash) / `BI-INV-########` (credit).
- **Validation (G9, migration `0043`):** `record_service_invoice` now accepts an ERP control no. — tolerant of missing dashes/zeros, normalized to canonical form — or a bare printed pad serial (4–8 digits, leading zeros preserved). Anything else is rejected with a format hint. Input placeholder/tooltips updated.
- **PAID vs BILLED:** a `BI-` control no. means billed on **credit**, not cash-paid — the admin queue chip shows **BILLED · SI …** (blue), the audit history says "billed · credit", and the customer's pay button / payment page say **Billed** instead of Paid. The release gate is unchanged: any invoice on file = released.

### 2026-06-12 (session 10b — G8 payment-rejected email + customer list views)
- **Payment-rejected email (G8, migration `0042`):** a rejected payment proof now emails the customer (action-required — joins the lean on_hold/rejected set; confirmations stay in-app). The email carries the reviewer's note and links straight to the order's **pay page** for a re-upload. The branded template + Vault lookup + `pg_net` send were extracted into one server-only **`send_portal_email`** helper shared by all portal emails; the status trigger now watches `status` **and** `payment_status`.
- **My Job Orders: views + pagination.** The customer list no longer loads full history — server-side filters (**Active** default · **Needs action** · Completed · Rejected/cancelled · All) with **10 per page**, a total count, and filter-aware empty states. "Needs action" surfaces on-hold orders, fixable rejections, and rejected payment proofs in one tap.
- **Admin queue page size 50 → 20** for snappier loads on the ops floor.

### 2026-06-12 (session 10 — gap fix G3: admin file-on-behalf)
- **File for a Customer (G3, migration `0041`):** new admin page **`/admin/new-job-order`** ("New JO" nav tab) — pick the customer (typeahead over pending/approved accounts; staff excluded), then the same consignee + containers form customers use. Files via the **`admin_file_job_order`** SECURITY DEFINER RPC straight to `submitted`: JO number, serving numbers, and the audit `filed` event (actor = the staff member) all come from the existing triggers, identical to a customer filing. Success panel offers **Print slip / File another / View queue**.
- **New owner gate `file_job_orders`** (admin ON, cashier/checker OFF — tweak in Settings → Roles & gates). **Staff filings bypass the 10-order caps**: the open-cap error itself says "contact KTC admin to file more", so admin filing is that escape hatch.
- **Refactor:** the consignee typeahead and container-lines editor (incl. bulk paste) are now shared components (`SearchPicker`, `ContainerLinesEditor`) used by both the customer form and the admin form — one implementation to maintain.

### 2026-06-11 (session 9 — gap fixes G1 + G2 + G6)
- **Per-service completion (G1, migration `0040`):** new `service_completions` table (per JO per service line) + `record_service_done(jo, line)` RPC — X-ray confirmable by checker or admin, DEA/OOG by admin. The JO flips to **`completed` only when EVERY service line it carries is done** (first completion moves `submitted → processing`); the admin force-complete (direct status set) auto-syncs the per-line rows so views can't disagree. `record_xray` is now a thin wrapper (checker app unchanged); the **checker queue drops an order once its X-ray is done** even if OOG/DEA keep it open. Admin queue shows per-line **✓ / pending chips** and per-line **"✓ {service} done"** buttons on mixed-service orders; existing completed orders backfilled.
- **Weekly carry-over (G2):** policy = **carry-overs keep priority**. A Monday 00:15 PH pg_cron run (`requeue_carryovers`, also manually callable by admins) moves still-open orders holding last week's numbers to the **front of the new week's line in their old order**; old numbers are burned. Runs before the archive job and before anyone files.
- **Audit trail (G6):** append-only **`job_order_events`** — filed, status changes (with the admin note), per-service completions, payment submitted/confirmed/rejected, invoice recorded, archived; `actor` = the signed-in user (null = system/cron). Written only by triggers + definer functions (no client INSERT); readable by staff via the `view_job_orders` gate. New **🕘 History** expander on every admin queue card showing the timeline with actor display names.

### 2026-06-11 (session 8 — gap fixes G7 + G4/G5 + weekly archive)
- **Staff password reset (G7, migration `0039`):** owner-only `reset_staff_password` RPC (staff `@ktc-staff.local` accounts can't use the email reset flow); inline "Reset password" on the Settings staff list. Same 8+/letter/digit policy.
- **Admin queue views + pagination (G5):** segmented filters — **Open** (default) · **Unpaid · completed** · Completed · Rejected/cancelled · Archived · All — now filtered server-side with **50-per-page pagination** and skeleton loading. Scales past 50–60 JO/day.
- **Unpaid-completed report (G4):** the "Unpaid · completed" view is the cashier's EOD audit — completed orders with no Service Invoice on file, each carrying an **aging chip** (`unpaid Nd`, red at 3+ days) driven by the new `completed_at` stamp (trigger on status→completed; backfilled).
- **Weekly archive (new ask):** `archived_at` on `job_orders` + `archive_done_orders()` — archives every **completed + paid** (SI no. on file) order. Runs **automatically every Monday 00:30 PH** (pg_cron) and on demand via the **🗄 Archive paid & completed** button (Completed/All views, `process_job_orders` gate). Archived orders leave the default queue views (Archived filter shows them); customers keep their full history; the BOC mirror is unaffected (60-day window).

### 2026-06-11 (session 7 — serving numbers + process flow map)
- **Serving-number system (migration `0038`):** weekly per-service-line queue numbers ("now serving"), separate from the permanent JO number. `serving_numbers` table (unique per line+week+number; one active per JO per line); lines classified `xray`/`dea`/`oog` (combined services queue at X-ray). Assigned on `submitted` via triggers (status transitions + line inserts — lines arrive after the JO insert); **edit/respond keeps the number; cancel/reject burns it (never reused); resubmit goes to the back of the line; admins get an "↩ Restore #N" button** (`restore_serving_number`, same-week only). Backfilled open orders in filing order. Numbers are written only by SECURITY DEFINER functions; customers read their own, staff via the `view_job_orders` gate.
- **Now-Serving board** (`now_serving()` definer RPC — per line: lowest open number + last issued this week): shown on **My Job Orders** and the **Checker station**; serving chips on customer + admin order cards; the **checker queue now sorts by line number**; the **A6 slip prints the line number** (the customer carries their queue position).
- **Process Flow Map & Gap Analysis** (`docs/obsidian-vault/04-Workflows/Process Flow Map.md`): Mermaid diagrams of the account, job-order, and physical/money flows as built, plus a 12-item gap table (top finds: per-service completion G1, weekly carry-over policy G2, admin file-on-behalf G3, unpaid-completed report G4, queue filters G5, JO audit trail G6, staff password reset G7).

### 2026-06-11 (session 6 — payment page + rate calculator + BOC Sheets mirror)
- **Online payment (migration `0036`, manual proof — no gateway):** per-JO payment page at **`/job-order/:id/pay`** (linked from My Job Orders with a live payment-state button): fee **computation** (shared engine `src/lib/pricing.ts` — Σ rate × containers, VAT on vatable services, flat admin + print fees), KTC **bank/GCash details + QR** (admin-editable in Settings → "Payment details", QR in the public `payment-qr` bucket), and **deposit-slip upload** (`payment-slips` bucket, per-user RLS, auto-compressed) → `submit_payment_proof` RPC. `payment_status`: `unpaid → submitted → confirmed | rejected` (+ proof path, timestamps, reviewer note). Payment never gates processing; `service_invoice_no` (ERP) remains the final PAID word.
- **Admin payment review:** queue cards show **"Payment proof to review"** → View payment slip (in-app modal viewer), **Confirm payment**, or **Reject proof** with a required customer-visible note → `review_payment` RPC, gated by a new **`review_payments`** permission (admin + cashier yes, checker no; appears in the owner's Roles & gates matrix). Customer sees the result on the payment page and can re-upload after a rejection.
- **Rate Calculator (`/calculator`):** customer-facing estimator — enter container counts per active service, get the same breakdown the payment page uses (sticky estimate panel, missing-rate warnings). Home card + "Rates" nav link.
- **BOC Sheets mirror (one-way app → Google Sheet):** Edge Function **`boc-mirror`** (deployed) snapshots the last 60 days of non-held JOs (one row per container: JO no · filed · status · container · service · customer · consignee · entry · X-ray done · SI no) into a Sheet for the Bureau of Customs, who don't get portal access. Triggered hourly by **pg_cron (migration `0037`)** with a Vault-stored URL + secret — a silent no-op until `scripts/setup-boc-mirror.mjs` is rerun with the Google service-account credentials (10-min owner setup documented in `docs/obsidian-vault/04-Workflows/BOC Sheets Mirror.md`). Strictly one-way; the Sheet is a viewport, never an input.
- **Docs:** vessel-schedule monitoring (staff sheet-upload → validated import → schedule board) captured as the next-phase plan in `docs/obsidian-vault/09-Future/Vessel Schedule Monitoring.md`; lifecycle doc §E/§F updated (payment + computation + mirror now ✅).

### 2026-06-11 (session 5 — staff roles + owner gates, X-ray checker station, ERP invoice link)
- **Staff roles + owner-controlled permission gates (migration `0035`):** new roles **`admin` / `cashier` / `checker`** (`customers.staff_role`; protected by the guard trigger — only the owner can assign, customers can't self-serve a role). A **`role_permissions`** matrix holds the gates (8 permissions × 3 roles, seeded sensible defaults); **read = any authenticated, write = OWNER ONLY**, editable in **Settings → "Roles & gates"**. Enforcement is backend-first: restricted roles are **NOT `is_admin`** (no existing admin policy applies); they see job orders via a new `has_permission('view_job_orders')` SELECT policy and act only through permission-checked SECURITY DEFINER RPCs. `create_staff` gained a role parameter; staff list shows roles; revoke clears both flags.
- **X-ray Checker station (`/admin/checker`, tablet-first):** big-touch queue of open JOs with X-ray lines (oldest first), a **container/van + JO clearance lookup** ("NOT CLEARED · X-ray pending" vs "CLEARED · date/time") answering the gate-release question, and a confirm flow → `record_xray` RPC stamps **`xray_performed_at`** and completes the order. Checkers land there on sign-in; auto-refresh + cooldown like the other queues.
- **ERP Service Invoice link:** `service_invoice_no` + `invoice_recorded_at` on `job_orders`; cashier/admin records the number on a completed JO (**Record invoice #** inline on the queue) via `record_service_invoice` → **PAID · SI xxxx** chip. Per decision: invoice number on file = paid; the ERP invoice carries the JO number for cross-reference.
- **Role-aware navigation:** admin nav items are filtered by the gate matrix (cashier sees Job Orders only; checker sees the Checker station); role landing pages (`checker → /admin/checker`, `cashier → /admin/job-orders`); role badge in the nav.
- **Viber tweak:** the "Send via Viber" button now also copies the message, so paste works even if the deep-link prefill doesn't carry over.

### 2026-06-11 (session 4 — P0 lifecycle loops + lean status emails + chat message generator)
- **Lifecycle loops closed (migration `0034`):** customers can now act on their own orders via three SECURITY DEFINER RPCs (no broad UPDATE policy — each checks ownership + the exact transition): **`respond_to_hold`** (`on_hold → submitted`, required reply note + optional entry-number fix), **`resubmit_rejected`** (`rejected → submitted`, only when the admin marked the rejection **recoverable**; re-checks the open-order cap under the advisory lock), **`cancel_job_order`** (`held`/`submitted`/`on_hold` → `cancelled`; not once processing). New columns: `customer_note` (reply shown to admins as **Customer reply**) + `rejected_recoverable` (admin's reject-time choice; default true; terminal = file a new order).
- **Customer UI:** on-hold orders get **Respond & resubmit** (inline form), recoverable rejections get **Fix & resubmit**, terminal rejections link to filing a new order, and cancellable orders get a confirm-style **Cancel this order**. Customer note is echoed on the card after resubmit.
- **Admin UI:** reject modal gains an **"allow fix & resubmit"** checkbox (untick = permanently closed); queue cards show the **Customer reply** and flag terminal rejections.
- **Lean status emails (decided set):** Resend emails fire ONLY on **`on_hold`** ("action needed — information required") and **`rejected`** (reason + whether it can be resubmitted) — action-required transitions; completed/processing stay in-app (auto-poll). Same Vault + `pg_net` pattern as the approval email; skips synthetic `@ktc-staff.local` addresses; mail failure never rolls back the status change.
- **Chat status-message generator (admin):** a **💬 Message** button on every queue card composes a templated status message (greeting, JO number, status, note, portal link) in a modal with **Copy**, **Send via Viber** (`viber://forward` deep link — opens the forward picker), and **SMS** (pre-filled to the customer's contact number, mobile). Messenger has no prefill API — Copy + paste. No external service, no cost; staff send from their own device.
- **P2 parked with a proposal:** `docs/obsidian-vault/04-Workflows/Payment & Cashier Handoff (proposal).md` — portal-lookup cashier flow (not the Sheet in the critical path), `service_invoice_no` = paid, EOD unpaid-completed report, and the 6 questions to audit with ops.

### 2026-06-11 (session 3 — uploads hardening v2, in-app viewer, auto-poll, "Harbor Glass" UI overhaul)
- **Uploads: 5 MB cap + auto-compression (migration `0033`):** bucket limit lowered 10 → 5 MB; the client now **auto-compresses oversized images** before upload (`prepareUpload` in `src/lib/validation.ts` — canvas downscale to 2200px + JPEG quality stepping; HEIC/PDF can't be recompressed so they get a friendly "max 5 MB" message). Wired into Verify-ID, the resubmit panel, and the consignee 2303 upload.
- **In-app attachment viewer (`FileViewerModal` + `useFileViewer`):** viewing a valid ID / 2303 no longer opens a new tab — a frosted modal shows the image or PDF inline with **Print** and **Save** buttons (file fetched to a local blob so the 60s signed URL can't expire mid-view; image printing via a hidden same-origin iframe). Wired into Approvals, Customers, Customer detail, and Consignees; the separate "Download" action was folded into the modal.
- **Status auto-refresh (`useAutoRefresh`):** My Job Orders and the pending-verification banner now refresh automatically **every 60s while the tab is visible** (plus once when the tab regains focus); the manual ↻ buttons are rate-limited to **one pull per 10s** (disabled with a hint during cooldown).
- **"Harbor Glass" UI overhaul:** new type pairing — **Schibsted Grotesk** (UI) + **IBM Plex Mono** (JO/container/customer codes) replacing Inter; **persistent frosted top nav** with active-pill state in both portals, replacing the Home-cards-as-nav + back-button + breadcrumb pattern; **staggered page-load reveal** (`ktc-stagger`/`ktc-rise`); shared `ktc-title`/`ktc-sub`/`ktc-mono` typography classes swept across all pages; redesigned Home hero + taller action cards; dashboard header un-boxed; modal system (`ktc-modal-*`) with blurred backdrop + spring pop-in. All motion respects `prefers-reduced-motion`.
- **Performance: admin portal code-split** — admin pages + the print view are now `React.lazy` chunks; main bundle 512 → 457 kB and customers never download admin code.
- **E2E: smoke spec un-staled** — two Phase-1 tests still asserted the pre-rebrand "KTC Broker Agreement" wording, two consent ticks, and a "View full" link; updated to the current product (Customer Agreement, one consolidated tick, button + modal). **11/11 passing.**

### 2026-06-11 (session 2 — security notes settled + dead-end cleanup)
- **Server-side auth policy tightened (Management API, `scripts/set-auth-security.mjs`):** password min length **6 → 8** with at least **one letter + one digit** (new passwords only — existing logins unaffected); auth email rate limit 100 → 30/h. New read-only `scripts/check-auth-rate-limits.mjs` to audit the live config. Client forms aligned (`src/lib/validation.ts` shared validator + hint): registration, Account change-password, Reset password, and Settings create-staff now validate 8+/letter/digit before submit.
- **Upload validation server-enforced (migration `0032`):** `valid-ids` + `consignee-docs` buckets now reject files over **10 MB** or outside **image/PDF MIME types** at the storage layer; client pickers (Verify ID, resubmit panel, consignee 2303) pre-check via `uploadIssue()` for a friendly message. Also in `0032`: **`create_staff` enforces the same 8+/letter/digit password policy** (it writes `encrypted_password` via `crypt()`, bypassing GoTrue's policy, so it needs its own check).
- **`seed-owner.sql` fixed:** still targeted `public.brokers` (renamed to `customers` in `0021`) — the owner-failsafe re-grant would have failed if ever needed. Now targets `customers` + documents that it is service-role/SQL-editor-only.
- **MarkdownDoc:** documented the security boundary in-code (trusted repo content only; all output via React text nodes — no XSS; use react-markdown+sanitize if user content ever needs markdown).
- **Obsolete accreditation UI removed (dead-end cleanup; ADR-0007 addendum):** deleted `src/pages/Accreditation.tsx` + the `/accreditation` route + breadcrumb; removed the admin "Accreditation approvals" section and the "Accreditations pending" dashboard tile (with the request page gone they could only ever be empty); removed the unused `Accreditation` type. The `accreditations` DB table + policies are untouched (reversible via git history). New practice: deletions are noted in the relevant ADR.
- **Stale-status refresh (P1 #5):** `useBroker` gained `refresh()`; the pending-verification banner has an **↻ Refresh status** link and My Job Orders an **↻ Refresh** button — customers can pull the latest account/JO status without a full page reload.

### 2026-06-11
- **Full app review (flow + security + UI) + fixes:** two-track sweep of the DB layer (RLS/SECURITY DEFINER/storage — verdict: solid, no critical findings) and the frontend. Fixed the three actionable findings: **(1) order-cap race (migration `0031`)** — `enforce_order_caps` now serializes per-customer with `pg_advisory_xact_lock` so concurrent inserts can't exceed the 10-order caps; **(2) double-submit guard** on New Job Order (ref-based — a rapid double-click could file the order twice); **(3) Approvals now surfaces a failed valid-ID storage deletion** (DPA) instead of silently claiming the ID was removed. Remaining flow gaps confirmed = the known lifecycle items (on_hold response path, rejected resubmit, edit/cancel, notifications, realtime status refresh) — tracked in `docs/obsidian-vault/04-Workflows/Job Order Lifecycle.md`.
- **visionOS theme layer v2:** extended the design system — design tokens for **material tiers** (`--glass-thin/-thick` + blur ramp), **spring motion** (`--ease-spring`, duration tokens) and **semantic status tones** (`--tone-*`); new reusable classes `ktc-glass-thin`/`ktc-glass-thick`, `ktc-card` (hover lift + press settle on glass links), `ktc-btn-secondary`, `ktc-btn--sm`, `ktc-chip` + tone variants, `ktc-skeleton` shimmer; an **ambient aurora canvas** (two slow-drifting brand-tinted orbs behind everything) and a global **`:focus-visible` accent ring**. All motion respects `prefers-reduced-motion`; aurora hidden in print. Applied: Home cards + admin Dashboard tiles + back-pills get card physics; My Job Orders uses the shared chips, skeleton loading rows, and `ktc-btn--sm` for Print slip.
- **Admin-configurable pricing (migration `0030`):** new `service_rates` (per-service rate / unit / vatable) + `pricing_settings` (`vat_rate` = 0.12, `admin_fee`, `print_fee`) tables. **RLS: any authenticated user can read; only admins can write.** Editor added to **admin Settings → "Service rates & fees"** (seeded at 0 = placeholders to fill in). Feeds the future online-payment **computation page** — the official Service Invoice + BIR receipt are produced in KTC's **ERP**, not here (this portal is operational-only). Decisions captured this session: JO carries no fees; a `service_invoice_no` will be recorded on the JO at payment/EOD (= paid); rejected orders get a resubmit/refile path (admin's choice); edit/cancel own order to be added; internal/admin JO filing + a JO-processing tile; X-ray-line priority model TBD; container size / vessel-voyage / plug-in-out fields deferred; service catalogue (beyond X-ray/DEA/OOG) deferred; consignee master list stays open.

### 2026-06-10 (session 2 — processing, slip, account, polish)
- **Admin job-order processing (ADR-0014, migration `0029`):** the admin **Job Orders** page is no longer read-only. "Approve = start processing" — an admin advances an order `submitted → processing → completed`, or puts it **on_hold** (needs info) or **rejected**, each with a **customer-visible note** (`admin_note` column). Two new statuses `on_hold` + `rejected` (distinct from the account-gated `held`, which stays queue-hidden). Added an **admin UPDATE policy** on `job_orders` (owner included via `is_admin()`); customers still have no UPDATE policy. `on_hold` now counts toward a customer's 10 open-order slots (`enforce_order_caps`). Customer **My Job Orders** shows the new statuses + the admin note (info-needed / rejected reason).
- **Printable job-order slip (ADR-0014, `/job-order/:id/print`):** an **A6 quarter-sheet** styled as a mini **KTC Service Invoice** — logo + company/TIN/Davao address header, **JOB ORDER** + red JO No., a bordered **JOB ORDER FOR** customer block, a `Container No. · Nature of Service · Qty · Amount` table (Amount shows `—`, structure ready for prices later), TOTAL CONTAINERS row, and **Prepared by / Received by** signature lines. Browser print (`@page { size: A6 }`) → print or Save-as-PDF; `print-color-adjust: exact`. Available once approved (processing/completed). A diagonal **"ON PROCESS" watermark** + "STILL ON PROCESS" banner show for in-progress orders and disappear on completed. Reachable from both the admin queue and the customer's My Job Orders.
- **My Account self-service (ADR-0013, migration `0028`):** new **`/account`** page (Home card + header link + breadcrumb) where a customer edits **full name / contact number**, changes **email** (Supabase sends a confirmation link to the new address — change only applies on confirm; also syncs `customers.email`), and changes **password** in-page (plus a "reset by email" link reusing `/forgot-password` → `/reset-password`). Because the verified legal name is matched to the (now-deleted) valid ID, an **approved** customer changing their name triggers **re-verification**: a confirm modal, then back to `status='pending'` to re-upload an ID. The `guard_broker_protected_fields` trigger now permits the `approved → pending` self-transition (in addition to `rejected → pending`); everything else still blocked.
- **Login lockout:** after **5 wrong passwords** for an email, sign-in is disabled for **60s** with a live countdown (per-email, localStorage; a deterrent layered on Supabase's server-side auth rate limits). Cleared on success.
- **New Job Order — bulk paste + redirect:** a **⧉ Bulk paste** box turns one-container-per-line text (commas/spaces also split) into rows with a chosen service, skipping duplicates — **uncapped** (a single C-number can have 100+ containers). After filing, the page **redirects to My Job Orders** and auto-expands the just-filed order (replacing the old inline success box). Card captions generalized ("File for terminal services", "Track your job order status").
- **My Job Orders redesign:** orders are now **collapsible cards** — header shows JO number + a color-coded **status badge** + consignee + container count + date; expanding reveals the container→service list, the admin note (on_hold/rejected), and a **Print slip** button (processing/completed). Added a **+ New Job Order** button in the header.
- **Unified Notice component:** new `src/components/Notice.tsx` (success/error/warning/info tones) — the **pending-verification banner** and all **login bubbles** now render through it for one coherent style.
- **Navigation:** a **Back to Home** (customer) / **Back to Dashboard** (admin) button on every inner page next to the breadcrumb, and the **logo is now clickable** (→ Home / Dashboard).
- **Admin dashboard redesign:** the rectangular stat tiles are now **square frosted-glass (visionOS) tiles** with icons; "action needed" tiles (pending accounts/accreditations/consignees) glow with an accent border + pulse dot when their count is non-zero.
- **Email-confirm flow → fresh sign-in:** the confirmation link now lands on a new **`/confirmed`** page ("Email confirmed ✓ → Sign in to continue") that signs the user out and sends them to `/login` (which shows "✓ Your email is confirmed — please sign in"). They then log in with their password and land in the portal. `emailRedirectTo` (signup + both resend paths) now points at `/confirmed` instead of `/verify-id`. Cleaner/intentional sign-in; avoids the email-link-session vs redirect race.
- **Valid-ID deleted on decision (DPA data-minimisation, migration `0027`):** when an admin **approves or suspends** a customer, their uploaded valid ID is deleted from storage and `valid_id_path` cleared (only cleared if the file actually deleted). Added an admin DELETE policy on the `valid-ids` bucket and a **Download** action next to "View valid ID" so admins can save/print before deciding. Rejection (recoverable) keeps the ID for resubmission.
- **Resubmit-after-rejection flow (migration `0026`):** admin rejection now has 3 outcomes — *ID unreadable → re-upload*, *needs updated info → resubmit* (both **recoverable**, status `rejected`), and *suspend* (**terminal**, status `suspended`). A rejected customer gets a gentle "Resubmit your details to continue" panel (no harsh "rejected" wording) to edit name/contact + re-upload ID, then resubmit → back to `pending`. The `guard_broker_protected_fields` trigger now permits exactly the `rejected → pending` self-transition (everything else still blocked); held orders are kept on `rejected` (recoverable) and only cancelled on `suspended`. Suspended shows a terminal contact-customer-service screen.
- **JO series format:** job-order numbers are now **`JO-######`** (6-digit, e.g. `JO-000001`) — migrations `0023` (`X- → JO-`) + `0024` (5 → 6 digits). Assigned by `ensure_jo_number` on the first live status.
- **Confirm-signup email installed via Management API:** `scripts/set-auth-email-template.mjs` PATCHes the project's Auth config (`mailer_templates_confirmation_content` + `mailer_subjects_confirmation`) with the branded template; needs `SUPABASE_ACCESS_TOKEN` in `.env.local`. Verified live (logo + button + subject, `mailer_autoconfirm=false`).
- **Contact number at registration:** sign-up now collects a required contact number; stored on `customers.contact_number` via `handle_new_user` from signup metadata (migration `0022`), and shown on the admin Approvals card. `signUp` passes `contact_number`.
- **Login footer:** replaced the "KTC Customer Agreement" link with version + copyright — "KTC Online Portal {APP_VERSION} · © {year} KTC Container Terminal Corp." (`src/version.ts`). The agreement is still linked inline during registration.
- **Confirm-signup email:** the repo template already matches the approval email's styling (logo, orange button, links, footer); tweaked the copy for the new `/verify-id` flow. (Paste it into Supabase → Email Templates → Confirm signup to replace the default.)
- **Data-model rename `brokers` → `customers` (migration `0021`):** done now while the system has no real data. Renamed the table plus columns `broker_code → customer_code`, `job_orders.broker_id → customer_id`, `accreditations.broker_id → customer_id`. RLS policies, triggers, FKs, indexes, constraints, and the column default auto-follow the rename; the 10 functions whose bodies named the old table/columns were recreated (function + trigger **names** kept — internal plumbing — so no policy churn). Frontend updated (`.from('customers')`, embedded `:customers(...)`, `customer_code` / `customer_id` fields). Verified end-to-end on the renamed schema (held → release + numbering; functions resolve; 14 policies + 3 triggers intact). The legacy `customers.customer_id` reference column and helper-function names (`current_broker_id`, `broker_is_approved`, …) are unchanged.
- **Migration runner now tracks applied migrations:** `scripts/run-migrations.mjs` records each applied file in a `public._migrations` table and applies only new ones (a table rename can't be made idempotent against a blind re-run of `0001`). Backfilled with 0001–0021. You no longer re-run the whole set each time — add a new `00xx` file and it applies just that one.
- **Customer rename (continued):** user-facing "broker" → "customer" across the admin + portal copy; the admin route is now **`/admin/customers`**; and the legal doc is renamed **KTC Customer Agreement** (`src/content/customer-agreement.md`, party term "Customer", §2 "Customer Conduct") with all in-app references updated. The internal `brokers` DB table and code identifiers are unchanged.
- **Rebrand to "KTC Online Portal":** renamed the user-facing product name from "KTC Job Order portal" / "broker portal" to **KTC Online Portal** — HTML `<title>`, the login tagline ("for accredited customers"), the Home subtitle, both email templates (confirm-signup + approval), the legal-doc Portal definition, and the live approval-email function (migration `0020`). Feature labels ("New Job Order", "My Job Orders") and the internal `broker` data model are unchanged.
- **Dedicated verify-ID page (`/verify-id`):** after confirming their email, a broker lands here (the signup/resend `emailRedirectTo` now points at `/verify-id`) to upload their valid ID. It carries a **required consent tick** — agree to the KTC Broker Agreement (Terms) + **Data Privacy Act (R.A. 10173)** consent, with a hyperlink to `/agreement` — which gates the upload; on upload it records `valid_id_path` + the terms/DPA consent timestamps at the point of submission. It's **not a hard gate**: a "Skip for now — continue to the portal →" link lets them go file (held) job orders, which still can't be processed until verified. Approved / already-has-ID / admin users are redirected to the portal. The portal banner remains a reminder + inline upload fallback.
- **Email-confirmation gate on the portal:** `ProtectedRoute` now blocks an authenticated-but-unconfirmed broker — instead of the portal it renders an **"Awaiting email confirmation"** page (check inbox + spam) with a **Resend confirmation email** button (`supabase.auth.resend`). Staff (`@ktc-staff.local` synthetic logins) are exempt. This backs up Supabase's **Confirm email = ON** setting (verified `mailer_autoconfirm: false`) so the portal can never render for an unverified email. Closes the Lane-A gap where a broker could reach the portal before confirming.
- **Resend email fully wired:** `ktcterminal.com` verified in the `jla.ktcport@gmail.com` Resend account (same account as the sending key); approval-email trigger delivers `200` to non-owner Gmail + Yahoo. Hardened `scripts/set-vault-secrets.mjs` to read `.env.local` over a stale ambient `RESEND_API_KEY` and verify the stored fingerprint.

### 2026-06-09
- **Open-order cap for verified brokers:** an approved broker may have at most **10 open** orders (`submitted`/`processing`) at once; the 11th is blocked with "You have 10 open job orders — contact KTC admin to file more." Completed/cancelled orders free up slots. Generalizes the held-cap into `enforce_order_caps` (migration **`0019_open_order_cap.sql`**). JO numbers are assigned by `nextval` (atomic) so concurrent filing never collides — verified with 5 simultaneous inserts → 5 distinct numbers; `jo_number` UNIQUE is a backstop.
- **Idle auto-logout (broker portal):** brokers are signed out after **10 minutes** of inactivity (`src/lib/useIdleLogout.ts`, wired in `src/components/Shell.tsx`; mouse/key/scroll/touch/click reset the timer, throttled to 1/s). On timeout the session is signed out and the login page shows "You were signed out after 10 minutes of inactivity." Applies to the broker portal only (admin portal unaffected).
- **Anti-spam guards for held orders (ADR-0012):** to stop an unverified broker from spamming held job orders / burning JO numbers — (1) **cap**: a pending broker may keep at most **10** orders on hold (`enforce_held_cap` BEFORE INSERT trigger; the 11th is rejected with a friendly message); (2) **deferred numbering**: held orders carry **no** official `X-######` — `jo_number` is now nullable and assigned by `ensure_jo_number` only when an order reaches a live status (released to `submitted`), so spam/cancelled holds never gap the official sequence (My Job Orders shows "Draft (no number yet)"); (3) **TTL**: `expire_unverified_brokers()` runs **hourly via pg_cron** and rejects pending brokers who confirmed their email >48h ago but never uploaded a valid ID (keyed on the broker's inaction, not admin latency) — rejection cancels their held orders via the status trigger, and they must re-register. Rejected/suspended brokers also get their held orders cancelled. Admin queue (`AllJobOrders`) now excludes `held`. Migrations **`0017_held_spam_guards.sql`** + **`0018_expire_unverified_brokers.sql`**. Verified end-to-end (cap, deferral, release-assigns-number, expire).
- **Pending brokers file job orders as "held" (ADR-0012, revised):** a confirmed broker with `status='pending'` gets the full portal with a `BrokerStatusBanner` (valid-ID upload + consent sync) and can **fill and Submit** a job order — no dead button. The order saves as `status='held'` (shows "Pending approval" in My Job Orders, hidden from the admin queue). Notices throughout (banner, the New Job Order form, the filed-order confirmation, and My Job Orders) tell the broker their orders **can't be processed until they pass final verification by uploading a valid ID**. Migration **`0016_held_job_orders.sql`** adds the `held` status, relaxes the `job_orders` insert RLS to `broker_is_approved() OR (status='held' AND broker_is_pending())`, opens `job_order_lines` insert to the order's owner, and adds a `release_held_job_orders` trigger that flips all a broker's `held` orders to `submitted` when an admin approves them. Brokers have no `UPDATE` policy on `job_orders`, so a held order can't be self-promoted. `PendingPanel` is now the locked screen for `rejected` / `suspended` only. Verified: `held` constraint + release trigger work end-to-end.
- **Approval email (step 5):** when an admin flips a broker to `approved`, a branded "Your account is approved" email is sent via Resend. Server-side only — a `pg_net` trigger on `public.brokers` (`on_broker_approved`) POSTs to the Resend API, reading the API key + From address from **Supabase Vault** (`resend_api_key` / `resend_from`, loaded out-of-band by `scripts/set-vault-secrets.mjs` from the gitignored `.env.local`). Mail failures are swallowed so they never roll back an approval. Migration **`0015_approval_email.sql`** (enables `pg_net`); template mirrored in `docs/email-templates/broker-approved.html`. Verified: trigger fires and reaches Resend — final delivery is gated on the `ktcterminal.com` domain being verified for the active Resend key.
- **Email-confirmation tracker (admin):** broker cards on `/admin/approvals` and `/admin/brokers` now show an "✓ Email confirmed {date}" / "⚠ Email not confirmed" badge. Migration `0014` mirrors `auth.users.email_confirmed_at` onto `brokers.email_confirmed_at` via an `auth.users` trigger (+ backfill). Applied to the KTC DB.
- **Email-confirmation registration flow:** registration now collects full name + email + password + consents (no valid ID at sign-up); the broker confirms via email (Resend, `noreply@ktcterminal.com`), then on first login uploads their valid ID in the pending panel (`src/components/PendingPanel.tsx`) — which also syncs the consent columns from auth metadata. `signUp` sets `emailRedirectTo`. Rationale (ADR-pending): the `valid-ids` storage policy requires a session, so post-confirmation upload keeps the per-user security intact (no anon uploads). Added `docs/email-templates/confirm-signup.html` + `scripts/send-test-email.mjs`. Email = the broker's login identifier (no separate username).
- **Approval workflow — Phase 1 (flow change):** reject-with-reason on `/admin/approvals` (brokers + accreditations; reason required, shown to the broker on the gated panel), and **suspend / reactivate** of approved brokers on `/admin/brokers` (with reason). New broker status `suspended` (gated out automatically). Migration **`0013_approval_workflow.sql`** adds `brokers.decision_reason`, `accreditations.decision_reason`, and `suspended` to the status check — **must be applied to the KTC DB** for reject-reason/suspend to work.
- **Admin consent/ID review:** `/admin/approvals` and the `/admin/brokers` list now show a review row per broker — valid-ID-on-file status plus Agreement version and Terms / Data-Privacy consent badges with dates (green ✓ / amber ⚠). Extracted a shared `src/admin/BrokerReview.tsx`; `AdminRow` gained an `extra` slot.
- **Consolidated legal docs into one Broker Agreement (ADR-0011):** fused Broker IRR + Terms & Conditions + Privacy Notice into a single concise `src/content/broker-agreement.md` centered on confidentiality/NDA + Data Privacy Act (R.A. 10173). Public `/agreement` route (old `/irr` `/terms` `/privacy` redirect there). Registration shows the Agreement **inline (scrollable)** with a "View full ↗" link and **two required ticks** (Terms, DPA consent). Reuses the `0012` consent columns — no new migration. Extracted `MarkdownBody` for inline reuse.
- **Playwright Phase 2 auth harness (ADR-0010):** added `e2e/helpers/session.ts` (`mintSession` — service-role magic-link login, no UI sign-in so CAPTCHA is never disabled) and rewrote `e2e/authenticated.spec.ts` (ST01 Lanes 1–5; 6 role/surface tests + 4 mutation `fixme`). Runs when `E2E_SUPABASE_URL` + `E2E_SERVICE_ROLE_KEY` are set (point at a dedicated test project), skips cleanly otherwise. Setup for both options (test project / prod read-only) in `e2e/README.md`.
- **Terms & Conditions + Data Privacy consent (ADR-0009):** added public `/terms` and `/privacy` pages (single-source Markdown via shared `MarkdownDoc`; Privacy Notice is DPA / R.A. 10173-aware). Registration now has two required consents — (1) Terms & Conditions + Broker IRR, (2) a separate data-privacy consent covering the uploaded valid ID. Versions + timestamps recorded in auth metadata + `brokers` columns via migration `0012`. Footer links on the login page. 10 Playwright Phase 1 tests now. **`0012_broker_consents.sql` must be applied to the KTC DB.** Templates pending KTC/legal finalization.
- **Broker IRR (ADR-0008):** added the Implementing Rules and Regulations. Content in `src/content/broker-irr.md` (`IRR_VERSION` in `src/content/irr.ts`); public `/irr` page (`src/pages/Irr.tsx`, built-in Markdown renderer) + broker-nav link. Registration now requires a "I agree to the IRR (v1)" checkbox; acceptance recorded in auth metadata (always) and on `brokers` columns via migration `0011`. Added 2 Playwright tests (IRR page public; signup requires acceptance) — 10 Phase 1 tests now. **`0011_broker_irr_acceptance.sql` must be applied to the KTC DB.**
- **Flow change (ADR-0007):** disabled per-broker consignee accreditation. The New Job Order page now searches the full consignee master list (debounced server-side typeahead) instead of an accreditation-fed dropdown; any approved broker can pick any consignee. Removed the Accreditation nav link; `/accreditation` now shows a notice (route kept). `accreditations` table + admin features untouched (reversible).
- Added Playwright E2E (`e2e/`, `playwright.config.ts`, `test:e2e` scripts). Phase 1 `smoke.spec.ts` (8 tests) — unauthenticated smoke against the deployed site (routing, login render, protected-route redirects, SPA rewrite, Turnstile mounts + submit gated); all passing. Phase 2 `authenticated.spec.ts` (5 `test.fixme`) — ST01 Lanes 2–5, blocked on a CAPTCHA-free auth path (documented in-file).

### 2026-06-08
- Added the canonical smoke-test template (`docs/smoke-test-template-canonical.md`) and ST01 portal smoke test (`docs/smoke-test-01-portal.md`) covering auth/CAPTCHA, broker onboarding, consignees/accreditation, job orders, and owner-only staff. Preflight P1–P7 verified PASS; lanes 1–5 are manual.

### 2026-06-07
- Added the layered documentation system mirroring jta-sys: `CLAUDE.md` constitution, `AGENTS.md` Codex mirror, `docs/agent/*` modular instruction reference, `docs/adr/` ADR system (template + index + foundational ADRs 0001–0006), `/adr` command, and the `docs/obsidian-vault/` live-memory vault (01-System / 02-Cores / 04-Workflows / 05-Concepts / 06-Sessions / 07-Memory / 09-Future).
- Added Cloudflare Turnstile CAPTCHA to login + registration (`src/components/Turnstile.tsx`), enforced server-side in Supabase Auth. Gated behind `VITE_TURNSTILE_SITE_KEY`.
- Deployed to Vercel with custom domain `portal.ktcterminal.com` (DNS on Vercel). Added `vercel.json` (Vite preset + SPA rewrite).

### 2026-06-05
- Owner-only staff creation (username + password, no email) via `rpc('create_staff')` in admin Settings.
- Consignee accreditation details (address, TIN, 2303 document) + approval workflow + pagination + search/edit/delete/validation/duplicate guard.
- Initial schema: migrations `0001_init` … `0010_create_staff`. Imported 2,488 consignees from `Customer.csv`.

---

Format: keep an `[Unreleased]` section at the top; add a one-line entry per meaningful change under the session date. See `docs/agent/doc-governance.md`.
