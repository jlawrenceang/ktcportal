# Smoke Test ST02 — Lifecycle, Payments, Roles, Security (everything since ST01)

**Smoke Test ID:** ST02
**Date authored:** 2026-06-12
**Status:** DRAFT (ready to execute)
**Target:** https://portal.ktcterminal.com (live, pre-public)
**Covers:** migrations `0011`–`0049` / sessions 4–10 — order lifecycle loops, serving numbers, per-service completion, checker station, payments + invoice, roles & gates, admin file-on-behalf, Logs, observability, MFA, auto-suspend, demo tour.

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

## Lane 1 — Onboarding + demo tour

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Register a throwaway customer (name, contact, email, pw, scroll-agree + ticks, CAPTCHA) | confirmation email arrives (branded) | |
| 1.2 | Confirm email → sign in | lands on `/verify-id` (DPA tick + ID upload, or Skip) | |
| 1.3 | Skip to portal → Home | **Quick tour auto-opens** (6 steps, dots, Skip); closing it and reloading does NOT reopen; "Quick tour ▸" link reopens it | |
| 1.4 | File a JO while pending | saved as **held** ("Draft (no number yet)"), notice says verify to process | |
| 1.5 | Upload valid ID (banner) | admin Approvals shows the account with ID + consent badges | |

## Lane 2 — Customer filing & serving numbers

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Admin approves the test customer | approval email arrives; held order flips to **submitted** with `JO-######` | |
| 2.2 | Order shows serving chips | per-service line number (e.g. `X-ray #N`); **Now serving** strip on My Job Orders | |
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
| 5.1 | `/calculator` as customer | rates match Settings; X-ray VAT 12%; flat admin + print fees not VATed | |
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

## Lane 7 — Security & monitoring

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Owner: 2FA tab → enroll (scan QR, verify code) | "2FA is ON"; sign out → sign in → **code challenge** appears; wrong code rejected; right code lands in admin | |
| 7.2 | Cashier opens `/admin/security` directly | "available for admin and owner accounts only" message | |
| 7.3 | Idle: leave the customer portal untouched 10+ min (or close browser, return after 10 min) | signed out; login shows the inactivity notice | |
| 7.4 | Login lockout: 5 wrong passwords | 60s cooldown message | |
| 7.5 | (Advanced, optional) As the test customer, send a crafted PATCH to set `is_admin=true` on own row (curl + access token) | change reverted; account **auto-suspended** + sessions revoked; owner gets 🚨 email ≤15 min; Logs → Security shows the attempt. Reinstate the account afterwards. | |
| 7.6 | Logs tab (owner) | all four views populated from this run (orders / security / errors / emails & sync) | |
| 7.7 | Settings → System health → Run health check | all 5 cron jobs listed with recent runs; outbound calls show HTTP 200s; this run's emails listed | |

## Lane 8 — Housekeeping (observe, no action)

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | 🗄 Archive paid & completed (or wait for Monday cron) | completed+invoiced orders leave default views; visible under Archived; customer history intact | |
| 8.2 | Monday 00:15 PH carry-over (observe next Monday) | open orders re-queued at the FRONT of the new week's lines in old order | |
| 8.3 | BOC mirror | BLOCKED until Google service-account creds are set (`scripts/setup-boc-mirror.mjs`) — expected | |

**Teardown:** suspend/reject the throwaway customer, revoke `st02cash`/`st02check`, remove test JOs if desired (or archive).
