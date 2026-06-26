---
title: 2026-06-26 Public Landing + Lara + Google OAuth + Consent Enforcement
tags: [session, landing, chatbot, auth, oauth, consent, legal, security, rls]
type: session
date: 2026-06-26
---

# 2026-06-26 — Public Landing + Lara + Google OAuth + Consent Enforcement

A long public-facing + access-hardening run (`APP_VERSION` **v1.6.18 → v1.6.31**; migrations **`0160`–`0164`**, all applied to prod). Themes: give the signed-out URL a **real public landing** (then redesign it around real terminal photos), ship **Lara** — a deterministic, non-LLM customer help assistant — add **"Continue with Google"** sign-in, and close the launch-blocking access gaps with a **server-side consent-enforcement layer**, a **pending → verify-only lockdown**, and a **disposable-email block**. Customer Agreement bumped to **v4** after a PH-legal redline. Capped with a **demo-tour refresh** (a "Meet Lara" step + the admin work-surface step, v1.6.31) and this docs wrap. Authoritative per-change list: `CHANGELOG.md` (v1.6.18 → v1.6.31).

## What shipped

### Public landing + terminal-photo identity
- **Public landing at `/` (v1.6.18).** A signed-out visitor now sees an orientation page (what the portal is, who it's for, the service areas, and two paths in — **Sign in** / **Create an account**) instead of bouncing to a bare login. `/` routes through a `RootGate` (logged-out → `Landing`, logged-in → role landing). **No forced accept gate** — legal consent stays at sign-up. `src/pages/Landing.tsx`.
- **Landing redesign (v1.6.26 → v1.6.29).** A 5-photo auto-advancing **terminal slideshow** (`HeroSlideshow`, dependency-free; crossfade, pauses on hover/hidden tab, honours `prefers-reduced-motion` → single still); a wide **two-column glass card** on desktop (≥900px) vs a **single-column tile + photo hero band** on phone; regular auto-height CTAs; fits one screen. The **login + create-account pages carry the same photo slideshow** behind the frosted card (v1.6.29) for visual continuity. The customer + admin dashboards each carry a slim terminal-photo banner. Source originals (~290 MB) gitignored + removed; shipped slides <400 KB each.
- **Earlier in the run (v1.6.19 / v1.6.20):** a one-shot **first-run Setup popup** (language + notifications folded into one step; `LanguageGate.tsx` / `PushPrompt.tsx` retired into `FirstRunSetup`), branded **page-transition** loader, **public-gate polish** (new `0160` anon-SELECT policy on `support_contact` phone/email for a "Need help?" line), and a **Vessel Schedule "Cards" view** (now default; Last Free Day as the hero fact).

### Lara — the customer help assistant (NON-LLM)
- A floating **"Ask Lara"** widget on the customer side only — a warm, guided, **deterministic** chatbot: a hand-written **decision tree (93 nodes) + keyword matcher**, **zero LLM**, zero per-message cost, nothing to "drain." Six topic tiles (Orders · Vessel schedule · Rates & payment · Container release · Account & verification · Feedback & concerns) plus a standing **"Talk to a person"** and an always-on text box.
- **Tool-based truth + real fallback:** a live, **RLS-scoped** "track my order" / "view all my orders" lookup (reports the actual status + payment pill via the existing `joPaymentState`), and a **two-strike → support-ticket** fallback through the existing `open_ticket` RPC (tagged by where the conversation dead-ended) so the long tail reaches a human, not a guess.
- **No new route, table, or migration** — Lara reads existing data + opens tickets. `src/components/chat/{types,nodes,match,actions,useChat,ChatWidget}.ts(x)` (6 files), mounted in `Shell.tsx`, hidden for pending/locked customers. English + Tagalog. An independent code review caught + fixed a **stale-state track bug** (sequential lookups returned the prior order) and a **ticket-fallback message-loss bug** before ship. a11y pass (v1.6.23): focus management, Escape-to-close, `aria-live` transcript. Design: `docs/lara-chatbot-design.md` (+ `-spec.md`). See [[Lara (Customer Assistant)]].

### "Continue with Google" sign-in (`0161`)
- Customers can sign in / sign up with Google (no password; the email comes back already verified, so the email-confirmation step is skipped). Built on Supabase OAuth.
- **`FinishRegistration` consent step** — Google gives a name + email but not the **contact number** + **Agreement consent** the email/password form collects, so a new Google customer is routed once through a gate (in `ProtectedRoute`) to provide both before the portal opens. Recorded server-side via `complete_oauth_registration(p_contact, p_version)`. The gate is **scoped to Google-provider users with no recorded consent**, so email/password customers are untouched. Normal pending → ID-upload → approval flow is unchanged.

### Agreement-consent enforcement (`0162`)
- Closes the audit's L1 + L2 (the one go-live gate): Customer Agreement / DPA consent is now enforced **in the database**, not just the UI.
  - **No transaction without recorded consent** — `file_job_order` and `open_ticket` (the real SECURITY DEFINER write paths) refuse to run unless `has_recorded_consent()` is true. A naive RLS-only fix would be bypassed, since those definer functions bypass RLS — so the gate lives inside the function where it actually fires (RLS `WITH CHECK` kept as defense-in-depth).
  - **Consent can't be spoofed** — the six consent columns are **server-stamped only**; a raw client UPDATE is pinned back by the `customers` guard trigger, gated by a transaction-local `ktc.allow_consent_write` flag only the consent RPCs set (mirrors the existing `ktc.allow_owner_change` pattern; a column-level REVOKE was rejected as a no-op against the table grant).
  - **One server-stamped writer** — every path (email/password signup, pending-banner sync, valid-ID page, OAuth finish-registration) records through `record_agreement_consent` (or `complete_oauth_registration`). Zero lockout (the 2 existing customers already have consent). See [[Broker Agreement]].

### Pending accounts → verify-only lockdown (`0163`)
- A customer with `status='pending'` (including any Google self-registration) can now **only** upload a valid ID, see their status, read the Agreement, manage account basics, and sign out. **Every business surface** — filing (`file_job_order` is approved-only), the vessel schedule, the rate/calculator config (`terminal_rates` / `service_rates` / `pricing_settings`), the **consignee master list**, and bulletins — is locked behind `broker_is_approved()` at the **RLS layer** (the real wall; Shell route-gating is UX, and Lara is hidden for pending). Verified: no policy bypass (every `FOR ALL` policy is staff-scoped), approved customers + staff still read everything, pending read nothing. Closes the self-signup data-exposure surface. See [[RLS Posture]].

### Disposable-email block (`0164`)
- Signups from throwaway/temporary email domains are rejected **server-side in `handle_new_user`**, using the maintained **7,578-domain** blocklist (gmail/outlook/etc. pass; mailinator/etc. blocked, rolling back the auth-user creation). An optional inline hint flags obvious throwaways on the form; the **DB trigger is the real wall**. Google OAuth emails are real → they pass.

### Customer Agreement → v4.0
- Redlined after a PH-legal-framework review (DPA, e-Commerce Act, Civil Code, fairness) that caught three blockers, all fixed:
  - **Privacy section made truthful** — removed the false NPC-compliance + designated-DPO claims; now a genuine commitment, a real contact, and a promise to appoint a DPO + register with the NPC. **Owner (Jan Lawrence Ang) named interim DPO.**
  - **Liability cap re-pegged to the Service Invoice** (the Job Order carries no fee, so the old cap was illusory and severability would have left KTC uncapped): "the greater of trailing-6-months Service-Invoice charges or **₱100,000**."
  - **Amendments** now require **affirmative re-acceptance** for material changes, not passive "continued use."
  - Plus version drift reconciled (2.0/v3 → **v4.0**), an **authority-to-bind** clause, and a **Notices** clause. `src/content/customer-agreement.md`. Remaining real-world items (NPC/DPO registration, counsel pass, the ₱100k floor) tracked in `docs/go-live-todo.md`.

### Admin dashboard drill-down (v1.6.30)
- The admin dashboard now surfaces the **actual pending accounts + pending consignees as clickable drill-down rows** below the count tiles — a work surface, not just a scoreboard. Each row links into the relevant queue (`/admin/approvals`, `/admin/consignees`). `src/admin/Dashboard.tsx`.

## Decisions
- **Lara is deliberately NOT an AI / LLM** — a rule tree + keyword matcher: no per-message cost, nothing to abuse, no hallucinated answers; the long tail becomes a support ticket (a human), not a guess. An LLM fallback is *designed-for, not built* — gated/rate-limited/capped, added only if ticket data shows a recurring open-ended miss. ADR-worthy (see below).
- **Consent + access gates live in the DB, not the UI.** Both the consent check and the pending lockdown are enforced where they actually fire — inside the SECURITY DEFINER write paths and at the RLS layer — because a definer function bypasses RLS and the frontend is bypassable. The UI mirror is convenience only.
- **Google name/email is not enough to onboard** — a Google customer still provides a contact number + Agreement consent (the `FinishRegistration` gate) before the portal opens; the gate is scoped so email/password users pay nothing for it.
- **No forced "accept" gate on the public landing** — legal consent stays at sign-up where it belongs; the landing is orientation only.
- **The disposable-email wall is the DB trigger** — the form hint is advisory; `handle_new_user` is the enforcement.

## Pending / next (go-live)
The launch checklist now lives in **`docs/go-live-todo.md`** (owner-actioned config/legal/security). Open items from this run:
- **Google OAuth:** finish the Supabase URL config (Site URL + redirect allow-list) + set the consent-screen app-name branding, then run the flow end-to-end (smoke: **ST05 Lane M**). Until enabled, the button returns "provider not enabled."
- **Security re-enable** before the staff dry-run: Turnstile (Managed CAPTCHA), MFA enrolment, owner password rotation — all down for testing.
- **Legal:** final PH-counsel pass on Agreement v4; NPC registration + dedicated DPO mailbox; confirm the ₱100k liability-cap floor.
- **Lara:** wire the owner-supplied **document-verification guide** into the waiting release slot (currently a holding answer); release pre-advise/advance-notice still deferred.
- Carry-overs: **ST05 manual Lanes A–K** + P9 data entry; the 120 unset `terminal_rates` cells. See [[Pending Items]].

## Related
- [[Lara (Customer Assistant)]] · [[Broker Agreement]] · [[RLS Posture]] · [[Authentication]] · [[Support Tickets]]
- [[2026-06-23 JO Lifecycle Overhaul + Storage Tiers + Consignee UI + Vessel Dedup]]
- [[Current State]] · [[System Scale]] · [[Pending Items]] · [[Roadmap]] · `docs/go-live-todo.md`
