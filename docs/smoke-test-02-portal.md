# Smoke Test ST02 — Lifecycle, Payments, Roles, Security (everything since ST01)

**Smoke Test ID:** ST02
**Date authored:** 2026-06-12
**Status:** **CLOSED — 2026-06-16** (superseded by ST03). Preflight P1–P8 PASS (re-run 2026-06-13 post-wave, no regressions); P9 was data setup only. The manual contract lanes (1–11) were never executed as a single signed run — they were overtaken by three later build waves (Tagalog/mobile, the staff-role + per-van X-ray + two-gate completion overhaul, and the SOON clusters), so the order/payment/role lanes no longer match the shipped product. ST02's value was the **UX-findings backlog** (W1–W33, all shipped to prod). The unexecuted contract lanes **roll into ST03** as the pre-launch blind walkthrough. See the **Closeout** section at the bottom. Do not re-run Lanes 1–11 here.
**Target:** https://portal.ktcterminal.com (live, pre-public)
**Covers:** migrations `0011`–`0064` / sessions 4–11 — order lifecycle loops, serving numbers, per-service completion, checker station, payments + invoice, roles & gates, Logs, observability, MFA, ID retention, **plus the Operations & JO-Modernization wave (Lanes 9–11): the operations role, vessel schedule + free-days + CSV import + calendar + Viber snapshot, the vessel/voyage dropdown on filing, RPS assessment + per-move billing, and the two-payment running balance + Cleared-for-release badge**.
**Refreshed:** 2026-06-13 — added Lanes 9–11 for the operations / vessel-schedule / RPS-billing wave (migrations 0056–0064).

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | failsafe; 2FA target of Lane 7 |
| Admin (fallback) | `jla.ktcport@gmail.com` | plain admin since 2026-06-12 |
| Test customer | a throwaway email you control | created in Lane 1 |
| Cashier / Checker | created in Lane 6 via Settings | e.g. `st02cash` / `st02check` |
| Operations | created in Lane 9 via Settings | e.g. `st02ops` (assess RPS, confirm X-ray, vessels) |

> Emails consume the Resend free tier (100/day) — the email checks below send ~5 total.
> Lanes assume **service rates are configured** (Settings → Service rates & fees) — set non-zero X-ray rate + admin/print fees first or Lane 5 shows ₱0.

---

## Preflight gate (automated — run first)

| Check | Expected | Result |
|---|---|---|
| P1 TypeScript (`npx tsc --noEmit`) | 0 errors | ✅ PASS (2026-06-13, v1.1.0) |
| P2 Smoke suite vs prod (`BASE_URL=https://portal.ktcterminal.com npx playwright test smoke`) | 11/11 | ✅ PASS — 11 passed against the live **v1.1.0** deploy (2026-06-13; CSP active) |
| P3 Deploy health (`curl` root) | `200` | ✅ PASS (2026-06-13) |
| P4 Bundle target | prod ref `mdlnfhyylvapzdubhyic` present; test ref + jta-sys ref ABSENT | ✅ PASS (`index-CmVyn4l-.js`, v1.1.0 label confirmed in bundle) |
| P5 Turnstile site key inlined | present | ✅ PASS (2026-06-13) |
| P6 SPA rewrite (deep link `/admin/job-orders`) | `200` | ✅ PASS (2026-06-13) |
| P7 CAPTCHA server-enforced (tokenless password grant) | `captcha_failed` | ✅ PASS (2026-06-13) |
| P8 Playwright Phase 2 (test project) | 16/16 | ✅ PASS (re-run 2026-06-13 **after the operations/vessel/RPS wave**) — **16 passed / 0 failed**, no regressions (5 skipped = 4 `fixme` mutation stubs + CAPTCHA-mount, off on localhost). |
| P9 Data setup for the lanes | rates, payment details, + new-wave config | ⚠️ **DATA SETUP NEEDED** (2026-06-13): X-ray service rates + admin/print fees ARE set (₱2,918 · ₱100 · ₱50). Still to fill: **payment details** (bank/GCash/QR, step 5.0); **a shipping line + free-days** (10.0); **a few vessels** (10.1); **RPS per-move rates** (11.0); and create an **Operations user** (9.1). |

**Preflight (2026-06-13, post-wave): GO for manual lanes** — P1–P8 green (Playwright re-run **16/16, no regressions** on the live deploy ref `mdlnfhyylvapzdubhyic`); P9 is data setup (payment details + the new-wave config). Lanes 1–11 ready to walk.

---

## ST02 walkthrough — UX findings & fixes (2026-06-14)

