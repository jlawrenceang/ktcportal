import { useEffect, useRef, useState, type FormEvent, type UIEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from '../components/Turnstile'
import { AGREEMENT_VERSION, AGREEMENT_VERSION_LABEL, AGREEMENT_BODY } from '../content/legal'
import { MarkdownBody } from '../components/MarkdownDoc'
import Notice from '../components/Notice'
import PasswordInput from '../components/PasswordInput'
import PasswordStrength from '../components/PasswordStrength'
import { passwordIssue } from '../lib/validation'
import { useT } from '../lib/i18n'

// Client-side brute-force deterrent: after MAX_FAILS wrong passwords for an
// email, disable sign-in for LOCK_MS. (Supabase's server-side auth rate limits
// are the real backstop; this just stops casual repeated guessing in the UI.)
const MAX_FAILS = 5
const LOCK_MS = 60_000
const LOCK_KEY = (em: string) => `ktc_login_lock_${em.trim().toLowerCase()}`

function readLock(em: string): number | null {
  if (!em.trim()) return null
  try {
    const raw = localStorage.getItem(LOCK_KEY(em))
    if (!raw) return null
    const o = JSON.parse(raw) as { lockedUntil?: number }
    return o.lockedUntil && o.lockedUntil > Date.now() ? o.lockedUntil : null
  } catch { return null }
}
function recordFail(em: string): number | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY(em))
    const o = raw ? (JSON.parse(raw) as { count?: number }) : { count: 0 }
    const count = (o.count ?? 0) + 1
    if (count >= MAX_FAILS) {
      const lockedUntil = Date.now() + LOCK_MS
      localStorage.setItem(LOCK_KEY(em), JSON.stringify({ count: 0, lockedUntil }))
      return lockedUntil
    }
    localStorage.setItem(LOCK_KEY(em), JSON.stringify({ count }))
    return null
  } catch { return null }
}
function clearFails(em: string) {
  try { localStorage.removeItem(LOCK_KEY(em)) } catch { /* ignore */ }
}

// Instant client-side hint only — NOT the real check. The wall is server-side in
// handle_new_user (migration 0164) against the full disposable-domain blocklist.
// This just flags the most common throwaway domains as the user types.
const COMMON_DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la',
  '10minutemail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'yopmail.com',
  'throwawaymail.com', 'getnada.com', 'trashmail.com', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'mailnesia.com', 'mohmal.com', 'mintemail.com', 'spam4.me',
])
function isLikelyDisposable(em: string): boolean {
  const at = em.indexOf('@')
  return at >= 0 && COMMON_DISPOSABLE.has(em.slice(at + 1).trim().toLowerCase())
}

