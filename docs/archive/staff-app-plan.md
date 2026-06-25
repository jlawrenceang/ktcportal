# Plan — Role‑aware KTC Staff App (PWA vs Native)

**Status:** proposal (awaiting owner decision) · **Date:** 2026‑06‑17 · **Owner:** Jan Lawrence Ang
**Decision needed:** approve direction (recommend **PWA**, optionally wrapped as an Android **APK** later) and the role scope.

---

## 1. Goal

A focused, installable **staff app** so floor employees "just open it and do their one job" — and so the owner gets a more controllable, lockable surface on company **Android** devices. It is **role‑aware**, not checker‑only:

| Role | App lands on | Core action |
|---|---|---|
| Checker | X‑ray queue | scan JO/QR → confirm X‑ray per van; RPS assessment |
| Cashier | payment queue | review/confirm payment proofs; record ERP invoice |
| Operations | JO queue + vessels | file/review/process job orders |
| Admin/Owner | dashboard | full back office (everything) |
| CSR | support inbox | answer tickets |

One codebase, one login; the app shows only what the role needs.

## 2. Security reality (important framing)

"An app is more secure" is only **partly** about the app. **Who can do what is already enforced server‑side** and does not change with an app:

- RLS + `has_permission()` on every table/RPC (e.g. `record_van_xray` is permission‑gated).
- **Single session per account** (`claim_session` / `useSessionGuard`), **idle auto‑logout** (60 min staff), **MFA enforcement** (0049), `session_alive()` woven into RLS.

What a dedicated app *actually adds*:
1. **UI least privilege** — the checker literally cannot see the rest of the portal.
2. **Device control** — on a *company* Android device: **kiosk / single‑app mode**, block unknown‑source installs, disable other apps (via MDM or a managed launcher).
3. **Faster UX** — "open and check," camera‑first, big touch targets.
4. **Reliable push** — an installed app gets dependable notifications (and on iOS, push *only* works once installed — though our fleet is Android).
5. **Offline tolerance** at a spotty gate.

> Net: the app is mostly a **UX + device‑management** win on top of unchanged backend security.

## 3. Options

### Option A — Installable PWA  ✅ recommended
Our existing React app + a **web manifest** + **service worker** (the push SW already exists). Installs to the Android home screen ("Add to Home Screen"), runs full‑screen, works offline‑ish, gets push.

- **Effort:** small–medium (reuses 100% of the backend and most UI).
- **Distribution:** a URL, or wrap it as a real **Android APK via TWA** (Trusted Web Activity) for sideload/MDM — the APK *is* the PWA in a thin wrapper.
- **Security/lockdown:** kiosk via Android **MDM / managed launcher** (the lockdown lives at the device layer, which is where it belongs). No cert pinning / app attestation.
- **Limits:** no deep native APIs; iOS PWA is constrained (not our case).

### Option B — Native (React Native / Flutter / Kotlin)
A separately built app talking to the same Supabase backend.

- **Effort:** large (new codebase, build pipeline, ~3–6 weeks for parity) + ongoing maintenance of a 2nd app.
- **Distribution:** sideloaded APK (no Play Store needed) or Play/MDM.
- **Security extras:** Keystore secure storage, biometric, **certificate pinning**, Play Integrity/app attestation, native single‑app kiosk.
- **When justified:** only if you need those device‑level guarantees beyond what MDM‑managed‑PWA gives.

### Recommendation
**Start with the PWA (A).** It delivers the "open and do my job" experience and reliable push immediately, reusing everything. If/when you need harder device control or store distribution, **wrap the same PWA as a TWA APK** for MDM — still one codebase. Go fully native (B) only if a concrete requirement (cert pinning, attestation) appears. Since the fleet is Android, the PWA→TWA path covers the realistic needs.

## 4. Role‑aware "app mode" (how it works in code)

- Detect "installed/standalone" (`display-mode: standalone`) **or** an `?app=1` entry → render an **App shell** instead of the full portal chrome.
- The App shell reads the role (existing `usePermissions`/`useBroker`) and routes to that role's focused screen, hiding all other navigation.
- Reuse existing pages/RPCs (Checker, CashierStation, AllJobOrders, SupportInbox) — just present a single‑purpose, larger‑touch layout.
- **Checker camera scan:** use the device camera (`BarcodeDetector` where available, else a small JS QR lib) to read the JO number/QR and jump straight to that order's X‑ray confirm.

## 5. Security hardening (app + device)

- **App:** PIN / biometric **re‑lock on resume** (WebAuthn/passkey or a local PIN), keep single‑session + tighten idle for the app, no "remember me" on shared devices.
- **Device (owner/IT):** MDM enrollment → **kiosk/single‑app mode**, disable unknown‑source installs, Play Protect on, auto‑update the app. This is what actually mitigates the Android "more open = more malware" exposure you raised.
- Backend unchanged (already enforces everything).

## 6. Phased delivery (PWA path)

1. **PWA foundation** — manifest (name/icons/standalone/theme), extend the existing service worker, "Install app" affordance. *(~0.5–1 day)*
2. **Role‑aware app mode** — standalone detection → focused per‑role shell; checker camera‑scan flow first (highest value). *(~2–4 days)*
3. **Hardening** — PIN/biometric re‑lock, app‑scoped idle, polish. *(~1–2 days)*
4. **Offline queue (optional)** — cache the pending queue; queue confirmations offline and sync **idempotently** (server stays source of truth). *(~2–3 days)*
5. **TWA → APK (optional)** — package for sideload/MDM + kiosk. *(~0.5–1 day + device setup)*

Native alternative for comparison: **~3–6 weeks** to reach parity, plus a permanent second codebase.

## 7. Open decisions

1. **Direction:** PWA now (recommended) vs native.
2. **Roles in v1:** start with **checker** (clearest win), then cashier/operations — or all at once?
3. **Device management:** is there an **MDM** (e.g. Google Workspace / Android Enterprise / a kiosk launcher) on the gate devices? This is what enables true lockdown — without it, "kiosk" is best‑effort.
4. **Camera scan:** are JO slips printed with a **QR / barcode** the checker can scan? (We already render a slip + a public `/verify/:id` QR — the checker app can scan that.)
5. **Offline:** do gates have reliable Wi‑Fi/data, or is offline queueing required for v1?

## 8. Recommended next step

Approve **PWA, checker‑first**, confirm whether an **MDM** exists, and I'll start Phase 1–2 (PWA foundation + the checker app‑mode with camera scan), then extend to cashier/operations.