Owner walked the live portal manually ("blind") and raised UX findings as they
went. Each was fixed and shipped to prod the same day (frontend-only — no DB
migrations). Logged here so the ST02 record is complete.

| # | Finding / request (where) | Change shipped | Commit |
|---|---|---|---|
| W1 | Customers had no way to see the vessel schedule (Lane 10 is ops-only) | **Read-only Vessel Schedule for customers** — table + month calendar, current-only default, `/vessels` + nav + Home tile (writes still ops/admin only) | `4643f3c` |
| W2 | Portal English-only; brokers/staff want Filipino | **Tagalog i18n** — `t()` across all UI, EN/FIL toggle (nav + login), per-browser, English fallback; **tours + all 5 manuals** localized too (Agreement + emails stay English by decision) | `ab7629e`, `6e33020` |
| W3 | The demo flashed in English before any language choice (Lane 1.3) | **First-run language chooser** modal after sign-in, **before** the tour; the demo then runs in the chosen language. Nav toggle / login choice also satisfies it | `1591b8a` |
| W4 | UI not optimized for mobile/tablet; forms need scrolling (esp. filing) | **Mobile pass wave 1** — responsive `.ktc-page`, sticky action bar, `Wizard` (desktop = 1 form, phone = steps); **New Job Order → 3-step wizard on phones** | `b8460c7` |
| W5 | Desktop too tall; should fit one screen | **Desktop compaction** — global density (nav/title/input/btn) + `.ktc-fields` 2-column layout; New Job Order pairs fields to fit one screen | `3bc84a6` |
| W6 | Language switch on the login page not noticeable | Labeled it **🌐 Language / Wika**, then trimmed to a **globe icon + EN/FIL** | `440241e`, `522d619` |
| W7 | Registration consent clause too long (Lane 1.1) | Shortened the tick label to "…the **KTC Customer Agreement** — including the Terms & Conditions, and my consent to KTC processing my personal data." (full Terms/NDA/DPA still in the linked Agreement) | `ff1b424` |
| W8 | Footer showed commit hash + build date | Footer now shows just **v1.1.0**; commit+date moved to a hover tooltip (still traceable) | `f65861b` |
| W9 | Forgot-password could be requested repeatedly (Lane 7.4 area) | **5-min per-email resend cooldown** with a `m:ss` countdown ("Resend in 4:07") + spam-folder hint. (Supabase server-side rate-limit + CAPTCHA were already the real backstops; this is UX) | _2026-06-14_ |
| W10 | Home demo-tour copy (Lane 1.3) — reword for clarity | Rewrote all 6 home-tour steps (EN + FIL): "container terminal services from the comfort of your home", clearer verify/held wording, dropped "Your main action", "Track your orders", simpler account step. Later: "Madayaw!" greeting (EN+FIL), "Get verified", and per-step FIL tweaks | _2026-06-14_ |
| W11 | Translation review hard to do in a CSV | Built `scripts/export-translations.mjs` → `docs/translations-review.{md,csv}` (829 strings); switched to an in-app blind walkthrough for review | _2026-06-14_ |
| W12 | Tour: featured tile sat at the bottom | Tour scrolls the featured element to the **top** (hero) and pins the helper card to the **bottom** | _2026-06-14_ |
| W13 | Mobile top bar doesn't scale (Lane chrome) | **Hamburger → slide-in drawer** on phones (both shells); desktop top bar unchanged. Portaled to body to fix a backdrop-filter containing-block bug | _2026-06-14_ |
| W14 | "Select valid ID" banner too big | BrokerStatusBanner compacted to a single line + inline "Upload valid ID →" | _2026-06-14_ |
| W15 | Home welcome showed the BR-id; "Quick tour" FIL | Removed the BR-id chip from Home (stays on profile); "Quick tour ▸" FIL = English | _2026-06-14_ |
| W16 | New Job Order wording / vessel / rates FIL | Subtitle → "File for container terminal services." (EN+FIL); "Vessel Schedule" + "Rate Calculator" FIL = English; tile desc → "I-estimate ang charges bago mag-file" | _2026-06-14_ |
| W17 | **Entry (C-) number must be required** (Lane 4) | Entry Number now **required** — gates Next on the wizard + submit; Consignee + Entry marked `*` | _2026-06-14_ |
| W18 | CSV review edits applied | 16 Filipino-only + 2 English-key edits from the owner's CSV pass wired through source + dict | _2026-06-14_ |

**Still open from this pass (not yet built):**
- Mobile **wave 2** (registration → wizard; Payment / Verify ID / Account → dense + sticky) and **wave 3** (admin data tables → phone card lists) — owner holding for a device test first.
- Roll the desktop **2-column "use width"** treatment across the remaining forms (Login, Account, Payment, admin Settings/forms) — pattern proven on New Job Order.

