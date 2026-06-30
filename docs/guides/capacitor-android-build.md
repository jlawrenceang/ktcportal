# Build the KTC Android App (Capacitor) — Owner's Step-by-Step Guide

This guide lets the owner produce, sign, install, and hand out a working Android
app for the KTC Online Portal **without the developer present**. Follow the
numbered steps in order. Plain language throughout — no shortcuts assumed.

> **Where things stand (read first).** The native Android project is already set up and committed in this repo (`android/` folder). The app now bundles the built portal assets for internal staff devices, includes the native Checker scanner, and has a staff-only device lane with an offline X-ray outbox. The camera permission is already present. What remains for rollout is real-device smoke, release signing, and optional native cloud-push activation.

Real values used by this app (do not change them unless told to):

- **App ID (package name):** `com.ktcterminal.portal`
- **App name shown on the phone:** `KTC Portal`
- **Customer web portal opened from the staff app:** `https://portal.ktcterminal.com`
- **Web folder bundled:** `dist`
- **Capacitor version:** 8.4.1 (core, CLI, android)
- **Native scanner plugin:** `@capacitor-mlkit/barcode-scanning` 8.1.0 (Google ML Kit)
- **Native staff-device plugins:** Network, Preferences, Haptics, Local Notifications, Share, Push Notifications, Capgo Updater
- **Android SDK levels:** minimum 24 (Android 7), target/compile 36

---

## 1. What the native app gives KTC, and who needs it

The KTC Portal is a website. It works on any phone or tablet browser already. The
native Android app is for **internal staff devices**, especially the Checker yard
workflow.

- In a mobile **browser**, the QR scanner uses a web feature (`BarcodeDetector`)
  that is unreliable — it is missing on many phones and absent on iPhones. When it
  fails, the checker has to type the JO number by hand.
- In the **native app**, the same Checker screen uses Google's ML Kit scanner — a
  proper, fast, reliable camera scanner that works on every Android device.

The app code automatically detects where it is running. Inside the native app it
uses the ML Kit scanner; in a browser it falls back to the web scanner. (In the
code: `Capacitor.isNativePlatform()` decides this — see
`src/app/AppChecker.tsx`.) You do not configure anything for this; the native
build simply turns it on.

**Who needs the native app:** KTC staff devices for the focused `/app/*` work surfaces, especially X-ray checkers at the gate/X-ray line. Customer accounts are blocked inside the APK and sent to the public web portal.

### The most important idea: this app bundles the portal for staff

The app now packages the built `dist/` assets into the APK. That means the APK can launch its own staff shell and keep a device-local X-ray outbox during weak/no signal. It still talks to Supabase for real work, and the offline outbox replays only the server-gated `record_van_xray` action.

The practical effect:

- **Day-to-day web changes ship to the website instantly.** The installed APK does not automatically get those bundled asset changes unless an OTA bundle is configured or a new APK is sideloaded.
- **A new APK is only needed for native changes** — a new device feature/plugin,
  a Capacitor version bump, a permission change, or a change to the app's
  identity/icon/`server.url`. (Full list in step 8.)

So you may only ever do this build **once**, and then rarely again.

---

## 2. One-time setup on the owner's Windows machine

Do this once. It takes 30–60 minutes, mostly downloads.

**2.1 Node.js** — you already have it. To confirm, open **PowerShell** and run:

```
node --version
npm --version
```

If both print a version, you are fine. (If not: https://nodejs.org — install the
LTS version.)

**2.2 Android Studio (includes the JDK and the Android SDK)**

1. Download Android Studio: https://developer.android.com/studio
2. Run the installer, accept the defaults. On first launch it runs a **Setup
   Wizard** — choose **Standard** and let it download the **Android SDK**,
   **SDK Platform**, and **build tools**. Accept the licences when asked.
3. Android Studio ships with its own Java (JDK 21), so you usually do **not** need
   to install Java separately.

**2.3 Set the environment variables** (so command-line builds find the SDK/JDK)

Android Studio installs the SDK at `C:\Users\<you>\AppData\Local\Android\Sdk` and
its JDK under the Android Studio folder. Set these once:

1. Press **Start**, type **"environment variables"**, open **"Edit the system
   environment variables"** → **Environment Variables…**
2. Under **User variables**, click **New** and add:
   - Name `ANDROID_HOME`, Value `C:\Users\<you>\AppData\Local\Android\Sdk`
     (replace `<you>` with your Windows username)
   - Name `JAVA_HOME`, Value the JDK that ships with Android Studio, usually
     `C:\Program Files\Android\Android Studio\jbr`
