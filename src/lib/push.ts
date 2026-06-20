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

// Bound any single step so a stalled browser API / push service (e.g. a network
// that blocks FCM) surfaces as an error instead of freezing the UI forever.
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  // Promise.resolve coerces supabase's thenable query builders to real Promises.
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out — please try again.`)), ms)),
  ])
}

// iOS / iPadOS only deliver Web Push to apps ADDED TO THE HOME SCREEN. In a
// plain Safari tab PushManager exists (so the toggle shows) but requesting
// permission / subscribing silently never resolves — the "stuck on …" report.
// Detect that case and fail fast with guidance instead of spinning forever.
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as Mac
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true
}

// Subscribe this browser + persist the subscription. Every network / browser
// step is individually time-bounded so none can stall indefinitely.
async function subscribeAndSave(vapid: string): Promise<{ ok: boolean; error?: string }> {
  const reg = await withTimeout(navigator.serviceWorker.register('/sw.js'), 10_000, 'Starting the background service')
  await withTimeout(navigator.serviceWorker.ready, 10_000, 'Starting the background service')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await withTimeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapid) as BufferSource }),
      15_000, 'Connecting to the notification service')
  }
  const json = sub.toJSON()
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return { ok: false, error: 'Please sign in again.' }
  const { error } = await withTimeout(supabase.from('push_subscriptions').upsert({
    user_id: uid,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' }), 10_000, 'Saving')
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Never throws and never hangs. Permission is user-gated (we don't cut off the
// person's own decision with a tight timer), but it's still bounded so the
// caller's busy state ("…") can never get stuck forever, and every step after
// it is individually capped.
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Notifications aren’t supported on this browser.' }
  if (isIos() && !isStandalone()) {
    return { ok: false, error: 'On iPhone/iPad: tap Share → “Add to Home Screen”, then open the app from there to turn on notifications.' }
  }
  try {
    let perm = Notification.permission
    if (perm === 'default') {
      // Generous cap: a deciding user takes seconds; this only rescues the rare
      // browser where the permission promise never settles at all.
      perm = await withTimeout(Notification.requestPermission(), 60_000, 'Waiting for your permission choice')
    }
    if (perm !== 'granted') return { ok: false, error: 'Notifications are blocked — allow them in your browser/site settings.' }

    const { data: cfg } = await withTimeout(
      supabase.from('push_config').select('value').eq('key', 'vapid_public').maybeSingle(), 10_000, 'Loading settings')
    const vapid = (cfg as { value: string } | null)?.value
    if (!vapid) return { ok: false, error: 'Notifications aren’t set up yet. Please try again later.' }

    return await withTimeout(subscribeAndSave(vapid), 20_000, 'Enabling alerts')
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Could not enable alerts. Please try again.' }
  }
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
