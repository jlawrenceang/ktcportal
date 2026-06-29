---
title: 2026-06-29 X-ray Phase A Anti-Fraud Billing Build (backend + frontend, cutover deferred)
tags: [session, architecture, billing, anti-fraud, security]
date: 2026-06-29
---

# 2026-06-29 — X-ray Phase A anti-fraud billing build (backend + frontend; cutover deferred)

A focused second session on 2026-06-29 (after [[2026-06-29 Phase-5 Verification, v1.7.0-v1.7.5, MFA Gate, ADR-0037 Move-Spine]]): built **[[target-architecture-jo-payment-invoice|ADR-0037]] Phase A** — the anti-fraud X-ray billing reshape — end to end (**10 additive migrations** `0202`–`0211` + **10 new frontend screens**), all applied to prod and **Jarvis-verified**. **CRITICAL nuance:** the new billing model is **BUILT but NOT yet wired into the operational flow** — the **cutover** (the surgical switch from the old base/RPS/supplement payments onto the new `charges`/`payment_orders` spine) is **deferred to a future session**. **Today's old payment model is still the live one.**

## Why (the drivers)
- The **June 4, 2026 open forum** surfaced X-ray queue pain, "questionable charges," and bad customer service.
- The owner **discovered invoice fraud** — fictitious / copied invoices + unwarranted charges by staff or brokers.
- This Phase A is a **pre-launch POC for a stakeholder presentation** (~2–3 months out). **Frappe ERP integration is deliberately deferred** — manual invoice entry for now.

## The architecture (ADR-0037 + a dated addendum committed today)
The **Job Order stays the X-ray service request.** Each billable (base X-ray, RPS move, add-on) is a **row in a uniform `charges` table** — explicitly **NOT** charge-as-its-own-JO. Layered spine:

> **container → moves** (dormant, owned by KTC's **existing TOS**) **→ charges → payment_orders**

The **container becomes a first-class record.** `container_cycles` / `container_events` are a **DORMANT scaffold** (RLS-locked) — the future **TOS-integration seam**.

**4 anti-fraud controls:**
1. **Authenticity** — server-issued, QR-verifiable charges.
2. **Authorization** — add-ons are **maker-checker**.
3. **Accountability** — every charge / approval / payment attributed in a **`charge_audit`** trail (~400 staff).
4. **Reconciliation** — monthly **containers × rate vs. cash**.

## Backend — migrations `0202`–`0211` (applied to prod, ADDITIVE, Jarvis-verified)
Nothing dropped; the old flow is intact. In one line each:

- `0202` — `containers` + the **dormant** `container_cycles`/`container_events` scaffold (the TOS-integration seam).
- `0203` — `charges` + `payment_orders` + `job_order_lines.container_id`.
- `0204` — `consignee_rate_overrides` (per-consignee **special rates on one price spine**).
- `0205` — `mfa_recovery_codes` + `notification_settings`.
- `0206` — charge-lifecycle RPCs: the **universal invoice-before-confirm gate for every charge type**, maker-checker, payment orders, reversal, `charge_audit`.
- `0207` — MFA recovery RPCs (generate / redeem / owner-reset) → lets MFA be **mandated for money roles**.
- `0208` — `search_consignees` (PII-scoped, **anti-scrape**) + rate/notification editors + `get_xray_monthly_reconciliation` (admin-gated).
- `0209` — charge-gate hardening (folded the **Jarvis findings**: ad-hoc price is add-on-only; JO-status guard; null-creator can't self-approve; terminal `reversed` state).
- `0210` — **admin-only** billing cancellation (`cancel_charge` / `cancel_payment_order`; `reverse_charge` already admin/owner).
- `0211` — `verify_job_order_charges` (public anti-forgery RPC).

## Frontend — 10 new screens (ultracode workflow, typecheck-clean, additive)
- Customer **JobOrderCharges** (itemized transparent charges) + **VerifyCharges** (public QR charge-authenticity) — both **wired into MyJobOrders + the Verify page**.
- Cashier **PaymentOrderDesk**.
- Admin **ChargeApproval** (maker-checker) + **Reconciliation** (monthly panel) + **ChargeAuditView**.
- **Settings** gained **SettingsRateOverrides** (Pricing tab) + **SettingsNotifications** (Operations tab).
- **MFA** gained **MfaRecoveryCodes** (account) + **MfaRecoveryRedeem** (challenge screen) + an owner-only **"Reset 2FA"** button (`reset_staff_mfa`).
- **Tagalog copy pass in progress.**

## UI fix — terminal-photo backgrounds + per-role backdrop
The hero/dashboard backgrounds were broken — the code referenced `/photos/hero-1..5.jpg` + `dash-admin.jpg` which **don't exist** (the real files are `/photos/1..23.jpg`). Repointed them, and added a **per-role `AppBackdrop`** so **every logged-in role** (including the previously-blank admin/staff shell) gets a dimmed KTC aerial; **theme-aware scrim** via `--cc-canvas`.

## Owner decisions captured
- **One price spine + per-consignee special rates.**
- **Keep consignee filing open** but **protect PII + block scraping** (accreditation = future).
- **Serving number → monthly reset, format `YYMM-XXXX`** (deferred to cutover).
- **Completion = one boring-correct rule** (deferred to cutover).
- **Cancellation = admin-only.**

## Deferred to the cutover session (surgical, large blast radius)
The switch is held back because it touches the **live money path**. To do, in order:

1. Modify `file_job_order` to **create the base charge + upsert containers / `container_id`**.
2. **One-rule completion** reading `charges`.
3. **Monthly serving** `YYMM-XXXX`.
4. **Tighten the consignee broker-read RLS** (picker → `search_consignees`).
5. **Staff JO-cancel → admin-only** + block customer self-cancel once billing exists.
6. **Then** the **destructive drops** (`rps_payment_*`, `jo_supplements`/`release_supplements` as billing, `terminal_rates`, old invoice fields) — **atomic, shipped together** → **Jarvis on the cutover + e2e + a data-isolated break-test**.

Also deferred to land **with** the cutover: **user-facing manuals + demo tours + the walkthrough video.**

## Links
[[Current State]] · [[Roadmap]] · [[Pending Items]] · [[target-architecture-jo-payment-invoice]] · [[2026-06-29 Phase-5 Verification, v1.7.0-v1.7.5, MFA Gate, ADR-0037 Move-Spine]] · ADR-0037
