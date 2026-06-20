import { useEffect, useState } from 'react'
import { pushSupported, isPushOn, enablePush, disablePush } from '../lib/push'
import { useT } from '../lib/i18n'
import { BellIcon } from './icons'

// Turn phone push alerts on/off. Lives in the notification bell dropdown
// (variant 'bell') and can also be used as a nav ⊞ Menu row (variant 'menu').
// Hidden entirely on browsers that don't support Web Push.
//
// "On" requests the device permission (if needed) + subscribes this device;
// "Off" unsubscribes (alerts stop). The web can't REVOKE a granted OS
// permission — only the user can in browser settings — but with no subscription
// nothing is sent, so Off truly stops alerts.
export default function PushToggle({ variant = 'menu' }: { variant?: 'menu' | 'bell' }) {
  const { t } = useT()
  const [supported] = useState(pushSupported())
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { void isPushOn().then(setOn) }, [])

  if (!supported) return null

  async function toggle() {
    setBusy(true); setErr(null)
    try {
      if (on) {
        await disablePush()
        setOn(false)
      } else {
        const r = await enablePush()
        if (r.ok) setOn(true)
        else setErr(r.error ?? t('Could not enable alerts.'))
      }
    } finally {
      setBusy(false)
    }
  }

  const statusChip = (
    <span className={`ktc-chip${on ? ' ktc-chip--success' : ''}`} style={{ fontSize: 11 }}>
      {busy ? t('…') : on ? t('On') : t('Off')}
    </span>
  )

  if (variant === 'bell') {
    return (
      <div style={{ borderTop: '1px solid var(--glass-brd)', padding: '10px 12px' }}>
        <button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={on}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'hsl(var(--ink))' }}>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}><BellIcon size={15} /> {t('Notifications on this device')}</span>
          {statusChip}
        </button>
        {err && <div className="ktc-label" style={{ fontSize: 11, color: 'var(--acc-2)', marginTop: 6 }}>{err}</div>}
      </div>
    )
  }

  return (
    <>
      <button type="button" className="ktc-menu-setting" onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
        <span style={{ flex: 1, textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 8 }}><BellIcon size={16} /> {t('Notifications')}</span>
        {statusChip}
      </button>
      {err && <div className="ktc-label" style={{ fontSize: 11.5, color: 'var(--acc-2)', padding: '0 2px 4px' }}>{err}</div>}
    </>
  )
}