---

## Lane 1 — Onboarding + demo tour

| # | Step | Expected | Result |
|---|---|---|---|
| 1.0 | (Optional) pick **🌐 EN / FIL** on the login card before signing in | the whole app + the upcoming demo switch language; choice persists per browser | |
| 1.1 | Register a throwaway customer (name, contact, email, pw, scroll-agree + **shortened** consent tick, CAPTCHA) | confirmation email arrives (branded); tick reads "…KTC Customer Agreement — including the Terms & Conditions, and my consent to KTC processing my personal data." (W7) | |
| 1.2 | Confirm email → sign in | lands on `/verify-id` (DPA tick + ID upload, or Skip) | |
| 1.3 | Skip to portal → Home — **first-run language chooser** appears (if not already chosen) | "Choose your language / Pumili ng wika" → pick EN/FIL → **Quick tour auto-opens in that language** (6 steps, dots, Skip); closing + reloading does NOT reopen; "Quick tour ▸" replays. On a phone the home tour walks the tiles per-page (W3, W4) | |
| 1.4 | File a JO while pending | saved as **held** ("Draft (no number yet)"), notice says verify to process | |
| 1.5 | Upload valid ID (banner) | admin Approvals shows the account with ID + consent badges | |
| 1.6 | Footer → **User Manual** | customer guide renders (`/manual`); "Print this guide" opens the print dialog | |

## Lane 2 — Customer filing & serving numbers

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Admin approves the test customer | approval email arrives; held order flips to **submitted** with `JO-######` | |
| 2.2 | Order shows serving chips | per-service line number (e.g. `X-Ray #N`); **Now serving** strip on My Job Orders | |
| 2.3 | File a 2nd JO using **Bulk paste** (3 containers, mixed services) | one row per container; duplicates skipped note | |
| 2.4 | My Job Orders filters | Active default; Needs action / Completed / Closed / All switch server-side; >10 orders paginate 10/page | |
| 2.5 | Cancel the 2nd JO (confirm prompt) | status cancelled; its serving numbers vacate (burned, not reused) | |

## Lane 3 — Admin processing loops

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | Admin: Hold for info (with note) on JO #1 | customer gets **on-hold email**; order shows note + "Respond & resubmit" | |
| 3.2 | Customer responds + resubmits | back to submitted, **keeps its serving number**; admin sees "Customer reply" | |
| 3.3 | Admin: Reject (recoverable, note) | **rejected email** says fix-and-resubmit; customer resubmits → back of line (new number); admin "↩ Restore #N" puts the old number back | |
| 3.4 | Admin: per-service ✓ on a mixed-service JO | first ✓ → processing; JO completes **only when all lines done**; chips update | |
| 3.5 | 🕘 History on the queue card | filed / status changes / service done events with actor names + timestamps | |
| 3.6 | Admin "New JO" tab: file on behalf (pick test customer) | files straight to submitted; serving number assigned; success panel → Print slip works; History shows the admin as filer | |

## Lane 4 — Checker station (tablet)

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Sign in as checker (after Lane 6 creates one) → lands on `/admin/checker` | queue sorted by X-ray line number; Now-serving strip | |
| 4.2 | Lookup a container number from an open X-ray JO | card shows **NOT CLEARED · X-ray pending** | |
| 4.3 | Confirm X-ray done | stamps date/time; JO completes (or stays open if other services pending — leaves the checker queue either way) | |
| 4.4 | Lookup the same container again | **CLEARED · timestamp** | |

## Lane 5 — Payments, calculator, invoice

