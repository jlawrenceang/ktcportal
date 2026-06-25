# Execution Plan — KTC Staff App (installable PWA)

**Companion to** `staff-app-plan.md` (the PWA‑vs‑native decision). This is the concrete build plan.
**Status:** ready to execute on owner go‑ahead · **Date:** 2026‑06‑17 · **Target:** Android, installable PWA (TWA→APK later)

---

## 0. Assumptions (defaulted so work isn't blocked — correct any before M2)

- **A1 — Roles in v1:** **Checker first** (camera scan → X‑ray confirm; the clearest "open and do my job" win). Then v1.1 **Cashier**, v1.2 **Operations**. Admin/Owner just install the full portal (no special app screen).
- **A2 — One role‑aware app:** a single installed app; the logged‑in account decides the screen. No separate builds per role.
- **A3 — Platform:** Android Chrome primary. Installable PWA now; wrap as a signed **APK via TWA/Bubblewrap** for MDM/sideload later.
- **A4 — Scan source:** the **QR already printed on the JO slip** (`/verify/:id`) and/or the JO‑number text. (Confirm the slip QR is on the physical slip checkers hold.)
- **A5 — Connectivity:** **online‑first.** Offline confirmation queue is a v2 add‑on unless the gates have no reliable data.
- **A6 — Device lockdown:** MDM / kiosk is owner/IT‑provided. This plan delivers the app + documents the kiosk/assetlinks requirements; it does not enroll devices.

These reuse the existing backend unchanged: RLS + `has_permission()`, `record_van_xray`, single‑session (`claim_session`/`useSessionGuard`), idle logout, MFA, and the Web Push pipeline already shipped (0114 + `send-push` + `/sw.js`).

---

## 1. Architecture decisions

- **App‑mode detection:** `window.matchMedia('(display-mode: standalone)').matches` (installed) **or** a one‑time `?app=1` entry persisted to `localStorage.ktc_app_mode`. When true, render the focused **App shell**; otherwise the normal portal.
- **Routing:** a dedicated `/app` tree (`AppLayout` + role landing) so the normal portal stays intact. `/app` redirects by role: checker → `/app/checker`, cashier → `/app/cashier`, ops → `/app/jobs`; admin/owner → `/admin`. Reuses `useBroker`/`usePermissions`.
- **Reuse, don't fork:** app screens call the SAME data hooks/RPCs as the portal pages (Checker, CashierStation, AllJobOrders); only the chrome + layout differ (single‑purpose, big touch targets).
- **Service worker:** extend the existing `public/sw.js` (push) with a **conservative** caching strategy — **network‑first for HTML/navigations**, **cache‑first for content‑hashed assets** (safe: filenames change per build), app‑shell precache. Must coexist with the existing Vite stale‑chunk recovery (`errorReporting.ts`): add a SW **version + update prompt** ("New version — refresh") rather than silent `skipWaiting`, to avoid mid‑session chunk breakage.
- **Install affordance:** capture `beforeinstallprompt`, surface an **"Install app"** button (in the bell dropdown / a one‑time banner). iOS would be "Add to Home Screen" (out of scope; Android fleet).

---

## 2. Milestones, tasks, acceptance

### M0 — Spike & verify  (~0.5 day)
- Confirm installability on a target device (Lighthouse PWA audit).
- Confirm **`BarcodeDetector`** support on the gate devices; pick the fallback lib (`@zxing/browser` or `jsQR`) if absent.
- Verify **`record_van_xray` idempotency** (re‑confirming an already‑done line is safe) — gates offline/retry later.
- Confirm the **`/verify/:id` QR payload** format (what the slip encodes) so the scanner can parse the JO id.
- **Done when:** the four unknowns are answered and written back into this doc.

### M1 — PWA foundation  (~1 day)
- Generate icons (192, 512, **maskable**) from `ktc-logo.png` → `public/icons/`.
- `public/manifest.webmanifest` (name "KTC Staff", `display: standalone`, `start_url: /app?app=1`, theme/bg colors, icons).
- `index.html`: link manifest, `theme-color`, `apple-touch-icon`.
- Register the SW on app start (`main.tsx`) with an **update prompt** flow; keep push handlers; add the conservative cache strategy.
- `beforeinstallprompt` capture + an "Install app" button.
- **Done when:** Chrome offers Install; it installs, opens standalone, push still works, no stale‑chunk regressions.

