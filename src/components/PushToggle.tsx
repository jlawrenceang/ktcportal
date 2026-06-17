import { useEffect, useState } from 'react'
import { pushSupported, isPushOn, enablePush, disablePush } from '../lib/push'
import { useT } from '../lib/i18n'

// A settings row (used in both nav ⊞ Menus) to turn phone push alerts on/off.
// Hidden entirely on browsers that don't support Web Push.
export default function PushToggle() {
  const { t } = useT()
  const [supported] = useState(pushSupported())
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { void isPushOn().then(setOn) }, [])

  if (!supported) return null

  async function toggle() {
    setBusy(true); setErr(null)
    if (on) {
      await disablePush()
      setOn(false)
    } else {
      const r = await enablePush()
      if (r.ok) setOn(true)
      else setErr(r.error ?? t('Could not enable alerts.'))
    }
    setBusy(false)
  }

  return (
    <>
      <button type="button" className="ktc-menu-setting" onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
        <span style={{ flex: 1, textAlign: 'left' }}>🔔 {t('Phone alerts')}</span>
        <span className={`ktc-chip${on ? ' ktc-chip--success' : ''}`} style={{ fontSize: 11 }}>
          {busy ? t('…') : on ? t('On') : t('Off')}
        </span>
      </button>
      {err && <div className="ktc-label" style={{ fontSize: 11.5, color: 'var(--acc-2)', padding: '0 2px 4px' }}>{err}</div>}
    </>
  )
}
