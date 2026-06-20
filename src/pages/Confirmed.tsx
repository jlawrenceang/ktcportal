import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'

// Landing page for the email-confirmation link. The link signs the user in (the
// token is in the URL); the email is confirmed server-side by the time we land
// here. Because the link usually opens in a NEW tab from the email app, we count
// down and auto-close it; "Sign in here" lets them instead continue in this tab.
const COUNTDOWN = 3

export default function Confirmed() {
  const { signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [secs, setSecs] = useState(COUNTDOWN)
  const [cancelled, setCancelled] = useState(false)
  const [cantClose, setCantClose] = useState(false)
  const [busy, setBusy] = useState(false)

  async function continueToLogin() {
    setCancelled(true) // stop the auto-close countdown
    setBusy(true)
    await signOut()
    sessionStorage.setItem('ktc_email_confirmed', '1')
    navigate('/login', { replace: true })
  }

  // Auto-close countdown. Browsers only allow window.close() on script-opened
  // windows — if the email app opened this tab, the close is blocked, so we fall
  // back to guiding the user to close it manually and sign in at the portal.
  useEffect(() => {
    if (cancelled) return
    if (secs <= 0) {
      window.close()
      const id = setTimeout(() => setCantClose(true), 300)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setSecs((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [secs, cancelled])

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px', textAlign: 'center' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 56, marginBottom: 18 }} />
        <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }}>✓</div>
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('Email confirmed')}</h1>
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
          {t('Thanks — your email address is verified. This window will close shortly; then sign in at portal.ktcterminal.com to continue and upload your valid ID.')}
        </p>
        <button className="ktc-btn" type="button" disabled={busy} onClick={() => void continueToLogin()} style={{ marginTop: 18, width: '100%' }}>
          {busy ? t('Please wait…') : t('Sign in here')}
        </button>
        {!cancelled && !cantClose && secs > 0 && (
          <p className="ktc-label" style={{ marginTop: 12, fontSize: 12.5, opacity: 0.85 }}>
            {t('This window will close in {n}…', { n: secs })}
          </p>
        )}
        {cantClose && (
          <p className="ktc-label" style={{ marginTop: 12, fontSize: 12.5, opacity: 0.85, lineHeight: 1.5 }}>
            {t('You can now close this tab and sign in at portal.ktcterminal.com.')}
          </p>
        )}
      </div>
    </div>
  )
}