### M2 — App shell + role routing  (~2–3 days)
- `src/app/AppLayout.tsx` (minimal header: logo + role + bell + lock button; no portal nav).
- `src/app/AppHome.tsx` role redirect; routes under `/app/*` in `App.tsx`, gated by `AdminRoute`/auth.
- App‑mode detection util; large‑touch styling tokens.
- **Done when:** launching the installed app drops a checker straight into their screen with no portal chrome; other roles route correctly.

### M3 — Checker scan + confirm  (~2–3 days)  ← core value
- `src/app/AppChecker.tsx`: live camera (`getUserMedia`) + `BarcodeDetector`/fallback → scan slip QR → parse JO id → load the order's X‑ray lines → **confirm per van** via `record_van_xray`. Manual fallback: type JO# / pick from the serving‑ordered queue (reuse `Checker.tsx` logic).
- Big "✓ Confirm X‑ray" targets; haptic/visual confirmation; auto‑advance to next van.
- **Done when:** scanning a real slip shows that order's vans and confirms X‑ray; the queue + serving numbers update; works one‑handed.

### M4 — Hardening  (~1–2 days)
- **Re‑lock overlay:** after N min backgrounded/idle, require a **PIN or WebAuthn biometric** to resume (device‑level "open and check" without re‑login each time, but safe if the device is left unlocked).
- App‑scoped idle (shorter than 60 min for shared gate devices); keep single‑session + MFA.
- **Done when:** backgrounding then returning requires unlock; a left‑open device auto‑locks.

### M5 — Cashier + Operations screens  (~2–4 days)
- `AppCashier` (payment‑proof review + record invoice, reusing `CashierStation` logic) and `AppJobs` (ops queue) in the same focused shell.
- **Done when:** cashier/ops can do their core loop from the app.

### M6 — Packaging (TWA → APK) + MDM  (~1 day + IT)
- `public/.well-known/assetlinks.json` (Digital Asset Links) for TWA verification.
- Bubblewrap build → signed APK; document install/MDM/**kiosk single‑app** steps for IT.
- **Done when:** a signed APK installs on a managed device and runs full‑screen, verified (no browser URL bar).

### M7 — Offline queue (optional / v2)  (~2–3 days)
- IndexedDB queue for checker confirmations; sync on reconnect via the **idempotent** RPC; surface "pending sync" state. Only if gates lack reliable data.

---

## 3. Sequencing & rough effort
M0 → M1 → M2 → **M3 (ship checker app to a pilot device)** → M4 → M5 → M6 → (M7).
Checker pilot reachable in ~**5–7 working days**; cashier/ops + packaging another ~**4–6 days**. (Native parity, for contrast, would be ~3–6 weeks + a permanent 2nd codebase.)

## 4. Testing
- Lighthouse PWA audit each milestone.
- On‑device matrix = the actual gate Android devices (owner provides one for the pilot).
- Manual scan test with real printed slips; queue/serving correctness vs the portal.
- Push delivery while installed (already shipped) — verify standalone install improves reliability.

## 5. Risks & mitigations
- **SW caching vs stale chunks:** conservative strategy (network‑first HTML, cache‑first hashed assets) + version/update prompt; keep existing chunk‑recovery. *Mitigated by design.*
- **`BarcodeDetector` gaps:** ship a JS fallback (`@zxing/browser`). *Verified in M0.*
- **Offline write integrity:** server is source of truth; require RPC idempotency + a "pending sync" UI; prefer online‑first for v1. *Deferred to M7.*
- **Kiosk depends on MDM:** without device management "locked to one app" is best‑effort. *Owner/IT dependency, documented in M6.*

## 6. Decisions still needed from owner
1. Confirm **A1 roles order** (checker‑first?) and **A4** (is the QR on the physical slip the scan target?).
2. Is there an **MDM / kiosk launcher** on the gate devices (Android Enterprise / Google Workspace)?
3. **A5** — do gates have reliable data, or is offline (M7) required for v1?

> On go‑ahead I start **M0 → M1 → M2 → M3** and ship a checker pilot to one device before widening.
