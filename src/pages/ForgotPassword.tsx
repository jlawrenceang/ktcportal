import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from '../components/Turnstile'

// Request a password-reset email. Supabase sends the reset link (same Resend SMTP);
// it lands on /reset-password where the user sets a new password.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (captchaEnabled && !captchaToken) { setError('Please complete the CAPTCHA.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { error: rErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
      captchaToken: captchaToken ?? undefined,
    })
    setBusy(false)
    setCaptchaToken(null); setCaptchaKey((k) => k + 1) // token is single-use
    if (rErr) { setError(rErr.message); return }
    setNotice('✓ If that email is registered, a password-reset link is on its way. Check your inbox (and spam folder).')
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 56, marginBottom: 18 }} />
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>Reset password</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          Enter your account email and we’ll send you a link to set a new password.
        </p>

        {notice && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'hsl(150 55% 95%)', border: '1px solid hsl(150 45% 80%)', color: 'hsl(150 55% 26%)', fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>
            {notice}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'hsl(0 75% 96%)', border: '1px solid hsl(0 70% 85%)', color: 'hsl(0 65% 42%)', fontSize: 13, fontWeight: 500 }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="email">Email</label>
            <input id="email" className="ktc-input" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          {captchaEnabled && (
            <Turnstile key={captchaKey} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken(null)} />
          )}
          <button className="ktc-btn" type="submit" disabled={busy || (captchaEnabled && !captchaToken)} style={{ marginTop: 4 }}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          <Link to="/login" className="ktc-link">← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
