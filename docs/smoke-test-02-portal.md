# Smoke Test ST02 — Lifecycle, Payments, Roles, Security (everything since ST01)

**Smoke Test ID:** ST02
**Date authored:** 2026-06-12
**Status:** IN PROGRESS — preflight P1–P8 PASS (P8 cleared after key regen); P9 (rates + payment data entry) pending; manual Lanes 1–8 in progress
**Target:** https://portal.ktcterminal.com (live, pre-public)
**Covers:** migrations `0011`–`0055` / sessions 4–10r — order lifecycle loops, serving numbers, per-service completion, checker station, payments + invoice, roles & gates, admin file-on-behalf, Logs, observability, MFA, auto-suspend, demo tour, pricing lock + statutory VAT, service catalogue management, ID retention (24h guaranteed / 3-day purge).
**Refreshed:** 2026-06-12 after sessions 10k–10q (Agreement v2, pricing lock `0050`, catalogue `0051`, ID retention `0052`/`0053`, prod wiped clean for go-live — first real order will be `JO-000001`).

## Result codes

PASS / AMBER / FAIL / BLOCKED / N/A (per `docs/smoke-test-template-canonical.md`).

## Test accounts / data

| Role | Identity | Notes |
|---|---|---|
| Owner | `jlawrenceang@gmail.com` | failsafe; 2FA target of Lane 7 |
| Admin (fallback) | `jla.ktcport@gmail.com` | plain admin since 2026-06-12 |
| Test customer | a throwaway email you control | created in Lane 1 |
| Cashier / Checker | created in Lane 6 via Settings | e.g. `st02cash` / `st02check` |

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
| P8 Playwright Phase 2 (test project) | 16/16 | ✅ PASS (2026-06-13, second run) — keys regenerated to the new `sb_publishable_`/`sb_secret_` format in `.env.local`; **16 passed / 0 failed** against a localhost test-project build (5 skipped = 4 `fixme` mutation stubs + CAPTCHA-mount test, intentionally off on localhost). |
| P9 Lane-5 pre-reqs: service rates + payment details configured | non-zero rates; bank/GCash/QR filled | ⚠️ **NOT READY** — re-verified 2026-06-13: 0 rates set, 0 fees set, payment details empty. Fill via step **5.0** before Lane 5. |

**Preflight (2026-06-13, v1.1.0): GO for manual lanes** — P1–P8 green (P8 cleared 2026-06-13 after key regeneration); P9 is the Lane-5 data entry (step 5.0). Security telemetry at start: 0 security events (7d), 0 client errors (24h), 0 outbound failures (7d).

---

## Lane 1 — Onboarding + demo tour

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Register a throwaway customer (name, contact, email, pw, scroll-agree + ticks, CAPTCHA) | confirmation email arrives (branded) | |
| 1.2 | Confirm email → sign in | lands on `/verify-id` (DPA tick + ID upload, or Skip) | |
| 1.3 | Skip to portal → Home | **Quick tour auto-opens** (6 steps, dots, Skip); closing it and reloading does NOT reopen; "Quick tour ▸" link reopens it | |
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

**Teardown:** suspend/reject the throwaway customer, revoke `st02cash`/`st02check`, remove test JOs if desired (or archive). **Go-live note:** prod was wiped (session 10p) so the first *real* order is meant to be `JO-000001` — this run will consume `JO-000001+` and `BR-000001+`, so after teardown delete the test orders/customer and reset `jo_number_seq` / `broker_code_seq` (only safe at zero orders). Test IDs uploaded during the run can't be manually deleted for 24h (`0053` window) — the 3-day purge clears them regardless.
