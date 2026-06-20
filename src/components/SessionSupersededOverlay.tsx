import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onSuperseded } from '../lib/sessionEvents'
import { useT } from '../lib/i18n'
import { WaveIcon } from './icons'

// App-root overlay: the in-session "you were just signed out on another
// device" notice. useSessionGuard emits the event (and has already signed
// this client out locally) the instant a newer login claims the account —
// either via the realtime nudge or the 60s poll. This is the heads-up the
// evicted device sees before it lands back on the sign-in screen.
export default function SessionSupersededOverlay() {
  const { t } = useT()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)

  useEffect(() => onSuperseded(() => setShow(true)), [])

  if (!show) return null

  function dismiss() {
    setShow(false)
    navigate('/login', { replace: true })
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}
    >
      <div className="ktc-glass" style={{ padding: 32, maxWidth: 430, width: '100%' }}>
        <div style={{ marginBottom: 8, color: 'var(--acc)' }} aria-hidden><WaveIcon size={32} /></div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>{t('Signed out on this device')}</h1>
        <p className="ktc-label" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6 }}>
          {t('Your account was just opened on another device, and for security only one device stays signed in at a time — so this one was signed out. That’s normal if it was you. Nothing is lost; your work is saved.')}
        </p>
        <p className="ktc-label" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, opacity: 0.85 }}>
          {t('If this wasn’t you, sign in again and change your password.')}
        </p>
        <button className="ktc-btn" type="button" onClick={dismiss} style={{ marginTop: 20, width: '100%' }}>
          {t('Back to sign in')}
        </button>
      </div>
    </div>
  )
}
