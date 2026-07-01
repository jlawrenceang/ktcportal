# Codex 2026-07-01 go-live hardening batch — independent review

**Date:** 2026-07-02
**Scope:** git range `18087c1..HEAD` (commits `d7d4ff0`, `9ee653d`, `830bd2a`, `656ab2d`) — 77 files, +2,314 / −512. The 07-01 blind-walkthrough / go-live hardening batch: trusted-MFA device sessions (`0236`), customer email-change flow (`0235`), tariff images (`0234`), bulletin archive (`0233`), the 2-step JO filing rewrite, Lara draft hand-off, and vessel UX.
**Method:** three independent reviewers — **Jarvis** (invariant verify), an **opus security deep-dive** (crown-jewel auth surface), a **correctness pass** (filing / Lara / vessel / tariff) — plus the automated Layer-1 gates.
**Consumes:** worked via `/remediate` when the owner greenlights a phase.

## Verdict

**SAFE TO BUILD ON.** No critical or high findings. Jarvis PASS on all four invariants (no account-takeover, no charges-spine break, no aal1 server-side 2FA bypass, no route-guard/pending regression). The catalog below is **9 MEDIUM + 4 LOW/cleanup** — hardening, data-traps, and first-time-user polish.

> **Security batch (CX-01 / CX-02 / CX-03) — RESOLVED 2026-07-02.** Fixed in migration
> `0237_security_stepup_owner_email_lock_trusted_revoke.sql` + client wiring
> (`mfaTrust.ts`, `AuthContext.tsx`, `Security.tsx`, `Account.tsx`, `translations.ts`) +
> a poka-yoke (`require_fresh_aal2` added to the `check-security-invariants` INTERNAL list).
> Gates green (lint/build/i18n/security-invariants); **Jarvis-verified SAFE-TO-APPLY** (PASS
> on all four criteria). **Pending: apply `0237` to production** (owner-gated). Remaining
> open batches: tariff (CX-04/05/06/12), walkthrough/UX (CX-07/08/09), low (CX-10/11/13).

### Automated Layer-1 gates
| Gate | Result |
|---|---|
| `npm run lint` (tsc) | ✅ clean |
| `npm run build` | ✅ ok |
| `npm run check:i18n` | ✅ green **after fix** (batch shipped 56 untranslated strings; fixed 2026-07-02 in `src/lib/translations.ts`) |
| `node scripts/check-security-invariants.mjs` | ✅ ok (definer ACLs, internal-helper ACLs, owner-guard trigger) |

---

## Findings

### Security / owner-power (fix before go-live)

**CX-01 · MEDIUM · trusted device steps DOWN the crown-jewel 2FA hardening.**
`0236` extends `aal_satisfied()` to pass for a *trusted* aal1 session. But `0198` deliberately raised `reset_staff_password` / `promote_new_staff` / `set_owner_access` (via `is_root_owner`) to require aal2 so a **phished password alone** can't mint staff or grant owner. After `0236`, those irreversible ops are reachable with **password + a trusted-device token, no live TOTP** — and "Trust this device" defaults **ON**, even for the owner (`MfaChallenge.tsx:19`). The token is a 24h XSS-exfiltratable localStorage bearer.
*Reviewer split:* the security pass calls this a MEDIUM regression of `0198`; Jarvis calls the residual the "intended remember-device tradeoff." **Both are right** — it was an owner decision. **DECIDED 2026-07-02 (owner): require a fresh live 2FA code for the 3 crown-jewel ops (step-up); keep trusted-session convenience for everyday admin.** *Fix direction:* a `require_step_up()` that checks raw `auth.jwt()->>'aal' = 'aal2'` (ignoring `mfa_trusted_sessions`) for just those RPCs. Ref: `0236:157-177`, `0198:1-19,81-85`.

**CX-02 · MEDIUM · owner-failsafe email is not protected from self-change.** (Jarvis #1)
`request_customer_email_change` blocks `%@ktc-staff.local` but **not** the owner failsafe `jlawrenceang@gmail.com` (`0235:58`). The owner could change their own auth email away from the failsafe, after which `is_owner()`'s email backstop (`0184:28`) — the stated "can never be locked out" non-negotiable — no longer applies. Self-inflicted only (a third party can't grab the email — uniqueness holds). *Fix:* reject any change **away from or to** an `is_owner`/root-owner email.

