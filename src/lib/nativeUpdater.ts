import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

export type NativeUpdateStatus = {
  native: boolean
  bundle?: string | null
  version?: string | null
  error?: string
}

export function installNativeUpdaterReadySignal() {
  if (!Capacitor.isNativePlatform()) return
  // Must run early: this marks the current bundle as healthy so Capgo does not
  // roll it back on the next launch.
  void CapacitorUpdater.notifyAppReady()
}

export async function getNativeUpdateStatus(): Promise<NativeUpdateStatus> {
  if (!Capacitor.isNativePlatform()) return { native: false }
  try {
    const current = await CapacitorUpdater.current()
    return {
      native: true,
      bundle: current.bundle?.id ?? null,
      version: current.bundle?.version ?? null,
    }
  } catch (e) {
    return { native: true, error: (e as Error)?.message || 'Updater status unavailable' }
  }
}
