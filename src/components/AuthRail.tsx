import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useT } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { isNativeApp } from '../lib/nativeDevice'

// The menu ("/") — the ways in: Sign in / Create an account / (optionally) Continue with Google.
// Google is HIDDEN until the provider + consent-screen branding are configured in Supabase
// (go-live-todo §3) — otherwise the button produced no redirect, no error, nothing. Flip
// VITE_GOOGLE_OAUTH_ENABLED=true once the provider is live. Rendered into PublicShell's
// .ktc-landing__access section.
const GOOGLE_OAUTH_ENABLED = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true'

export default function AuthRail() {
  const { t } = useT()
  const nativeApp = isNativeApp()
  const [oauthError, setOauthError] = useState<string | null>(null)

  async function signInWithGoogle() {
    // New Google users come back with a verified email but no consent/contact — ProtectedRoute
    // routes them through FinishRegistration. On success this redirects; only errors return.
    setOauthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) setOauthError(error.message)
  }

  return (
    <>
      <div className="ktc-landing__cta">
        <Link to="/login" className="ktc-btn" style={{ textDecoration: 'none' }}>
          {t('Sign in')}
        </Link>
        {!nativeApp && (
          <Link to="/register" className="ktc-btn-secondary" style={{ textDecoration: 'none' }}>
            {t('Create an account')}
          </Link>
        )}
        {!nativeApp && GOOGLE_OAUTH_ENABLED && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--glass-brd)' }} />
              <span className="ktc-label" style={{ fontSize: 11.5, opacity: 0.7 }}>{t('or')}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--glass-brd)' }} />
            </div>
            <button type="button" className="ktc-btn-secondary" onClick={() => void signInWithGoogle()} style={{ gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: '0 0 auto' }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {t('Continue with Google')}
            </button>
            {oauthError && (
              <p className="ktc-label" style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--danger, #c0392b)', textAlign: 'center' }}>
                {oauthError}
              </p>
            )}
          </>
        )}
      </div>
      <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, textAlign: 'center' }}>
        {nativeApp
          ? t('This installed app is for KTC staff yard devices. Customer accounts should use the web portal.')
          : t('Create an account to begin accreditation.')}
      </p>
    </>
  )
}