**CX-03 · MEDIUM · no revoke path for a trusted device; trust survives sign-out.** (security B / Jarvis #3)
`revoked_at` exists but is only ever *un*-set on re-trust. No revoke RPC, no "forget this device" UI; `signOut` (`AuthContext.tsx:194`) doesn't clear the localStorage token or the device row, and password change/reset doesn't revoke — so a lost device stays trusted for the 24h window with no in-app kill switch. *Fix:* `revoke_trusted_mfa_devices()` RPC, called on password change + an Account control, and `clearTrustedMfaToken()` on global sign-out.

### Data-traps (should fix)

**CX-04 · MEDIUM · tariff "5 images" cap is client-only → orphaned invisible files.**
No DB constraint in `0234`; two admins can each pass the local check and exceed 5. Both admin (`Settings.tsx:294-301`) and customer (`Calculator.tsx:300-317`) list only the 5 most-recent, so a 6th+ object becomes **permanently invisible with no in-app delete path**. *Fix:* enforce the cap server-side + expose delete + list all.

**CX-05 · MEDIUM · tariff partial-upload leaves stale state → duplicate re-uploads.**
`uploadTariffs` (`Settings.tsx:305-325`) returns early on a mid-loop failure without `loadTariffFiles()` or clearing `tariffUpload`; re-clicking Upload re-uploads the already-succeeded file under a fresh path → duplicate bucket object. *Fix:* reload + clear in a `finally`.

**CX-06 · MEDIUM · one failed signed-URL hides ALL tariff images.**
`openTariff` (`Calculator.tsx:300-317`, render `595-616`) sets `tariffError` on any single `createSignedUrl` failure, and the render ternary prioritizes the error over the successfully-loaded images — one transient failure hides the other four. *Fix:* render loaded images + a per-image error.

### First-time-user polish (fix before go-live)

**CX-07 · MEDIUM · Lara draft re-applies after edits / leaks across sessions on a shared tab.**
The draft-restore effect (`JobOrder.tsx:63-81`) re-runs after the vessel fetch and clobbers user edits made in the gap; it also reads the draft on *every* mount and never checks the `?laraDraft=1` param that `nodes.ts:834` writes (dead param), so a stale draft silently prefills a later unrelated visit in the same tab (kiosk leak). Prefill-only — no bad write. *Fix:* consume-once ref + scope to the param + clear on `useChat.reset()`.

**CX-08 · MEDIUM · three stale walkthrough tours mislead first-time users.**
(a) JO tour spotlights a wizard step that was removed (3→2 steps) → dim backdrop, no spotlight, copy describes a vessel dropdown not on screen (`JobOrder.tsx:29`). (b) Customer tour says "tick Show past to see the full history," but customer vessel history is now capped to 7 days (`WelcomeTour.tsx:84` vs `Vessels.tsx:124-134`), and the cutoff isn't disclosed. (c) Admin tour instructs tapping a **deleted** Snapshot button + retired CSV import (`AdminTour.tsx:150-155`); `manual-operations.md/.tl.md` similarly stale. *Fix:* update tours + manuals to the current UI.

**CX-09 · MEDIUM · admin "current calls" filter includes cancelled vessels.**
`VesselSchedule.tsx:139` filters `r.is_current` but omits `&& !r.cancelled` (the customer page has it — `Vessels.tsx:133`); since this batch unified Cards + Calendar on the same source, a cancelled-but-current vessel now surfaces in Table, Cards, and Calendar. *Fix:* add `&& !r.cancelled`.

### LOW / cleanup (batch later)

**CX-10 · LOW · email-change: account enumeration + no rate-limit.** Distinct "email already has an account" error (`0235:69-74`) lets an authed user probe accounts; no throttle on `request_customer_email_change`, so any address can be email-bombed with KTC-branded confirmations (`0235:98-106`). *Fix:* generic response + throttle. (security C + Jarvis #2)

**CX-11 · LOW · entry-number `C-` consistency drift.** `EditJobOrderForm.tsx:29` auto-rewrites legacy non-`C-` entries on save; admin `NewJobOrder.tsx:72` files without the new `C-` formatting (pre-existing, not this batch); reformatting the whole controlled string jumps the caret to end on mid-string edits. *Fix:* align formatting across all filing paths; reformat on blur.

**CX-12 · LOW · tariff/doc upload input mismatches.** Client accepts gif/heic/heif (`validation.ts:50-53`) but bucket `0234:8` allows only png/jpeg/webp → raw backend error on iPhone HEIC; selection past remaining slots is silently truncated (`Settings.tsx:319`); dual doc-upload errors mask each other (`JobOrder.tsx:107-121`). *Fix:* align allowed types + surface each error.

**CX-13 · LOW · cosmetic/defensive residue.** Dead SELECT policy on `customer_email_change_requests` (`0235:32-34`, grant already revoked); token length floor is chars not bytes (`0236:61,122`, not exploitable); Lara `ChatWidget` dead glyph split (`ChatWidget.tsx:155-176`, buttons still work); `VesselCalendar` "Today" lands on nearest data-month not the current month (`:60-74`) and its effect over-recomputes via `new Date()` in deps. *Fix:* remove/clean as convenient.

---

## Recommended fix batching
1. **Security batch (pre-go-live):** CX-01 (owner decision first), CX-02, CX-03 — one migration + small client wiring; re-verify with Jarvis.
2. **Tariff batch:** CX-04, CX-05, CX-06, CX-12 — one pass over `Settings.tsx` + `Calculator.tsx` (+ a `0234` follow-up constraint).
3. **Walkthrough/UX batch:** CX-07, CX-08, CX-09 — tours, manuals, Lara draft scoping, vessel filter.
4. **Cleanup:** CX-10, CX-11, CX-13 — low-priority, fold into any nearby change.
