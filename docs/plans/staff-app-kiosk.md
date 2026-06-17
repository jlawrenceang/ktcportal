# Deploying the KTC Staff App on company devices (kiosk)

Company‑owned Android devices for **checker · cashier · CS**. Goal: each device is a
locked, single‑purpose KTC terminal running the installed app.

## ⚠️ Critical: one account PER DEVICE (not per role)
The portal enforces **one active session per account** — a second login on the same
account evicts the first. So if three checker tablets all sign in as one "checker"
account, they will **continuously sign each other out**.

→ Create a **distinct staff account per device** (or per person):
`checker-gate1`, `checker-gate2`, `cashier-window1`, `cs-desk1`, … via
**Settings → Create staff account** (owner only). Each device stays signed in on
its own account, and the app routes it to the right screen automatically:
- checker account → the X‑ray scan screen (`/app/checker`)
- cashier account → the cashier station
- CS (csr) account → the support inbox

## Per‑device setup (once each)
1. Install **KTC‑Portal.apk** (sideload, or push via MDM — see below).
2. Open it, **sign in** with that device's account.
3. Turn on **🔔 Phone alerts** (bell → toggle) so it gets push.
4. **Lock the device to the app** (kiosk) — pick one option below.

## Locking the device to the app
**Option A — Screen Pinning (free, built‑in, good for a handful of devices)**
Settings → Security → **App pinning / Screen pinning** → ON (require PIN to unpin).
Open the KTC app → Recents → pin it. The user can't leave without the PIN.
Crude but free and immediate; fine for trusted staff.

**Option B — MDM / Android Enterprise kiosk (proper fleet management, recommended at scale)**
Enroll the devices in an MDM, push the APK, and set **single‑app / lock‑task (kiosk) mode**
locked to `com.ktcterminal.portal`. The device boots straight into the app, can't run
anything else, and you update/lock/wipe centrally. Options:
- **Google Android Management API** — free, DIY (most control).
- **Managed MDMs** — Esper, Scalefusion, Miradore (free tier), Headwind MDM (open source).
- **Samsung devices** — Samsung Knox kiosk.

> Alternative (no APK): a kiosk‑browser app (e.g. Fully Kiosk) pointed at
> `https://portal.ktcterminal.com` also locks a device to the portal. The APK is
> cleaner (branded, our package id, app‑update control), so prefer it — but this
> is a valid fallback.

## Why the APK here (vs. just the browser)
On a *personal* phone the browser "Add to Home screen" is identical. The APK earns
its place **only** on managed company devices: it enables **kiosk lockdown** (can't
leave the app) and **central MDM management** — neither possible with a browser tab.

## Notes
- Same code as the website — every `git push` updates all devices instantly. You only
  rebuild/redistribute the APK to change the wrapper (icon/name/package).
- Keep `android-keystore.jks` + its password (in `.env.local`) backed up — they sign
  every future APK update.
- Rebuild recipe: see `docs/plans/staff-app-apk.md`.

## Optional polish (say the word)
Cashier + CS currently open their existing portal pages inside the app (functional).
A focused, single‑purpose **app screen** for each (like the checker's scan screen) —
bigger touch targets, no extra nav — can be built next if you want the cleaner kiosk feel.