3. Find the **Path** variable (User), click **Edit**, **New**, and add:
   - `%ANDROID_HOME%\platform-tools`
4. Click OK on all dialogs. **Close and reopen PowerShell** so it picks up the
   changes. Confirm:

```
echo $env:ANDROID_HOME
echo $env:JAVA_HOME
adb --version
```

`adb` printing a version proves the SDK platform-tools are on your path.

**2.4 Turn on Developer mode + USB debugging on the checker device** (needed to
install over a cable)

On the Android tablet/phone:

1. **Settings → About phone** → tap **Build number** seven times until it says
   "You are now a developer."
2. Go back to **Settings → System → Developer options** (on some devices it is
   directly under Settings).
3. Turn on **USB debugging**.
4. Plug the device into the PC with a USB cable. On the device, tap **Allow** when
   it asks "Allow USB debugging?". Confirm the PC sees it:

```
adb devices
```

You should see the device listed (not "unauthorized"). If it says unauthorized,
re-plug and tap Allow on the device.

---

## 3. Generate / refresh the native Android project

**The `android/` folder already exists in this repo and is fully set up** — you do
**not** run `npx cap add android`. You only need to install dependencies, build
the web app, and copy everything into the native project.

Open **PowerShell** in the project folder (`C:\Users\jlawr\github\ktc-portal`) and
run, one line at a time:

```
npm install
npm run build
npx cap sync android
```

What each does:

- `npm install` — downloads the project's libraries (including the scanner plugin).
- `npm run build` — builds the website into the `dist` folder.
- `npx cap sync android` — copies the web build and installs/updates the native
  plugins into `android/`. (Because this app loads the live site, the bundled web
  copy is mostly a fallback, but always run sync so the **native plugins** are
  current.)

Then open the project in Android Studio:

```
npx cap open android
```

Android Studio launches and loads the `android/` folder. The first time, it will
**"Gradle sync"** and download more components — this can take several minutes.
Wait until the bottom status bar says it finished with no errors.

> If `npx cap add android` is ever run by mistake while `android/` already exists,
> Capacitor will refuse or warn — that is expected. Do not delete the existing
> `android/` folder; it holds the working configuration.

---

## 4. App identity, icon, and the camera permission

**4.1 App ID and name** — already correct, nothing to do. They are set in
`capacitor.config.ts` (`appId: com.ktcterminal.portal`, `appName: KTC Portal`) and
mirrored in `android/app/src/main/assets/capacitor.config.json`. Do **not** change
the App ID after the first release — changing it makes the next build look like a
different app and it will not update over the old one.

**4.2 App icon and splash** — the project ships with the default Capacitor icon.
That is fine to ship. If you want the KTC logo:

- The simplest path is Android Studio's built-in tool: right-click the
  `app` module in the left tree → **New → Image Asset** → **Launcher Icons** →
  pick your KTC logo image → Finish. It writes the icon into the `mipmap-*`
  folders under `android/app/src/main/res/`.
- A splash screen is optional and not required for the checkers; skip it for now.

**4.3 Camera permission — already present**

The ML Kit scanner asks for the camera at runtime, but Android also requires the
permission to be **declared** in the app's manifest. This repo already declares
both the camera permission and an optional camera feature, so there is no manual
edit left to do here.

Open this file:

```
android/app/src/main/AndroidManifest.xml
```

Near the bottom you should see:

```
    <uses-permission android:name="android.permission.INTERNET" />
```

```
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
```

If those lines are present, keep going.

> Why this matters: the scanner plugin's own manifest is empty, so the camera
> permission is **not** merged in automatically. You must add it by hand, once. It
> stays in the repo after that.

---

## 5. Build a DEBUG app first and test it on a real device

Always prove it works with a debug build before signing a release. A debug build
needs no keystore.

**Option A — Android Studio (recommended, simplest):**

1. Plug in the checker device (USB debugging on, from step 2.4).
2. In Android Studio's top toolbar, pick your device from the device dropdown.
3. Click the green **Run ▶** button. Studio builds, installs, and launches the app
   on the device automatically.

**Option B — command line:**

```
cd android
.\gradlew assembleDebug
```

The debug APK lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on the connected device with:

```
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Test the scanner (do this on the checker device):**

1. Open the **KTC Portal** app. It loads the live site
   (`https://portal.ktcterminal.com`). Log in as a checker.
2. Go to the **X-ray Checker** screen.
3. Tap **Scan slip QR**. The device should prompt for **camera permission** the
   first time — tap **Allow**. A native full-screen camera scanner opens (this is
   the ML Kit scanner — visibly different from the small in-page web camera).