| # | Step | Expected | Result |
|---|---|---|---|
| 5.0 | Owner: Settings → rates card shows **🔒 Locked** → unlock → enter real X-Ray rate + admin/print fees → drag a row to reorder → Save; fill **Payment details** (bank, account, GCash) + upload QR | inputs disabled until unlocked; VAT shown read-only "12% · statutory · fixed"; Save re-locks; values persist on reload (clears P9) | |
| 5.0b | Owner: catalogue — **+ Add service** (e.g. `ST02 Temp`, VATable) → confirm it appears in the customer JO form selector → toggle **inactive** → **✕ delete** (two-step) | active service joins the live catalogue (new filings only); deactivated → gone from new filings; delete succeeds only because it was never used by an order line | |
| 5.1 | `/calculator` as customer | rates match Settings (in the dragged order); X-Ray VAT 12%; flat admin + print fees not VATed | |
| 5.2 | "View charges & pay" on a JO | same computation; bank/GCash details + QR render | |
| 5.3 | Upload a payment slip (try a >5 MB image) | auto-compressed under 5 MB; status → submitted; admin queue shows "Payment proof to review" | |
| 5.4 | Admin: view slip (modal w/ Print + Save), **Reject** with note | customer gets **payment-rejected email** linking to the pay page; can re-upload | |
| 5.5 | Re-upload → admin **Confirm** | customer pay page shows confirmed | |
| 5.6 | Record invoice on a completed JO — try garbage (`abc`), then `orinv135921` + pad `94303` | garbage rejected with hint; valid pair saves as `OR-INV-00135921` · `#94303`; chip **PAID** | |
| 5.7 | Record a `BI-INV-…` on another completed JO | chip **BILLED** (blue); customer sees "Billed on account" | |
| 5.8 | "Unpaid · completed" view | completed-without-invoice orders with `unpaid Nd` aging chips; recorded ones leave the view | |

## Lane 6 — Roles & gates

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | Owner: Settings → create `st02cash` (cashier) + `st02check` (checker) | both appear in staff list with role badges | |
| 6.2 | Sign in as cashier | lands on Job Orders; nav shows ONLY what the matrix allows (no Approvals/Settings/2FA); can record invoice, can't approve/hold/reject | |
| 6.3 | Owner: toggle a gate (e.g. cashier `view_job_orders` off) → cashier reloads | access disappears (server-side: queue empty/denied, not just hidden) — then toggle back | |
| 6.4 | Owner: reset `st02cash` password from Settings | new password works | |
| 6.5 | Per-role tours & manuals: first sign-in of cashier / checker / admin; then nav → **Manual** | role-matched quick tour auto-opens once per browser (✨ in the nav replays it); Manual tab shows the cashier/checker their own guide; admin/owner get tabs for all four guides (Admin · Cashier · Checker · Customer) | |

## Lane 7 — Security & monitoring (full feature checklist)

> **Inventory under test:** server-enforced CAPTCHA (P7) · email-confirmation gate (Lane 1) · login lockout · idle timeouts + warning prompt · single session per account (last-login-wins, MFA-guarded, dead-session RLS cut-off `0055`) · TOTP 2FA with server-side aal2 · RLS + role-permission matrix (Lane 6) · protected-field guard + auto-suspend (`0046`/`0047`) · security-events log + 15-min watchdog · browser security headers (CSP etc.) · ID retention windows (8.4) · owner failsafe (invite-only staff, server-only `is_owner`).

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Owner: 2FA tab → enroll (scan QR, verify code) | "2FA is ON"; sign out → sign in → **code challenge** appears; wrong code rejected; right code lands in admin | |
| 7.2 | Cashier opens `/admin/security` directly | "available for admin and owner accounts only" message | |
| 7.3 | Idle: leave the customer portal untouched 14 min | **"Are you still there?"** prompt appears; any click/movement dismisses it and resets the timer; ignore it 1 more min → signed out, login notice says "after 15 minutes" (closed-browser return after 15 min also signs out) | |
| 7.3b | Idle (staff): same on the admin portal (any role incl. cashier/checker) | warning at 59 min, sign-out at 60 with "after 60 minutes" notice | |
| 7.3c | Single session: sign the test customer in on a second browser (or private window) | first browser signs out ≤1 min (on focus: instantly) with "signed in on another device" notice; second browser unaffected. For the 2FA owner: password alone on browser 2 does NOT kick browser 1 — only completing the 6-digit verify does | |
| 7.3d | Eviction audit: after 7.3c, owner opens Logs → Security | "Session evicted — account signed in on a new device" entry for the test customer; **no** owner alert email for it (routine event) | |
| 7.3e | (Advanced, optional) Dead-session cut-off: capture the evicted browser's access token *before* 7.3c, then after eviction replay it against REST (`curl …/rest/v1/job_orders -H "apikey: <anon>" -H "Authorization: Bearer <evicted JWT>"`) | empty result / denied — the deleted session fails `session_alive()` inside every RLS helper, even though the JWT itself is unexpired | |
| 7.4 | Login lockout: 5 wrong passwords | 60s cooldown message | |
| 7.4b | Forgot password → send reset link, then immediately try again (W9) | button holds **5 min** with a "Resend in 4:07" `m:ss` countdown + spam-folder hint; survives a page refresh (per-email, localStorage); Supabase server-side rate-limit + CAPTCHA remain the real backstops | |
| 7.5 | (Advanced, optional) As the test customer, send a crafted PATCH to set `is_admin=true` on own row (curl + access token) | change reverted; account **auto-suspended** + sessions revoked; owner gets 🚨 email ≤15 min; Logs → Security shows the attempt. Reinstate the account afterwards. | |
| 7.6 | Logs tab (owner) | all four views populated from this run (orders / security / errors / emails & sync) | |
| 7.7 | Settings → System health → Run health check | all 5 cron jobs listed with recent runs; outbound calls show HTTP 200s; this run's emails listed | |
| 7.8 | Security headers: `curl -I https://portal.ktcterminal.com` | `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` all present (+ existing HSTS) | |
| 7.9 | CSP didn't break anything: load login (CAPTCHA widget renders), fonts look right (Schibsted Grotesk, not Times), view/print an uploaded ID and a payment slip, pay page shows the QR image | all render normally; Logs → Client errors shows **no** CSP violation errors from this run | |
| 7.10 | URL gating: logged out, open `/job-orders`, `/admin`, `/account` directly; as the test customer open `/admin/job-orders` | logged out → `/login`; customer at `/admin/*` → bounced to `/` (no admin data flash) | |

