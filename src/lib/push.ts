import { supabase } from './supabase'

// Web Push client helpers — register the service worker, subscribe the browser
// (storing the PushSubscription for the send-push Edge Function), and tear it
// down. The VAPID public key is read from public.push_config so no build-time
// env var is needed.

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function urlB64ToUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function isPushOn(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return !!sub
  } catch { return false }
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Phone alerts aren’t supported on this browser.' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, error: 'Notifications are blocked — allow them in your browser/site settings.' }

  const { data: cfg } = await supabase.from('push_config').select('value').eq('key', 'vapid_public').maybeSingle()
  const vapid = (cfg as { value: string } | null)?.value
  if (!vapid) return { ok: false, error: 'Phone alerts aren’t set up yet. Please try again later.' }

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapid) as BufferSource })
  }
  const json = sub.toJSON()
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return { ok: false, error: 'Please sign in again.' }
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: uid,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* best-effort */ }
}
