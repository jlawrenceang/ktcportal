import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ktcterminal.portal',
  appName: 'KTC Portal',
  webDir: 'dist',
  // Internal APK model: bundle the built portal assets into the app so yard
  // devices can launch and keep a local X-ray outbox during weak/no signal.
  // Tradeoff: web deploys do not auto-update the APK; rebuild/sideload or add
  // an OTA updater when the internal app needs a new packaged version.
  plugins: {
    CapacitorUpdater: {
      autoUpdate: 'atBackground',
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },
  },
};

export default config;
