---
title: 2026-06-22 Consignee+Vessel Requests, CIS, Rate Matrix, Fuel Phase 0
tags: [session, consignees, vessels, job-orders, pricing, fuel]
type: session
date: 2026-06-22
---

# 2026-06-22 — Consignee + Vessel Requests, CIS, Rate Matrix, Fuel Phase 0

A multi-track build day (migrations **0132–0141** on the portal, **0135/0140/0150** on the fuel lane). Two parallel work lanes were running — the **portal/job-orders** lane and a new **fuel-monitoring** lane — so migration numbers were deliberately split (portal kept the contiguous low numbers; fuel parked at `0135`/`0140`/`0150` with buffers). Fuel Phase 0 is now **deferred**; focus returned to the portal.

## What shipped

### Customer-requested consignees & vessels + "needs info" loop
- **`request_consignee`** (`0132`) — a customer who can't find their consignee files a new one: name + **business address + TIN** (compulsory as of `0139`) + **BIR 2303** (required) / 2307 (optional). Created as a **pending** consignee on the existing approval machine and **usable immediately to file** (file-now; KTC verifies the BIR docs in parallel). Approve/reject in the existing `/admin/consignees`; requester notified.
- **`request_vessel`** (`0137`) — same pattern from a modal; an unlisted vessel becomes a **pending** request at submit (the `0068` JO-insert trigger still dedupes). Customer sees it tagged "pending approval" right away.
- **"Needs more info" state** (`0138`) — reviewers tag a request `needs_info` + note instead of a hard verdict; requester is notified and can **edit & resubmit in-app** (→ `pending`). Recoverable, unlike `rejected`. Consignee review = admin + CSR (new permission **`review_consignee_requests`**); vessel review = ops/admin (`manage_vessel_schedule`). Added a customer **My Requests** view + admin **dashboard pending tile**.
- **Vessel +1-day allowance** (`0139`) — the schedule keeps a vessel one day past its last free day before it drops out of the picker.

### Customer Information Sheet = consignee accreditation
- **The CIS accredits a CONSIGNEE, not a broker account.** `0133` first (wrongly) modeled it as a broker-account profile and gated *all* filing on it; **`0136` tears that gate down**. The customer base is one pool (a broker can also be a consignee), so there is **one CIS, held on the consignee record** — file-now, missing BIR docs **flagged not blocked**.
- **Print CIS** renders the *filled* sheet from consignee data as a PDF; linked in the customer portal footer.

### Container rate matrix (calculator / JO tariff rework, `0141`, 4 phases)
- **`terminal_rates`** (the **calculator's** tariff) gains **fill (empty/full) × kind (dry/reefer)** on top of service/trade/origin/size — re-keyed, all **160 combos** seeded (the 120 new cells start `rate = null` so the calculator flags **"rate not set"** rather than charging ₱0).
- **`job_order_lines`** gain `size`/`fill`/`kind` (nullable; old rows stay valid); the three line-insert paths persist them.
- **Admin tariff editor** gains the empty/full × dry/reefer grid; **calculator redesigned** (merged section, container types, ancillary dropdown).
- **Reverted** the JO container size/fill/kind *filing* UI (`086a989`) — the **X-ray JO is operational, not priced**, so pricing dimensions don't belong on it. **Live billing unchanged**: payment still uses `service_rates`; `terminal_rates` is the quote/calculator tariff only.

### Fuel monitoring — Phase 0, then DEFERRED ([[ADR-0025]])
- Backend-only **derived-variance fuel module** on the [[Yard Operations — Pillar 2 (Move Logger + Yard)|moves]] spine: `equipment` + two append-only ledgers (`fuel_dispense` OUT / `fuel_delivery` IN), effective-dated `fuel_rates`/`fuel_settings`, interim `move_tally`, **7 derived views**, RLS (`view_fuel_reports`/`manage_fuel`/`log_fuel`), config audit triggers, CSH-model seeds (`0135`).
- New non-admin **`purchaser`** staff role = the fuel desk (`0150`), seeded with the 3 fuel gates.
- `0140` — revoke PUBLIC EXECUTE on the `0132` consignee-decision trigger fn (`0105`/`0117` definer-ACL invariant; behaviour-neutral).
- **All three migrations applied to prod + committed (`9407d39`). No frontend exists yet** — Phase 1 (`/admin/fuel` desk), Phase 2 (`/app/fuel` pump logger), etc. are deferred. Full plan: [[Fuel Monitoring (Yard Operations sub-module)]].

### UI polish
- **Modal standardization** — portal modals render into `<body>` (stop overlapping the tabbar/footer); consistent small-screen padding. **Taglish** copy for the new/redesigned screens.

## Decisions
- **CIS lives on the consignee, not the broker** (`0136` reverts `0133`) — one customer pool, accreditation = `request_consignee`.
- **X-ray JO stays unpriced/operational** — container size/fill/kind are a *calculator/tariff* concern, not JO filing fields.
- **`terminal_rates` ≠ billing** — it powers the calculator/quote; live payment still runs on `service_rates`.
- **Two-lane migration numbering** — portal on contiguous low numbers, fuel on `0135`/`0140`/`0150` with buffers, to avoid concurrent-work clashes. Going forward: portal `0142+`, fuel `0151+`.
- **Fuel deferred after Phase 0** — schema is live; build resumes on the portal/job-orders first.

## Pending / next
- **Fuel Phase 1+** (deferred): wire the `purchaser` role + 3 fuel permissions into the frontend (`Permission` union, Roles & Gates matrix column, purchaser routing/label/home/nav), then build the `/admin/fuel` desk. Until wired, **don't create a purchaser account** (broken shell). See [[Pending Items]].
- Pre-existing nit surfaced: the Settings "Current staff" label map omits `csr` (shows as "Admin") — fix when next in role code.
- Confirm the new container-rate cells (120 nulls) with the owner as real tariffs are set.

## Related
- [[Consignees]] · [[Job Orders]] · [[Staff Roles & Gates]] · [[ADR-0025]] · [[Fuel Monitoring (Yard Operations sub-module)]]
- [[Current State]] · [[Completed Milestones]] · [[Pending Items]]