4. Point it at a Job Order slip QR (these encode `/verify/<id>`). It should detect
   instantly and open that order, ready to confirm X-ray.

If the camera opens natively and a real slip opens the right order, the native
build is working. If the camera is denied, re-check step 4.3 (the CAMERA line) and
rebuild.

---

## 6. Build a SIGNED RELEASE app for distribution

A release build must be **signed** with a keystore — a key file that proves every
future update came from you. **You create this keystore once and reuse it forever.**

### 6.1 Create the keystore (one time)

In PowerShell, run the `keytool` command (it comes with the JDK that Android Studio
installed). Replace the path/passwords with your own and **write the passwords
down**:

```
keytool -genkeypair -v -keystore ktc-release.keystore -alias ktc -keyalg RSA -keysize 2048 -validity 10000
```

It will ask for: a keystore password, your name/organisation (you can put "KTC
Container Terminal Corp."), and confirm. Use a strong password. This creates a file
`ktc-release.keystore` in the current folder. Move it somewhere safe and outside
the repo (for example `C:\Users\<you>\ktc-keys\`).

> ### CRITICAL — back up the keystore and passwords NOW
> The file `ktc-release.keystore` plus its **keystore password**, **key alias**
> (`ktc`), and **key password** are the master key to the app. **If you lose any
> of them, you can NEVER update this app again** — Google/Android will reject any
> update not signed with the same key, and you would have to publish a brand-new
> app and reinstall on every device.
> - Copy the keystore file to **at least two safe places** (e.g. a password
>   manager's secure file storage and an encrypted USB / cloud drive you control).
> - Store the three passwords/alias in your **password manager**, labelled clearly.
> - Do **not** commit the keystore to git (it is ignored on purpose).

### 6.2 Build the signed app — easiest path (Android Studio wizard)

1. In Android Studio: menu **Build → Generate Signed Bundle / APK…**
2. Choose **APK** (for sideloading to your own devices) — or **Android App Bundle
   (AAB)** if you will publish to the Play Store. For KTC's handful of checker
   devices, choose **APK**.
3. Click **Next**. On the key screen: click **Choose existing…**, pick your
   `ktc-release.keystore`, enter the keystore password, select the key alias
   `ktc`, enter the key password. Tick "Remember passwords" if you like. Click
   **Next**.
4. Choose the **release** build variant. Click **Create / Finish**.
5. When it finishes, Android Studio shows a "locate" link. The signed APK is at:

```
android/app/build/outputs/apk/release/app-release.apk
```

(If you chose AAB, it is at `android/app/build/outputs/bundle/release/app-release.aab`.)

That `app-release.apk` is the file you hand out.

### 6.3 APK sideload vs. Play Store — what to choose

- **Sideload the APK (recommended for KTC).** You install the APK directly on each
  checker device (step 7). Best for a small, known fleet of company devices: no
  Google review, no developer account fee, instant. The trade-off is you install
  updates manually — but remember, **web changes need no new APK at all**, so
  updates are rare.
- **Play Store (AAB).** Better for many devices or public distribution, gives
  auto-updates and a store listing, but needs a one-time Google Play Developer
  account (**$25 once**) and a review process. Overkill for a few gate tablets.

For KTC's checkers: **build the signed APK and sideload it.**

---

## 7. Install the app on the checker devices (sideload)

For each checker tablet/phone, the simplest path:

1. **Transfer the APK** to the device. Easiest options:
   - Plug in via USB and run `adb install -r app-release.apk` from the
     `android/app/build/outputs/apk/release/` folder, **or**
   - Email the APK to yourself / put it on Google Drive / copy it onto the device
     over USB, then open it from the device's **Files** app.
2. The first time you open an APK from outside the Play Store, Android asks to
   **"Allow from this source" / "Install unknown apps"** — tap the prompt, enable
   it for the app you are installing from (Files, Chrome, or Drive), go back, and
   tap **Install**.
3. Open **KTC Portal**, log in as the checker, and confirm the scanner works
   (same check as step 5).

Repeat for each checker device. To **update** an installed app later with a new
APK, just install the newer APK over it — as long as it is signed with the **same
keystore**, it updates in place and keeps the login/data.

---

## 8. The over-the-air (OTA) update model in practice

Because the app loads the live site, you will **rarely** rebuild. Use this to
decide whether a change needs a new APK:

**No new APK needed (ships automatically when the developer deploys the website):**

- Bug fixes, new screens, layout/wording/translation changes, new business rules,
  pricing changes, anything in the web app. The installed app picks it up on next
  open.

**A NEW APK is required only when a *native* thing changes:**

1. The Capacitor version is upgraded (e.g. 8.x → 9.x), or the scanner plugin
   version changes.
2. A new native permission or device feature is added (a new plugin, push
   notifications, etc.).
3. The app identity changes — `appId`, app **name**, or the **icon**.
4. The `server.url` changes (e.g. the live site moves to a new domain).

In all four cases the developer will tell you "this one needs a new APK," and you
repeat steps 3 → 6 → 7. Otherwise, do nothing — the web deploy is the update.

---

## 9. iOS (iPhone/iPad) — deferred, out of scope for today

An iPhone/iPad app is possible from the **same** code, but it requires:

- A **Mac computer** (Apple's build tools only run on macOS), and
- An **Apple Developer account at $99/year**.

There is no way to build or sign an iOS app on Windows. Since the checkers use
Android devices, **skip iOS entirely for now.** Revisit only if iPhones are ever
added to the checker fleet. (Android is the cheap path; iOS is the one real cost —
see `~/.claude/references/native-app-delivery.md`.)

---

## 10. Troubleshooting

- **White / blank screen when the app opens.** The app could not reach
  `https://portal.ktcterminal.com`. Check the device has internet, the site is up
  (open it in the device browser), and that you are not on a network that blocks
  it. This app needs a live connection by design.
- **Camera permission denied / scanner won't open.** Make sure you added the
  `<uses-permission android:name="android.permission.CAMERA" />` line (step 4.3)
  and rebuilt. On the device, check **Settings → Apps → KTC Portal → Permissions →
  Camera** is allowed.
- **Gradle sync fails / "Unsupported Java" / JDK version mismatch.** Use the JDK
  bundled with Android Studio. In Android Studio: **File → Settings → Build,
  Execution, Deployment → Build Tools → Gradle**, set **Gradle JDK** to the
  bundled **jbr** (JDK 21). Confirm `JAVA_HOME` (step 2.3) points at the same.
- **"SDK location not found" / "ANDROID_HOME not set".** Set `ANDROID_HOME`
  (step 2.3), reopen PowerShell. Or create a file `android/local.properties`
  containing `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` (double
  backslashes).
- **`adb devices` shows nothing or "unauthorized".** Re-plug the USB cable, and on
  the device tap **Allow** for "Allow USB debugging?". Try a different cable/port;
  some cables are charge-only.
- **`npx cap sync` errors about a missing `dist` folder.** Run `npm run build`
  first — `sync` copies `dist`, so it must exist.
- **The signed-build wizard rejects the password.** Keystore password and key
  password can differ; enter each in its own box. If truly forgotten, the keystore
  is unusable — this is why step 6.1's backup warning matters.
- **App installs but won't update over the old one.** The new APK must be signed
  with the **same keystore** as the installed one, and have the **same App ID**.
  A debug APK and a release APK cannot replace each other — uninstall the debug
  build before installing the release build on the same device.

---

## 11. Final checklist — tick each to reach "signed app, scanning live"

- [ ] Node confirmed (`node --version`) — step 2.1
- [ ] Android Studio installed; Setup Wizard finished downloading the SDK — 2.2
- [ ] `ANDROID_HOME` and `JAVA_HOME` set; `adb --version` works — 2.3
- [ ] Checker device: Developer mode + USB debugging on; `adb devices` lists it — 2.4
- [ ] `npm install` → `npm run build` → `npx cap sync android` ran cleanly — 3
- [ ] `npx cap open android`; Gradle sync finished with no errors — 3
- [ ] **CAMERA permission confirmed** in `android/app/src/main/AndroidManifest.xml` — 4.3
- [ ] DEBUG build installed; native scanner opens and reads a real slip QR — 5
- [ ] Keystore created with `keytool` — 6.1
- [ ] **Keystore file + 3 passwords/alias backed up in two safe places** — 6.1
- [ ] Signed **release APK** produced at
      `android/app/build/outputs/apk/release/app-release.apk` — 6.2
- [ ] APK sideloaded onto each checker device ("install unknown apps" allowed) — 7
- [ ] On each device: logged in as checker, native camera scans a live `/verify/<id>`
      slip and opens the correct order — 5 / 7

When every box is ticked, the signed KTC Portal app is installed on the checker
devices and scanning against the live site. Day-to-day web updates will reach it
automatically; you only repeat this for the native changes listed in step 8.

---

*Source of truth for the values above: `capacitor.config.ts`,
`android/app/build.gradle`, `android/variables.gradle`, `package.json`, and
`src/app/AppChecker.tsx` in this repo. Native-delivery background:
`~/.claude/references/native-app-delivery.md`.*