export default function Login() {
  const { t } = useT()
  const { signIn, signUp, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The /register URL (the walk-in QR target) opens straight in sign-up mode.
  const [mode, setMode] = useState<'signin' | 'signup'>(location.pathname === '/register' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [showAgreement, setShowAgreement] = useState(false) // full-agreement modal
  const [showResend, setShowResend] = useState(false) // offer to resend confirmation after an unconfirmed-email login
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [lockUntil, setLockUntil] = useState<number | null>(null) // sign-in cooldown after repeated failures
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [agreedTerms, setAgreedTerms] = useState(false) // one tick = Terms + NDA + DPA consent (whole Agreement)
  const [scrolledAgreement, setScrolledAgreement] = useState(false) // must read to the end to tick
  const agreementRef = useRef<HTMLDivElement>(null)
  const modalAgreementRef = useRef<HTMLDivElement>(null)
  // bumping this remounts the widget, forcing a fresh single-use token
  const [captchaKey, setCaptchaKey] = useState(0)

  function resetCaptcha() {
    setCaptchaToken(null)
    setCaptchaKey((k) => k + 1)
  }

  async function resendConfirmation() {
    if (!email.trim()) { setError(t('Enter your email above first, then resend.')); return }
    // Supabase enforces CAPTCHA on the resend endpoint too; the prior sign-in
    // attempt consumed the last token, so we need a fresh one (Managed Turnstile
    // re-issues automatically after resetCaptcha).
    if (captchaEnabled && !captchaToken) {
      setError(t('Please wait a second for the CAPTCHA to refresh, then tap Resend again.'))
      return
    }
    setBusy(true); setError(null); setNotice(null)
    const { error: rErr } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/confirmed` : undefined,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
    setBusy(false)
    if (captchaEnabled) resetCaptcha() // token is single-use
    if (rErr) { setError(rErr.message); return }
    setShowResend(false)
    setNotice(t('✓ Confirmation email resent — check your inbox (and spam folder) for the link.'))
  }

  function onAgreementScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledAgreement(true)
  }

  // Reading the agreement in the modal also satisfies the scroll-to-agree gate.
  // If it's short enough not to scroll, unlock as soon as it's opened.
  useEffect(() => {
    if (!showAgreement) return
    const el = modalAgreementRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledAgreement(true)
  }, [showAgreement])

  // Surface one-off notices (idle sign-out, or email just confirmed).
  useEffect(() => {
    if (sessionStorage.getItem('ktc_password_reset')) {
      setNotice(t('✓ Your password has been updated — please sign in with your new password.'))
      sessionStorage.removeItem('ktc_password_reset')
    } else if (sessionStorage.getItem('ktc_email_confirmed')) {
      setNotice(t('✓ Your email is confirmed — please sign in to continue.'))
      sessionStorage.removeItem('ktc_email_confirmed')
    } else if (sessionStorage.getItem('ktc_reset_sent')) {
      setNotice(t('✓ If that email is registered, a password-reset link is on its way. Check your inbox (and spam folder).'))
      sessionStorage.removeItem('ktc_reset_sent')
    } else if (sessionStorage.getItem('ktc_session_superseded')) {
      setNotice(t('You were signed out because this account signed in on another device or browser. If that wasn’t you, change your password now.'))
      sessionStorage.removeItem('ktc_session_superseded')
    } else if (sessionStorage.getItem('ktc_idle_logout')) {
      // The flag's value carries the minutes ('15' customer / '60' staff);
      // a bare legacy '1' falls back to the customer wording.
      const mins = sessionStorage.getItem('ktc_idle_logout')
      setNotice(t('You were signed out after {mins} minutes of inactivity. Please sign in again.', { mins: /^\d{2,}$/.test(mins ?? '') ? (mins ?? '15') : '15' }))
      sessionStorage.removeItem('ktc_idle_logout')
    }
  }, [])

  // Reset when leaving signup; if the agreement is too short to scroll, enable immediately.
  useEffect(() => {
    if (mode !== 'signup') { setScrolledAgreement(false); return }
    const el = agreementRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledAgreement(true)
  }, [mode])

  // Re-check the sign-in cooldown whenever the typed email changes.
  useEffect(() => { setLockUntil(readLock(email)) }, [email])

  // Tick the countdown while a cooldown is active.
  useEffect(() => {
    if (!lockUntil) return
    const id = setInterval(() => {
      const t = Date.now()
      setNowTs(t)
      if (t >= lockUntil) setLockUntil(null)
    }, 500)
    return () => clearInterval(id)
  }, [lockUntil])

  const lockSecs = lockUntil ? Math.max(0, Math.ceil((lockUntil - nowTs) / 1000)) : 0
  const isLocked = lockSecs > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup' && !agreedTerms) {
      setError(t('Please accept the KTC Customer Agreement (Terms & Data Privacy consent) to continue.'))
      return
    }
    if (mode === 'signup') {
      const pwIssue = passwordIssue(password)
      if (pwIssue) { setError(pwIssue); return }
    }
    if (captchaEnabled && !captchaToken) {
      setError(t('Please complete the CAPTCHA.'))
      return
    }
    // Sign-in cooldown after repeated wrong passwords.
    if (mode === 'signin') {
      const lk = readLock(email)
      if (lk) { setLockUntil(lk); setError(null); return }
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const token = captchaToken ?? undefined
    const res =
      mode === 'signin'
        ? await signIn(email, password, token)
        : await signUp(email, password, {
            fullName,
            contactNumber,
            captchaToken: token,
            // One agreement → record terms acceptance + data-privacy consent together
            termsVersion: AGREEMENT_VERSION,
            privacyVersion: AGREEMENT_VERSION,
          })
    setBusy(false)
    // tokens are single-use — always reset after an attempt
    if (captchaEnabled) resetCaptcha()
    if (res.error) {
      // Friendlier message for the unconfirmed-email case + offer to resend.
      if (mode === 'signin' && /not confirmed|confirm/i.test(res.error)) {
        setShowResend(true) // the top banner shows the message + resend button
      } else {
        // Count wrong-password failures toward the cooldown.
        if (mode === 'signin' && /invalid login credentials|invalid email or password|invalid/i.test(res.error)) {
          const lockedUntil = recordFail(email)
          if (lockedUntil) { setLockUntil(lockedUntil); setError(null); return }
        }
        setError(res.error)
      }
      return
    }
    if (mode === 'signup') {
      setNotice(t('✓ Account created! We’ve emailed a confirmation link to your address. Please confirm your email, then log in again here to continue.'))
      setMode('signin')
      setFullName('')
      setContactNumber('')
      setAgreedTerms(false)
      return
    }
    clearFails(email) // successful sign-in resets the cooldown counter
    navigate('/', { replace: true })
  }

  const isSignup = mode === 'signup'
  const showDisposableHint = isSignup && isLikelyDisposable(email)

  // Already signed in → don't show the login page; send to the role landing (/).
  if (session) return <Navigate to="/" replace />


  return (
    <>
      {/* Just the form column — PublicShell renders the shared letterhead, the left
          intro + services, the footer, and the .ktc-landing__access wrapper. Only this
          right column changes between Sign in / Create account; the backdrop persists. */}
      <div className="ktc-authform">
        {/* Back to the main menu — swaps this right column back to the Sign in / Create
            account buttons (the card chrome stays put). */}
        <Link to="/" className="ktc-link" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, textDecoration: 'none' }}>
          {t('← Back to menu')}
        </Link>
        {notice && <Notice tone="success" style={{ marginBottom: 14 }}>{notice}</Notice>}
        {isLocked && (
          <Notice tone="warning" style={{ marginBottom: 14 }}>
            {t('Too many failed sign-in attempts. Please wait')} <b>{lockSecs}s</b> {t('before trying again.')}
          </Notice>
        )}
        {error && !isLocked && <Notice tone="error" style={{ marginBottom: 14 }}>{error}</Notice>}
        {showResend && (
          <Notice
            tone="warning"
            style={{ marginBottom: 14 }}
            action={
              <button type="button" disabled={busy} onClick={() => void resendConfirmation()}
                style={{ border: 0, borderRadius: 9, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg, var(--acc), var(--acc-2))' }}>
                {busy ? t('Resending…') : t('Resend confirmation email')}
              </button>
            }
          >
            {t('Please confirm your email first — check your inbox (and spam folder) for the confirmation link.')}
          </Notice>
        )}
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {isSignup ? t('Create account') : t('Sign in')}
        </h1>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          {isSignup && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="fullName">{t('Full name')}</label>
              <input id="fullName" className="ktc-input" type="text" required value={fullName}
                onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </div>
          )}

          {isSignup && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="contactNumber">{t('Contact number')}</label>
              <input id="contactNumber" className="ktc-input" type="tel" required value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)} autoComplete="tel"
                placeholder={t('e.g. 0917 123 4567')} />
            </div>
          )}

          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="email">{isSignup ? t('Email') : t('Email or username')}</label>
            <input id="email" className="ktc-input" type={isSignup ? 'email' : 'text'} required value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            {showDisposableHint && (
              <p className="ktc-label" style={{ margin: 0, fontSize: 12, color: 'var(--c-h30-80-34)' }}>
                {t('Please use a permanent business email — temporary / disposable email addresses aren’t accepted.')}
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <label className="ktc-label" htmlFor="password">{t('Password')}</label>
              {!isSignup && <Link to="/forgot-password" className="ktc-link" style={{ fontSize: 12 }}>{t('Forgot password?')}</Link>}
            </div>
            <PasswordInput id="password" required minLength={isSignup ? 8 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'} />
            {isSignup && <PasswordStrength value={password} />}
          </div>

          {isSignup && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  {t('KTC Customer Agreement ({version})', { version: AGREEMENT_VERSION_LABEL })}
                </span>
                <button type="button" className="ktc-link" onClick={() => setShowAgreement(true)}
                  style={{ fontSize: 12, border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>
                  {t('View full ↗')}
                </button>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 8,
                background: scrolledAgreement ? 'var(--c-h150-50-94)' : 'var(--c-h40-95-90)',
                color: scrolledAgreement ? 'var(--c-h150-55-28)' : 'var(--c-h30-80-34)',
                border: `1px solid ${scrolledAgreement ? 'var(--c-h150-45-78)' : 'var(--c-h40-85-75)'}`,
              }}>
                {scrolledAgreement
                  ? t('✓ Thanks for reading — you can now check the consent boxes below.')
                  : t('↓ Please scroll to the end of the agreement to enable the consent checkboxes.')}
              </div>
              <div
                ref={agreementRef}
                onScroll={onAgreementScroll}
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  borderRadius: 12,
                  border: '1px solid var(--glass-brd)',
                  background: 'var(--c-w50)',
                  padding: '12px 16px',
                  fontSize: 12,
                }}
              >
                <MarkdownBody body={AGREEMENT_BODY} />
              </div>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, opacity: scrolledAgreement ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  disabled={!scrolledAgreement}
                  style={{ marginTop: 2, flex: '0 0 auto' }}
                  required
                />
                <span className="ktc-label" style={{ fontSize: 13 }}>
                  {t('I have read and agree to the')} <b>{t('KTC Customer Agreement')}</b> {t('— including the Terms & Conditions, and my consent to KTC processing my personal data.')}
                </span>
              </label>
            </div>
          )}

          {captchaEnabled && (
            <Turnstile
              key={captchaKey}
              onVerify={(t) => setCaptchaToken(t)}
              onExpire={() => setCaptchaToken(null)}
            />
          )}


          <button className="ktc-btn" type="submit" disabled={busy || (captchaEnabled && !captchaToken) || (isSignup && !agreedTerms) || (!isSignup && isLocked)} style={{ marginTop: 6 }}>
            {busy ? t('Please wait…') : !isSignup && isLocked ? t('Try again in {secs}s', { secs: lockSecs }) : isSignup ? t('Sign up') : t('Sign in')}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          {isSignup ? t('Already have an account? ') : t("Don't have an account? ")}
          <button className="ktc-link" type="button"
            onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); setNotice(null); setShowResend(false); resetCaptcha(); setAgreedTerms(false) }}>
            {isSignup ? t('Sign in') : t('Create one')}
          </button>
        </p>
      </div>

      {showAgreement && (
        <div
          onClick={() => setShowAgreement(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ktc-glass"
            style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{t('KTC Customer Agreement ({version})', { version: AGREEMENT_VERSION_LABEL })}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setShowAgreement(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>
                ✕
              </button>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600, padding: '10px 20px',
              background: scrolledAgreement ? 'var(--c-h150-50-94)' : 'var(--c-h40-95-90)',
              color: scrolledAgreement ? 'var(--c-h150-55-28)' : 'var(--c-h30-80-34)',
              borderBottom: `1px solid ${scrolledAgreement ? 'var(--c-h150-45-80)' : 'var(--c-h40-85-78)'}`,
            }}>
              {scrolledAgreement
                ? t('✓ Thanks for reading — you can now check the consent boxes below.')
                : t('↓ Please scroll to the end to enable the consent checkboxes.')}
            </div>
            <div ref={modalAgreementRef} onScroll={onAgreementScroll} style={{ overflowY: 'auto', padding: '16px 20px', fontSize: 13 }}>
              <MarkdownBody body={AGREEMENT_BODY} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
