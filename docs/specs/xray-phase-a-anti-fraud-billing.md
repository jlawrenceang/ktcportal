# Spec — X-ray Phase A: anti-fraud billing + move-spine foundation

* Status: **Building** (owner greenlit 2026-06-29; build items 1–10, defer vessel sheets #11)
* Implements: [ADR-0037](../adr/0037-jo-as-atomic-move-payment-orders-1-1-1-invoicing.md) Phase A (fold B in) + the workflow-critique decisions.
* Memory: `fraud-driver-and-poc-framing`, `xray-focus-existing-tos-spine`, `target-architecture-jo-payment-invoice`.

## What / Why / Done

**What.** Rebuild the X-ray service + billing path so charges are *atomic, transparent, authentic, and reconcilable*, lay the container identity + a dormant container-cycle/release scaffold, and harden access. This is a **proof of concept** for a stakeholder presentation (~2–3 months), pre-launch, disposable seed data → a clean reshape.

**Why.** The June-4-2026 open forum surfaced (1) X-ray queue pain, (2) "questionable charges", (3) bad CS — and the owner then discovered **fraud**: fictitious / copied invoices + unwarranted charges by staff or brokers. "Questionable charges" is partly *fraud*, so this is an anti-fraud rebuild.

**Done looks like.** Every charge is its own invoiced order; nothing is payable without an ERP **and** BIR number on the *final* invoice; every charge is QR-verifiable (real charges + true amount + paid state); every charge/approval/payment is attributed; a monthly panel reconciles containers-X-rayed × rate vs cash; the queue shows fair, visible ordering; container is a first-class record; container-cycle + release exist as dormant scaffolds.

## The four anti-fraud controls (the spine)

1. **Authenticity** — server-issued, uniquely-numbered, **QR-verifiable** charges/invoices. Forged/copied paper fails the scan or reveals the true amount.
2. **Authorization** — every add-on is its own *approved* + *invoiced* order (maker-checker), customer-visible. No silent unwarranted charge.
3. **Accountability** — ~400 employees → every charge/approval/payment records WHO. Per-staff activity view.
4. **Reconciliation** — monthly: containers × rate = expected cash, tied to bank.

## Scope

**In (build now, items 1–10):**
1. Frappe **manual** (no integration) — but shape invoice fields to map cleanly later.
2. **One price spine** (collapse `service_rates`+`terminal_rates`) + per-consignee special-rate overrides.
3. **Consignee PII protection + anti-scrape** (search-to-pick name/code only; full row admin-only). Accreditation = future.
4. **Serving number** monthly reset, ops-internal, format `YYMM-XXXX`; charge-only JOs skip the queue; monthly **reconciliation panel**.
5. **Completion** = one boring-correct rule (papers complete + payment-with-invoice confirmed = done).
6. **Release** = dormant scaffold only (next real build; TOS-linked).
7. **Notifications** — master email ON at go-live + per-event **channel routing** (email/SMS/both/off).
8. **MFA recovery codes** + owner reset-staff-MFA + **mandate MFA for money roles**.
9. **QR charge-authenticity** anti-fraud (extend verify-QR from paid/unpaid → "these are the real, correct charges").
10. **Audit / accountability** for every charge.

Plus the **ADR-0037 core**: container first-class identity; JO generalized (charge_type, charge-only skips queue); per-JO **ERP+BIR** invoice (draft→final); **payment_orders** (N:1 collection); **fold B** (RPS + add-ons → linked charge-JOs, reusing `parent_job_order_id`).

**Deferred:** vessel sheets (#11, discuss), full release→JO conversion, Frappe API, per-broker accreditation, payment gateway, partial/installment payments.

**Out:** changing the existing TOS/ERP.

## Open-design defaults (flagged for owner; building on these unless told otherwise)

* **Refund/reversal:** a confirmed charge-JO is reversed by an owner/admin **reversal** action → a credit-note record + audit entry + un-confirm; never a silent delete.
* **Credit vs cash gate:** honor per-consignee `payment_terms` (exists, `0188`). Credit consignee → a *final invoice on file* satisfies the movement gate without confirmed cash; cash consignee → confirmed payment required.
* **OR / collection number:** the **Payment Order** carries the one collection OR; each JO carries its sales invoice (ERP+BIR). (BIR: one OR per collection, N sales invoices.)

## Data model (additive-first)

* **`containers`** (live) — `container_no` unique, ISO-6346 check-digit validated; JO lines gain `container_id`.
* **`container_cycles`** + **`container_events`** (DORMANT — RLS locked, no UI/triggers) — one gate-in + one gate-out + close; re-entry = new cycle. The TOS-integration seam.
* **`job_orders`** — add `charge_type`, `erp_invoice_no`, `bir_invoice_no`, `invoice_state` (draft/final), `payment_order_id`, `amount` (snapshot at confirm). Reuse `parent_job_order_id` for linked charge-JOs.
* **`payment_orders`** (new) — collection unit, N:1 over JOs; `collection_or_no`, payment/confirm fields.
* **One price spine** — single rate table + `consignee_rate_overrides`.
* **`charge_audit`** (or extend `security_events`) — who created/changed/approved/confirmed each charge.
* **`mfa_recovery_codes`** — `user_id`, `code_hash`, `used_at`.
* **`notification_settings`** — `event_type`, `channel`.
* **Consignee** — broker read via a column-scoped view/RPC (id/code/name).
* **Cutover (last):** drop `rps_payment_*`, retire `jo_supplements`/`release_supplements` as billing, drop `terminal_rates`, map old invoice fields → new.

## Milestones

* **M1 — Additive schema** (migrations 0202+): containers + dormant scaffold; JO new columns; payment_orders; one-price-spine tables; charge_audit; mfa_recovery; notification_settings; consignee PII view. *Non-breaking; prod stays alive.*
* **M2 — Backend RPCs/triggers:** charge create (maker-checker)+audit; payment-order create/bundle/confirm gate (final-invoice required, ALL charge types); simplified completion; reversal; credit/cash gate; monthly serving assign + reconciliation view; MFA generate/redeem/reset; notification routing; consignee search RPC.
* **M3 — Frontend:** customer transparent itemized charges + QR verify + queue position; cashier payment orders + invoice entry + confirm; admin charge approval + reconciliation panel + audit view + one-spine rate editor + hidden consignee PII; settings (channels, MFA mandate) + MFA recovery-code enrolment.
* **M4 — Cutover + verify + ship:** destructive drops shipped with new frontend; **jarvis** on money/migration; e2e; `/ship`.

## Acceptance criteria (each = a verifiable check)

1. A charge cannot reach `confirmed` without BOTH `erp_invoice_no` and `bir_invoice_no` on a `final` invoice — for **every** charge type (base, RPS, add-on).
2. Scanning a charge's QR returns the authoritative line items, amounts, and payment state from the server.
3. An add-on charge requires an approval step + records its creator; it appears on the customer's view.
4. The monthly panel shows JO count, container/van count, expected X-ray revenue, and a bank-reconciliation line.
5. A broker SELECT on consignees over the API returns only id/code/name — no TIN/contact.
6. Losing an authenticator is recoverable via a one-time code (and owner reset) with no DB surgery.
7. Calculator estimate == final bill for the same inputs (one price spine), incl. per-consignee overrides.
8. Container numbers are ISO-6346 validated; the same physical box is one `containers` row across JOs.
9. `container_cycles`/`container_events` exist but are inert (no API read for authenticated, no triggers).
10. Completion fires from exactly one rule in one place.
