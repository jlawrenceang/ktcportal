import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { Network, type ConnectionStatus } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { supabase } from './supabase'
import { nativeFeedback, scheduleNativeLocalNotification } from './nativeUX'

const OUTBOX_KEY = 'ktc_native_outbox'

export type NativeOutboxItem = {
  id: string
  kind: 'note' | 'xray_confirm'
  text: string
  createdAt: string
  lineId?: string
  container?: string
  jo?: string
  userId?: string
  userEmail?: string
  syncedAt?: string
  error?: string
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export async function nativeDeviceSummary() {
  if (!isNativeApp()) return null
  const [info, id, network] = await Promise.all([
    Device.getInfo(),
    Device.getId(),
    Network.getStatus(),
  ])
  return { info, id: id.identifier, network }
}

export async function getNativeOutbox(): Promise<NativeOutboxItem[]> {
  const { value } = await Preferences.get({ key: OUTBOX_KEY })
  if (!value) return []
  try {
    const rows = JSON.parse(value)
    return Array.isArray(rows) ? rows as NativeOutboxItem[] : []
  } catch {
    return []
  }
}

export async function saveNativeOutbox(rows: NativeOutboxItem[]) {
  await Preferences.set({ key: OUTBOX_KEY, value: JSON.stringify(rows.slice(0, 100)) })
  window.dispatchEvent(new CustomEvent('ktc:native-outbox'))
}

export async function addNativeNote(text: string) {
  const rows = await getNativeOutbox()
  const clean = text.trim().slice(0, 240)
  if (!clean) return rows
  const next: NativeOutboxItem[] = [
    { id: crypto.randomUUID(), kind: 'note', text: clean, createdAt: new Date().toISOString() },
    ...rows,
  ]
  await saveNativeOutbox(next)
  await nativeFeedback('success')
  return next
}

export async function queueNativeXrayConfirm(args: { lineId: string; container: string; jo: string }) {
  const rows = await getNativeOutbox()
  if (rows.some((r) => r.kind === 'xray_confirm' && r.lineId === args.lineId && !r.syncedAt)) return rows
  const user = (await supabase.auth.getUser()).data.user
  const actorError = user?.id ? undefined : 'Please sign in again.'
  const next: NativeOutboxItem[] = [
    {
      id: crypto.randomUUID(),
      kind: 'xray_confirm',
      lineId: args.lineId,
      container: args.container,
      jo: args.jo,
      userId: user?.id,
      userEmail: user?.email ?? undefined,
      text: `X-ray confirmation queued for ${args.container} (${args.jo})`,
      createdAt: new Date().toISOString(),
      error: actorError,
    },
    ...rows,
  ]
  await saveNativeOutbox(next)
  await nativeFeedback('warning')
  await scheduleNativeLocalNotification({
    title: 'KTC yard item queued',
    body: `${args.container} (${args.jo}) will sync when this device is online.`,
  })
  return next
}

export async function clearNativeOutbox() {
  await Preferences.remove({ key: OUTBOX_KEY })
  window.dispatchEvent(new CustomEvent('ktc:native-outbox'))
}

// Yard-only sync: never replays money/payment/invoice actions. X-ray confirmation
// is idempotent and server-gated (confirm_xray + order status), so it is safe to
// retry from a tablet once the yard connection comes back.
export async function syncNativeOutbox(): Promise<{ attempted: number; synced: number; failed: number; offline: boolean }> {
  const empty = { attempted: 0, synced: 0, failed: 0, offline: false }
  if (!isNativeApp()) return empty
  const status = await Network.getStatus()
  if (!status.connected) return { ...empty, offline: true }
  const rows = await getNativeOutbox()
  if (!rows.length) return empty
  let changed = false
  let attempted = 0
  let synced = 0
  let failed = 0
  const next: NativeOutboxItem[] = []
  const currentUser = (await supabase.auth.getUser()).data.user
  for (const row of rows) {
    if (row.syncedAt) { next.push(row); continue }
    attempted += 1
    if (row.kind === 'note') {
      synced += 1
      next.push({ ...row, syncedAt: new Date().toISOString(), error: undefined }); changed = true; continue
    }
    if (row.kind === 'xray_confirm' && row.lineId) {
      if (!row.userId) {
        failed += 1
        next.push({ ...row, error: 'This queued X-ray confirmation predates staff binding. Re-confirm it while signed in as the original checker.' })
        changed = true
        continue
      }
      if (!currentUser?.id) {
        failed += 1
        next.push({ ...row, error: 'Please sign in again.' })
        changed = true
        continue
      }
      if (row.userId !== currentUser.id) {
        failed += 1
        next.push({ ...row, error: `Queued by ${row.userEmail ?? 'another staff account'}; sign in as that staff member to sync this X-ray confirmation.` })
        changed = true
        continue
      }
      const { error } = await supabase.rpc('record_van_xray', { p_line_id: row.lineId })
      if (error) {
        failed += 1
        next.push({ ...row, error: error.message })
      } else {
        synced += 1
        next.push({ ...row, syncedAt: new Date().toISOString(), error: undefined })
      }
      changed = true
      continue
    }
    failed += 1
    next.push(row)
  }
  if (changed) await saveNativeOutbox(next)
  if (attempted > 0 && synced > 0) {
    await nativeFeedback(failed ? 'warning' : 'success')
    await scheduleNativeLocalNotification({
      title: failed ? 'KTC yard sync partly finished' : 'KTC yard sync finished',
      body: failed ? `${synced} synced, ${failed} still need review.` : `${synced} local yard item(s) synced.`,
    })
  }
  return { attempted, synced, failed, offline: false }
}

export function installNativeDeviceHooks() {
  if (!isNativeApp()) return
  void Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
    window.dispatchEvent(new CustomEvent('ktc:native-network', { detail: status }))
    if (status.connected) void syncNativeOutbox()
  })
  void App.addListener('resume', () => { void syncNativeOutbox() })
}