## Lane 8 — Housekeeping (observe, no action)

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | 🗄 Archive paid & completed (or wait for Monday cron) | completed+invoiced orders leave default views; visible under Archived; customer history intact | |
| 8.2 | Monday 00:15 PH carry-over (observe next Monday) | open orders re-queued at the FRONT of the new week's lines in old order | |
| 8.3 | BOC mirror | BLOCKED until Google service-account creds are set (`scripts/setup-boc-mirror.mjs`) — expected | |
| 8.4 | ID retention (`0052`/`0053`): open the test customer's ID in the file viewer <24h after upload, then check again later | <24h: **no 🗑** (storage policy blocks deletion — review window); 24h–3d: 🗑 appears (two-step delete works); 3d: auto-purged (lazy admin-load purge + hourly `purge_expired_ids` cron — cron is a silent no-op until `scripts/setup-id-purge.mjs` puts the service key in Vault) | |

## Lane 9 — Operations role (NEW wave · migrations 0056/0060/0061)

| # | Step | Expected | Result |
|---|---|---|---|
| 9.1 | Owner: Settings → create `st02ops` with the new **Operations** role | appears in staff list with an **Operations** badge | |
| 9.2 | Sign in as `st02ops` | lands on **X-ray Checker**; nav shows ONLY Job Orders (read-only) · X-ray Checker · Vessels · Manual — no Approvals/Customers/Consignees/New JO/Settings/2FA/Logs | |
| 9.3 | First sign-in tour + Manual tab | Operations quick tour auto-opens once (✨ replays); Manual shows the **Operations** guide | |
| 9.4 | Operations opens the Job Orders queue | can **view** orders but has **no** process/hold/reject/complete actions (read-only) | |
| 9.5 | Owner: Settings → Roles & gates | an **Operations** column shows view_job_orders / confirm_xray / vessel_schedule / assess_rps ticked; money + admin unticked | |

## Lane 10 — Vessel schedule (NEW wave · migrations 0057–0059)

| # | Step | Expected | Result |
|---|---|---|---|
| 10.0 | Owner/admin: Settings → **Free storage days per shipping line** → add a line (e.g. `SITC`, import 5, export 7) → Save | persists on reload (admin-only) | |
| 10.1 | Operations: **Vessels** → add a call (`26TEST01`, vessel, voyage, line SITC, arrival, finish discharging, berth) → Add call | row shows with a **computed Last Free Day** (finish + 5) and a **current** badge | |
| 10.2 | Operations: ⬇ Template → fill 2–3 rows → ⬆ Import CSV | rows upserted by **vessel-visit**; re-importing the same file updates (no duplicates); unknown lines flagged in the report | |
| 10.3 | Calendar view toggle | month grid shows each call on its arrival date; ‹ › / Today navigate | |
| 10.4 | 📸 Snapshot | a branded PNG of **active** vessels downloads (desktop) / opens the share sheet → Viber (mobile) | |
| 10.5 | Customer: New Job Order → **Vessel & Voyage** dropdown | lists only **current** vessels; "vessel not listed" reveals manual name + voyage | |
| 10.6 | An expired call (last free day passed) | drops off the customer dropdown automatically; still visible in Vessels under "show past/cancelled" | |
| 10.7 | Admin: **New JO** (file-on-behalf) → vessel dropdown | same dropdown + escape hatch; the filed order carries the vessel/voyage | |

## Lane 11 — RPS assessment, per-move billing & balance (NEW wave · migrations 0062/0063)

