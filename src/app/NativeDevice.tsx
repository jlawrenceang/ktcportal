import { useCallback, useEffect, useState } from 'react'
import AppLayout from './AppLayout'
import PushToggle from '../components/PushToggle'
import { useT } from '../lib/i18n'
import {
  addNativeNote,
  clearNativeOutbox,
  getNativeOutbox,
  isNativeApp,
  nativeDeviceSummary,
  syncNativeOutbox,
  type NativeOutboxItem,
} from '../lib/nativeDevice'
import { getNativeUpdateStatus, type NativeUpdateStatus } from '../lib/nativeUpdater'
import { nativeFeedback, scheduleNativeLocalNotification, shareNativeText } from '../lib/nativeUX'

type DeviceSummary = Awaited<ReturnType<typeof nativeDeviceSummary>>

export default function NativeDevice() {
  const { t } = useT()
  const [summary, setSummary] = useState<DeviceSummary>(null)
  const [updateStatus, setUpdateStatus] = useState<NativeUpdateStatus>({ native: false })
  const [rows, setRows] = useState<NativeOutboxItem[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [s, outbox, updater] = await Promise.all([nativeDeviceSummary(), getNativeOutbox(), getNativeUpdateStatus()])
    setSummary(s)
    setRows(outbox)
    setUpdateStatus(updater)
  }, [])

  useEffect(() => {
    void load()
    const onOutbox = () => void getNativeOutbox().then(setRows)
    window.addEventListener('ktc:native-outbox', onOutbox)
    window.addEventListener('ktc:native-network', onOutbox)
    return () => {
      window.removeEventListener('ktc:native-outbox', onOutbox)
      window.removeEventListener('ktc:native-network', onOutbox)
    }
  }, [load])

  async function saveNote() {
    await addNativeNote(note)
    setNote('')
    await load()
  }

  async function syncNow() {
    setBusy(true)
    try {
      const result = await syncNativeOutbox()
      await load()
      await nativeFeedback(result.failed ? 'warning' : 'success')
    } finally {
      setBusy(false)
    }
  }

  async function shareStatus() {
    const pending = rows.filter((r) => !r.syncedAt).length
    const synced = rows.length - pending
    const text = [
      'KTC internal app device status',
      `Platform: ${summary?.info.platform ?? '-'}`,
      `Model: ${summary?.info.model ?? '-'}`,
      `Network: ${summary?.network.connected ? 'Online' : 'Offline'}`,
      `Outbox: ${pending} pending, ${synced} synced`,
      `OTA: ${updateStatus.error ?? updateStatus.version ?? updateStatus.bundle ?? 'Built-in'}`,
    ].join('\n')
    await shareNativeText({ title: 'KTC device status', text })
    await nativeFeedback('light')
  }

  async function testLocalAlert() {
    const ok = await scheduleNativeLocalNotification({
      title: 'KTC internal app',
      body: 'Local yard alerts are working on this device.',
    })
    await nativeFeedback(ok ? 'success' : 'error')
  }

  const pending = rows.filter((r) => !r.syncedAt)

  return (
    <AppLayout title="Device">
      <div className="ktc-glass" style={{ padding: 18, marginTop: 14, display: 'grid', gap: 14 }}>
        <div>
          <h1 className="ktc-title" style={{ fontSize: 22 }}>{t('Device')}</h1>
          <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {t('Native tools for internal yard tablets. Money, invoices, and payments stay online-only.')}
          </p>
        </div>

        {!isNativeApp() ? (
          <div className="ktc-label" style={{ fontSize: 13.5 }}>
            {t('This screen is for the installed Android app. Open the internal APK on a yard phone or tablet.')}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Info label={t('Platform')} value={summary?.info.platform ?? '—'} />
              <Info label={t('Model')} value={summary?.info.model ?? '—'} />
              <Info label={t('Android version')} value={summary?.info.osVersion ?? '—'} />
              <Info label={t('Network')} value={summary?.network.connected ? t('Online') : t('Offline')} />
              <Info label={t('OTA bundle')} value={updateStatus.error ?? updateStatus.version ?? updateStatus.bundle ?? t('Built-in')} />
            </div>

            <div style={{ borderTop: '1px solid var(--glass-brd)', paddingTop: 12 }}>
              <PushToggle />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--glass-brd)', paddingTop: 12 }}>
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void shareStatus()}>
                {t('Share device status')}
              </button>
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void testLocalAlert()}>
                {t('Test local alert')}
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--glass-brd)', paddingTop: 12 }}>
              <label className="ktc-label" htmlFor="yard-note">{t('Yard note')}</label>
              <textarea
                id="yard-note"
                className="ktc-input"
                value={note}
                maxLength={240}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('Type a device-local yard note…')}
              />
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={!note.trim()} onClick={() => void saveNote()} style={{ justifySelf: 'start' }}>
                {t('Save to device')}
              </button>
            </div>
          </>
        )}
      </div>

      {isNativeApp() && (
        <div className="ktc-glass" style={{ padding: 18, marginTop: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{t('Yard outbox')} · {pending.length}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void syncNow()}>
                {busy ? t('Syncing…') : t('Sync now')}
              </button>
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={!rows.length} onClick={() => void clearNativeOutbox().then(load)}>
                {t('Clear local')}
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="ktc-label" style={{ margin: 0, fontSize: 13 }}>{t('No local yard items on this device.')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((r) => (
                <div key={r.id} style={{ padding: 12, borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{r.kind === 'xray_confirm' ? t('X-ray confirmation') : t('Yard note')}</b>
                    <span className={`ktc-chip${r.syncedAt ? ' ktc-chip--success' : ''}`}>{r.syncedAt ? t('Synced') : t('Pending')}</span>
                  </div>
                  <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{r.text}</p>
                  {r.error && <p style={{ margin: '6px 0 0', color: 'var(--acc-2)', fontSize: 12.5 }}>{r.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
      <div className="ktc-label" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3 }}>{value}</div>
    </div>
  )
}
