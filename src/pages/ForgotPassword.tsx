import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from '../components/Turnstile'
import { useT } from '../lib/i18n'

// After a reset email is sent, hold the button for this long (per email) so a
// user can't fire a burst of emails — and gets a friendly countdown instead of
// Supabase's opaque rate-limit error. The server-side rate limit + CAPTCHA are
// the real backstops; this is UX. Persisted so a refresh doesn't bypass it.
const RESEND_COOLDOWN_MS = 60_000
const cdKey = (em: string) => `ktc_reset_cd_${em.trim().toLowerCase()}`

function readCooldown(em: string): number | null {
  if (!em.trim()) return null
  try {
    const v = Number(localStorage.getItem(cdKey(em)))
    return v && v > Date.now() ? v : null
  } catch { return null }
}

// Request a password-reset email. Supabase sends the reset link (same Resend SMTP);
// it lands on /reset-password where the user sets a new password.
export default function ForgotPassword() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())

  // Re-check the cooldown whenever the typed email changes.
  useEffect(() => { setCooldownUntil(readCooldown(email)) }, [email])

  // Tick the countdown while a cooldown is active.
  useEffect(() => {
    if (!cooldownUntil) return
    const id = setInterval(() => {
      const now = Date.now()
      setNowTs(now)
      if (now >= cooldownUntil) setCooldownUntil(null)
    }, 500)
    return () => clearInterval(id)
  }, [cooldownUntil])

  const cooldownSecs = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000)) : 0
  const cooling = cooldownSecs > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (cooling) return
    if (captchaEnabled && !captchaToken) { setError(t('Please complete the CAPTCHA.')); return }
    setBusy(true); setError(null); setNotice(null)
    const { error: rErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
      captchaToken: captchaToken ?? undefined,
    })
    setBusy(false)
    setCaptchaToken(null); setCaptchaKey((k) => k + 1) // token is single-use
    if (rErr) { setError(rErr.message); return }
    // Start the per-email cooldown so repeated sends are throttled.
    const until = Date.now() + RESEND_COOLDOWN_MS
    try { localStorage.setItem(cdKey(email), String(until)) } catch { /* ignore */ }
    setCooldownUntil(until)
    setNotice(t('✓ If that email is registered, a password-reset link is on its way. Check your inbox (and spam folder).'))
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px' }}>
        <img src="/ktc-logo.png" alt={t('KTC Container Terminal Corp')} style={{ height: 56, marginBottom: 18 }} />
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('Reset password')}</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          {t('Enter your account email and we’ll send you a link to set a new password.')}
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
            <label className="ktc-label" htmlFor="email">{t('Email')}</label>
            <input id="email" className="ktc-input" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          {captchaEnabled && (
            <Turnstile key={captchaKey} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken(null)} />
          )}
          <button className="ktc-btn" type="submit" disabled={busy || cooling || (captchaEnabled && !captchaToken)} style={{ marginTop: 4 }}>
            {busy ? t('Sending…') : cooling ? t('Resend in {n}s', { n: cooldownSecs }) : t('Send reset link')}
          </button>
          {cooling && (
            <p className="ktc-label" style={{ fontSize: 12, textAlign: 'center', marginTop: -4 }}>
              {t('Didn’t get it? You can resend in {n}s. Check your spam folder too.', { n: cooldownSecs })}
            </p>
          )}
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          <Link to="/login" className="ktc-link">{t('← Back to sign in')}</Link>
        </p>
      </div>
    </div>
  )
}
