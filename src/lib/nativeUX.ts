import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Share } from '@capacitor/share'

export type NativeFeedback = 'success' | 'warning' | 'error' | 'light'

export function isNativeUXAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

export async function nativeFeedback(kind: NativeFeedback = 'light') {
  if (!isNativeUXAvailable()) return
  try {
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success })
    else if (kind === 'warning') await Haptics.notification({ type: NotificationType.Warning })
    else if (kind === 'error') await Haptics.notification({ type: NotificationType.Error })
    else await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics are best-effort and should never block yard work.
  }
}

async function ensureLocalNotificationPermission(): Promise<boolean> {
  if (!isNativeUXAvailable()) return false
  try {
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display === 'prompt') perm = await LocalNotifications.requestPermissions()
    return perm.display === 'granted'
  } catch {
    return false
  }
}

export async function scheduleNativeLocalNotification(args: { title: string; body: string; id?: number }) {
  if (!await ensureLocalNotificationPermission()) return false
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: args.id ?? Math.floor(Date.now() % 2_000_000_000),
        title: args.title,
        body: args.body,
        schedule: { at: new Date(Date.now() + 500) },
      }],
    })
    return true
  } catch {
    return false
  }
}

export async function shareNativeText(args: { title: string; text: string; dialogTitle?: string }) {
  if (!isNativeUXAvailable()) return false
  try {
    await Share.share({
      title: args.title,
      text: args.text,
      dialogTitle: args.dialogTitle ?? args.title,
    })
    return true
  } catch {
    return false
  }
}