| # | Step | Expected | Result |
|---|---|---|---|
| 11.0 | Owner: Settings → **RPS per-move rates** → set Shifting / Trucking / Lift On (+ Stripping/Stuffing) → Save | persists | |
| 11.1 | Operations: X-ray Checker → a JO card → **Assess RPS** → "No RPS needed" | card shows a **No RPS** chip; the customer total is unchanged | |
| 11.2 | Operations: another JO → **Assess RPS** → enter moves (e.g. Trucking 6) + optional RPS doc upload → **Save — needs RPS** | **RPS needed** chip; the per-move charge is computed | |
| 11.3 | Customer: pay page for the RPS JO | shows **Total** (X-ray + RPS), **Balance due = Total**, and separate **X-ray** and **RPS** payment sections | |
| 11.4 | Customer uploads the **X-ray** slip → admin **Confirm X-ray payment** | **Paid** rises by the X-ray amount; **Balance due** drops to just the RPS | |
| 11.5 | Customer uploads the **RPS** slip → admin **Confirm RPS payment** | Balance shows **PAID**; both sections confirmed | |
| 11.6 | Admin queue chips | "RPS payment to review" appears on submit; Confirm/Reject (with note) works for the RPS payment separately | |
| 11.7 | **Cleared for release**: confirm X-ray done (Checker) **and** balance fully paid | the pay page shows the ✓ **Cleared for release** badge only when **both** are true | |

**Teardown:** suspend/reject the throwaway customer, revoke `st02cash`/`st02check`/`st02ops`, remove test JOs if desired (or archive). **Go-live note:** prod was wiped (session 10p) so the first *real* order is meant to be `JO-000001` — this run will consume `JO-000001+` and `BR-000001+`, so after teardown delete the test orders/customer and reset `jo_number_seq` / `broker_code_seq` (only safe at zero orders). Test IDs uploaded during the run can't be manually deleted for 24h (`0053` window) — the 3-day purge clears them regardless.

## Lane 12 — Mobile blind walkthrough (2026-06-15)

Findings (W19–W30) from an on-device mobile blind test, with the fix made the same session. **All fixed locally — pending a deploy (`git push` → Vercel) to verify on `portal.ktcterminal.com`.** DB migrations `0067`/`0068` already applied to prod.

| # | Finding | Fix | Status |
|---|---|---|---|
| W19 | Demo tour re-fired on every login | `mark_tour_seen` was `void supabase.rpc(...)` — supabase-js builders are lazy, so it never sent. Added `.then()`. Same bug fixed in `errorReporting.ts` + `Account.tsx`. | ✅ fixed |
| W20 | Single-session "no kick" — logging in on a 2nd device didn't sign the first out | Server-side eviction *was* working (≤60s poll). Built the requested device-conflict UX: new-login **Terminate/Cancel** prompt (`ProtectedRoute` gate + `has_other_live_session`, migration `0067`), instant **realtime** kick + in-session "signed out elsewhere" overlay on the old device. | ✅ built |
| W21 | New Job Order demo only spotlighted step 1 (mobile wizard paginates) | Tour now **drives the wizard** through all 3 steps; step 1 covers consignee **+** entry with updated copy; resets to step 1 when done. | ✅ fixed |
| W22 | Entry / vessel / voyage / container not uppercase | Forced UPPERCASE on input **and** save (print slip + lists too). | ✅ fixed |
| W23 | Bulk editor "limited to 32" vans | No cap exists (a 41-line JO already exists; `container_number` unbounded). Added a live count + a scroll area so 150–200 vans render cleanly. **Re-verify on device** post-deploy. | ✅ no cap + UX |
| W24 | "Vessel not listed" — unclear what happens | Built **pending-vessel request workflow** (migration `0068`): every unlisted filing auto-raises a request → ops review panel on Vessel Schedule (**Approve & link** all waiting JOs / **Reject** with note). | ✅ built |
| W25 | `/verify-id` upload copy too long; consent note misaligned on mobile | Shortened to one clear sentence + a small caveat line; consent row forced left-aligned. | ✅ fixed |
| W26 | Hamburger not clearly on the right / not obviously a menu | Pushed right (mobile flex spacer) + bordered pill with a **"Menu"** label. | ✅ fixed |
| W27 | EN/FIL pills too prominent on mobile | Moved into the drawer (under a "Language" heading); hidden from the mobile bar. | ✅ fixed |
| W28 | Lost the per-page tour-replay button on mobile | Added a visible **?** quick-tour button in the rail (kept on phones). | ✅ fixed |
| W29 | Logo/top rail too small; dashboard 5 tiles needed scrolling | Larger logo (40px) + taller rail; home tiles are **2-up square tiles** on mobile (icon+title, desc hidden) so all fit one view. | ✅ fixed |
| W30 | "Welcome, {name}" + footer "didn't look nice" | Tighter responsive greeting; revamped footer (pill links + branded meta line). | ✅ revamped (iterate w/ screenshot if needed) |

