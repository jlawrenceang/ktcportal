import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'
import { CheckCircleIcon, AlertTriangleIcon } from '../components/icons'

// Landing page for the email-confirmation link. Supabase's link carries a
// ONE-TIME token: a valid first click establishes a session here (email is
// confirmed server-side); a reused/expired link — or a direct visit — lands with
// no session and an error in the URL. We honor that:
//   • valid    → "Email confirmed" + auto-close the tab (it usually opens in its
//                own tab from the email app)
//   • invalid  → "this link is no longer valid", send them to sign in
const COUNTDOWN = 3

// Auth error Supabase puts in the URL on a reused/expired/invalid link (captured
// at mount, before supabase-js strips the hash).
function urlAuthError(): string | null {
  if (typeof window === 'undefined') return null
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const q = window.location.search ? new URLSearchParams(window.location.search) : new URLSearchParams()
  return h.get('error_description') || h.get('error') || q.get('error_description') || q.get('error') || null
}

export default function Confirmed() {
  const { session, loading, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const errRef = useRef<string | null>(urlAuthError())
  const [verdict, setVerdict] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [secs, setSecs] = useState(COUNTDOWN)
  const [cancelled, setCancelled] = useState(false)
  const [cantClose, setCantClose] = useState(false)
  const [busy, setBusy] = useState(false)

  // Decide validity once auth settles. A valid link establishes a session (often
  // a moment after load, via onAuthStateChange), so we give it a short grace
  // window before declaring the link invalid.
  useEffect(() => {
    if (errRef.current) { setVerdict('invalid'); return }
    if (session) { setVerdict('ok'); return }
    if (loading) return
    const id = setTimeout(() => setVerdict((v) => (v === 'checking' ? 'invalid' : v)), 1500)
    return () => clearTimeout(id)
  }, [session, loading])

  async function continueToLogin() {
    setCancelled(true)
    setBusy(true)
    await signOut()
    sessionStorage.setItem('ktc_email_confirmed', '1')
    navigate('/login', { replace: true })
  }

  // Auto-close only on success. Browsers allow window.close() on script-opened
  // tabs or single-history-entry tabs (a fresh email tab qualifies); if blocked,
  // we guide the user to close it and sign in at the portal.
  useEffect(() => {
    if (verdict !== 'ok' || cancelled) return
    if (secs <= 0) {
      window.close()
      const id = setTimeout(() => setCantClose(true), 300)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setSecs((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [verdict, secs, cancelled])

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px', textAlign: 'center' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 56, marginBottom: 18 }} />

        {verdict === 'checking' ? (
          <>
            <div className="ktc-skeleton" style={{ height: 10, width: 140, margin: '10px auto 14px', borderRadius: 999 }} />
            <p className="ktc-label">{t('Verifying your link…')}</p>
          </>
        ) : verdict === 'ok' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--ok, #1c9e6b)' }}><CheckCircleIcon size={40} /></div>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('Email confirmed')}</h1>
            <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {t('Thanks — your email address is verified. This window will close shortly; then sign in at portal.ktcterminal.com to continue and upload your valid ID.')}
            </p>
            <button className="ktc-btn" type="button" disabled={busy} onClick={() => void continueToLogin()} style={{ marginTop: 18, width: '100%' }}>
              {busy ? t('Please wait…') : t('Sign in here')}
            </button>
            {!cancelled && !cantClose && secs > 0 && (
              <p className="ktc-label" style={{ marginTop: 12, fontSize: 12.5, opacity: 0.85 }}>{t('This window will close in {n}…', { n: secs })}</p>
            )}
            {cantClose && (
              <p className="ktc-label" style={{ marginTop: 12, fontSize: 12.5, opacity: 0.85, lineHeight: 1.5 }}>{t('You can now close this tab and sign in at portal.ktcterminal.com.')}</p>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--acc-2)' }}><AlertTriangleIcon size={38} /></div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('This link is no longer valid')}</h1>
            <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {t('This confirmation link has already been used or has expired. If you’ve already confirmed your email, just sign in. Otherwise sign in to send yourself a fresh confirmation link.')}
            </p>
            <button className="ktc-btn" type="button" onClick={() => navigate('/login', { replace: true })} style={{ marginTop: 18, width: '100%' }}>
              {t('Go to sign in')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
