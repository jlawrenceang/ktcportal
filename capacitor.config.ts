import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ktcterminal.portal',
  appName: 'KTC Portal',
  webDir: 'dist',
  // Phase 3 — update model. The Checker is network-dependent (it reads the live X-ray
  // queue and calls record_van_xray on every scan), so an offline-bundled shell buys
  // little. We load the live site directly: every Vercel deploy auto-updates the installed
  // app with NO re-package and NO external OTA service. The native ML Kit scanner still
  // runs because Capacitor.isNativePlatform() is true inside the shell and the plugin's JS
  // proxy ships in the deployed bundle. Re-package (Phase 4) is only needed for native
  // changes (a new plugin / a Capacitor bump). If offline resilience is later required,
  // switch to a locally-bundled build + Capgo OTA — see ~/.claude/references/native-app-delivery.md.
  server: {
    url: 'https://portal.ktcterminal.com',
    cleartext: false,
  },
};

export default config;