**Open follow-ups:** customer-side "vessel pending review" badge (MyJobOrders doesn't show the vessel yet); uppercase the admin file-on-behalf entry/vessel inputs; W25 alignment + W30 footer/greeting are best-guess polish — confirm against a device screenshot.

### Password reset + email deliverability (W31–W33)

| # | Finding | Fix | Status |
|---|---|---|---|
| W31 | Forgot-password parked the user on a resend timer | On success, redirect to **/login** with a "check inbox/spam" notice (`ktc_reset_sent`); per-email resend throttle still kept in localStorage. ResetPassword already returned to login. | ✅ pushed |
| W32 | No admin-side reset when a customer can't self-reset | **Admin/owner** can mint a one-time **copyable set-password link** on `/admin/customers/:id` (no email — sendable via Viber/SMS, spam-proof). Edge Function `admin-reset-link` (owner/admin-gated; refuses the owner account; uses auto-injected `SUPABASE_URL`/`SERVICE_ROLE_KEY`) **deployed to prod**. Two reset paths now: self-service email + admin link. | ✅ deployed |
| W33 | Auth emails flagged as spam | Confirmed sending via **Resend** (From `@ktcterminal.com`); DKIM/DMARC/SPF all present and DMARC passes → it's **new-domain reputation**, not a config break. Levers (no code): mark "Not spam" + add to contacts; add DMARC `rua` reporting (`v=DMARC1; p=none; rua=mailto:dmarc@ktcterminal.com; fo=1`); optional root SPF `v=spf1 include:amazonses.com ~all`. | ⏳ user action (DNS/inbox) |

**Reset-link expiry:** Supabase recovery links are **single-use** and expire (**default ~1h**); a newer link invalidates the old. Configurable in Auth → Email → OTP Expiration.

**Ops note (creds):** the old `.env.local` `SUPABASE_ACCESS_TOKEN` was expired (401) and briefly leaked in-session — confirmed **revoked/dead** and replaced with a fresh `sbp_…` PAT (which also un-blocks `set-auth-email-template.mjs` / `set-vault-secrets.mjs`). Edge-function deploys need the CLI authed in **PowerShell** (`supabase login`) or a valid PAT in `.env.local` + `--use-api` (no Docker); the Git Bash tool can't read the PowerShell keyring login.

---

## Closeout (2026-06-16)

**Final status:** CLOSED — superseded by **ST03** (`docs/smoke-test-03-portal.md`).
**Environment of record:** live `https://portal.ktcterminal.com`, DB migrations through **0104**, Vercel commit **1b2e824**.

### What ST02 was for
ST02 was authored (2026-06-12) and refreshed (2026-06-13) to verify everything built since ST01 across migrations `0011`–`0064` / sessions 4–11: the order-lifecycle loops, weekly serving numbers, per-service completion, the checker station, payments + invoice recording, roles & gates, Logs/observability, MFA, ID retention, and the operations / vessel-schedule / RPS-billing wave.

### Why it is being closed rather than run to green
The automated preflight (P1–P8) passed and stayed green on the live deploy, and ST02 successfully drove the **2026-06-14 "blind" UX pass** (W1–W18) plus the **2026-06-15 mobile pass** (W19–W30) and the **password-reset / deliverability** items (W31–W33) — every one of those was fixed and shipped to prod. That backlog is ST02's real deliverable and stands.

The manual **contract Lanes 1–11**, however, were never executed and signed off as one coherent run (Results columns stayed blank; P9 data setup was the gate). Between then and 2026-06-16 the product moved past what those lanes describe — three build waves landed (migrations `0078`–`0104`):
- **staff-role overhaul** — added the **CSR** role, split `process_job_orders` into `accept_orders` / `hold_reject_orders` / `complete_orders`, and re-routed role landings (csr→`/admin/support`, operations→`/admin/job-orders`);
- **per-van X-ray (checker-only)** + **two-gate completion** (all services done AND base payment AND RPS-if-needed AND every supplement paid) — replacing ST02's single-`payment_status` "Cleared for release" model;
- **the SOON clusters** — generalized **one** Priority number per JO (Lane 2's per-service serving chips no longer match), **additional-charge supplements** (`JO-####-A/B/C`) with the under-review re-complete loop, **staff edit details**, **comment escalation**, and **verify-QR** slips with PENDING/COMPLETED watermarks + the public `/verify/:id` cross-check page.

Re-running ST02's lanes as written would test stale flows. Rather than fabricate PASS marks, the lanes are dispositioned below and the live behaviours are carried forward into ST03 against the current build.

### Lane disposition

| Lane | ST02 coverage | Disposition |
|---|---|---|
| Preflight P1–P8 | TS / build / deploy health / bundle target / Turnstile / SPA rewrite / CAPTCHA / Playwright | **PASS (2026-06-13)** — last green run; ST03 re-runs its own preflight against commit 1b2e824 |
| Preflight P9 | lane data setup (rates, payment details, vessels, RPS, ops user) | **N/A** — setup task, not a test; folded into ST03 lane preconditions |
| UX findings W1–W33 | blind-walkthrough UX backlog (desktop, mobile, reset/deliverability) | **DONE — shipped to prod** (kept as the historical record; W33 DNS/inbox is user action) |
| 1 — Onboarding + demo tour | register → confirm → verify-id → tour → held JO | **Carried to ST03 Lane A** (re-execute on current build) |
| 2 — Customer filing & serving numbers | per-service serving chips, bulk paste, filters, cancel | **SUPERSEDED** — one generalized **Priority #N** per JO now (0100); re-spec in **ST03 Lane A** |
| 3 — Admin processing loops | hold/resubmit, reject/restore, per-service ✓, history, file-on-behalf | **SUPERSEDED** — split accept/hold-reject/complete gates + `staff_transition_order`; re-spec in **ST03 Lanes B / G / H** |
| 4 — Checker station | container lookup + single X-ray "done" stamp | **SUPERSEDED** — per-van confirm + e-signature, checker-only (0087); re-spec in **ST03 Lane C** |
| 5 — Payments, calculator, invoice | slip upload, confirm/reject, invoice recording | **Carried (partly superseded)** — base online proof + cashier confirm + walk-in now; re-spec in **ST03 Lanes D / E** |
| 6 — Roles & gates | cashier/checker create + matrix toggles | **SUPERSEDED** — CSR added, gates split, new landings; re-spec in **ST03 Lane J** |
| 7 — Security & monitoring | CAPTCHA, idle, single session, MFA, lockout, headers, RLS | **Carried — still current**; condensed into **ST03 Lane K** (full inventory stays here for reference) |
| 8 — Housekeeping | archive cron, Monday carry-over, BOC mirror, ID retention | **Carried (observe-only)** — unchanged; spot-check in ST03 teardown, not a blind-walk lane |
| 9 — Operations role | ops user, ops landing, read-only queue, gates column | **SUPERSEDED** — ops now lands `/admin/job-orders`, has accept/complete/hold-reject, lost confirm_xray; re-spec in **ST03 Lanes B / J** |
| 10 — Vessel schedule | free-days, vessel calls, CSV import, calendar, snapshot, dropdown | **Carried — still current** (not re-walked in ST03's launch set; covered by ST03 Lane A vessel dropdown + left as a standing ops check) |
| 11 — RPS assessment & balance | assess RPS, per-move billing, two-payment balance, cleared-for-release | **Carried (extended)** — RPS now one input to the **two-gate** release; re-spec in **ST03 Lanes B / E** |
| 12 — Mobile blind walkthrough | W19–W30 device findings | **DONE — fixed + deployed**; mobile is now the default UX, exercised throughout ST03 |

### Defects tracker (ST02)

| ID | Lane / Route / Action | Severity | Issue Summary | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| (none open) | — | — | All UX findings W1–W33 were fixed + shipped the same session; no contract-lane defects were logged because the lanes were superseded before a signed run. | — | — | CLOSED | commits in the W-tables above |

### Final summary

| Lane | Status | Key Findings | Go / Hold |
|---|---|---|---|
| Preflight (P1–P8) | PASS (2026-06-13) | green on the live deploy, no regressions across the operations/vessel/RPS wave | Go |
| UX backlog W1–W33 | DONE | blind-walkthrough + mobile + reset/deliverability fixes all shipped to prod | Go |
| Contract Lanes 1–11 | SUPERSEDED → ST03 | overtaken by migrations 0078–0104 (CSR/split gates, per-van X-ray, two-gate, supplements, verify-QR); re-spec'd against the current build in ST03 | Hold → execute in ST03 |

**Overall go / no-go:** **ST02 CLOSED.** Automated health + the UX backlog are GO; functional sign-off for launch is **deferred to ST03**, which is the pre-launch blind walkthrough against the current build (migrations through 0104, commit 1b2e824).
