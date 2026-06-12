import { useEffect, useRef, useState, type FormEvent, type UIEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import Turnstile, { captchaEnabled } from '../components/Turnstile'
import { AGREEMENT_VERSION, AGREEMENT_VERSION_LABEL, AGREEMENT_BODY } from '../content/legal'
import { APP_VERSION } from '../version'
import { MarkdownBody } from '../components/MarkdownDoc'
import Notice from '../components/Notice'
import { passwordIssue, PASSWORD_HINT } from '../lib/validation'

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

export default function Login() {
  const { signIn, signUp, session } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
    if (!email.trim()) { setError('Enter your email above first, then resend.'); return }
    // Supabase enforces CAPTCHA on the resend endpoint too; the prior sign-in
    // attempt consumed the last token, so we need a fresh one (Managed Turnstile
    // re-issues automatically after resetCaptcha).
    if (captchaEnabled && !captchaToken) {
      setError('Please wait a second for the CAPTCHA to refresh, then tap Resend again.')
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
    setNotice('✓ Confirmation email resent — check your inbox (and spam folder) for the link.')
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
      setNotice('✓ Your password has been updated — please sign in with your new password.')
      sessionStorage.removeItem('ktc_password_reset')
    } else if (sessionStorage.getItem('ktc_email_confirmed')) {
      setNotice('✓ Your email is confirmed — please sign in to continue.')
      sessionStorage.removeItem('ktc_email_confirmed')
    } else if (sessionStorage.getItem('ktc_session_superseded')) {
      setNotice('You were signed out because this account signed in on another device or browser. If that wasn’t you, change your password now.')
      sessionStorage.removeItem('ktc_session_superseded')
    } else if (sessionStorage.getItem('ktc_idle_logout')) {
      // The flag's value carries the minutes ('15' customer / '60' staff);
      // a bare legacy '1' falls back to the customer wording.
      const mins = sessionStorage.getItem('ktc_idle_logout')
      setNotice(`You were signed out after ${/^\d{2,}$/.test(mins ?? '') ? mins : '15'} minutes of inactivity. Please sign in again.`)
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
      setError('Please accept the KTC Customer Agreement (Terms & Data Privacy consent) to continue.')
      return
    }
    if (mode === 'signup') {
      const pwIssue = passwordIssue(password)
      if (pwIssue) { setError(pwIssue); return }
    }
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA.')
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
      setNotice('✓ Account created! We’ve emailed a confirmation link to your address. Please confirm your email, then log in again here to continue.')
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

  // Already signed in → don't show the login page; send to the role landing (/).
  if (session) return <Navigate to="/" replace />


  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass ktc-rise" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 64, marginBottom: 20 }} />
        {notice && <Notice tone="success" style={{ marginBottom: 14 }}>{notice}</Notice>}
        {isLocked && (
          <Notice tone="warning" style={{ marginBottom: 14 }}>
            Too many failed sign-in attempts. Please wait <b>{lockSecs}s</b> before trying again.
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
                {busy ? 'Resending…' : 'Resend confirmation email'}
              </button>
            }
          >
            Please confirm your email first — check your inbox (and spam folder) for the confirmation link.
          </Notice>
        )}
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {isSignup ? 'Create account' : 'Sign in'}
        </h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 24 }}>
          KTC Online Portal — Container Terminal Services
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          {isSignup && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="fullName">Full name</label>
              <input id="fullName" className="ktc-input" type="text" required value={fullName}
                onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </div>
          )}

          {isSignup && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="contactNumber">Contact number</label>
              <input id="contactNumber" className="ktc-input" type="tel" required value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)} autoComplete="tel"
                placeholder="e.g. 0917 123 4567" />
            </div>
          )}

          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="email">{isSignup ? 'Email' : 'Email or username'}</label>
            <input id="email" className="ktc-input" type={isSignup ? 'email' : 'text'} required value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <label className="ktc-label" htmlFor="password">Password</label>
              {!isSignup && <Link to="/forgot-password" className="ktc-link" style={{ fontSize: 12 }}>Forgot password?</Link>}
            </div>
            <input id="password" className="ktc-input" type="password" required minLength={isSignup ? 8 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'} />
            {isSignup && <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>{PASSWORD_HINT}</span>}
          </div>

          {isSignup && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  KTC Customer Agreement ({AGREEMENT_VERSION_LABEL})
                </span>
                <button type="button" className="ktc-link" onClick={() => setShowAgreement(true)}
                  style={{ fontSize: 12, border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>
                  View full ↗
                </button>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 8,
                background: scrolledAgreement ? 'hsl(150 50% 94%)' : 'hsl(40 95% 90%)',
                color: scrolledAgreement ? 'hsl(150 55% 28%)' : 'hsl(30 80% 34%)',
                border: `1px solid ${scrolledAgreement ? 'hsl(150 45% 78%)' : 'hsl(40 85% 75%)'}`,
              }}>
                {scrolledAgreement
                  ? '✓ Thanks for reading — you can now tick the consent boxes below.'
                  : '↓ Please scroll to the end of the agreement to enable the consent checkboxes.'}
              </div>
              <div
                ref={agreementRef}
                onScroll={onAgreementScroll}
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  borderRadius: 12,
                  border: '1px solid var(--glass-brd)',
                  background: 'rgba(255,255,255,0.5)',
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
                  I have read and agree to the <b>KTC Customer Agreement</b> — including the Terms &amp; Conditions,
                  confidentiality / non-disclosure obligations, and my consent to KTC processing my personal data
                  (including the valid ID I upload) under the Data Privacy Act of 2012.
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
            {busy ? 'Please wait…' : !isSignup && isLocked ? `Try again in ${lockSecs}s` : isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button className="ktc-link" type="button"
            onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); setNotice(null); setShowResend(false); resetCaptcha(); setAgreedTerms(false) }}>
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>

        <p className="ktc-label" style={{ marginTop: 14, fontSize: 12, opacity: 0.7, textAlign: 'center' }}>
          KTC Online Portal {APP_VERSION} · © {new Date().getFullYear()} KTC Container Terminal Corp.
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
              <span style={{ fontWeight: 600, fontSize: 15 }}>KTC Customer Agreement ({AGREEMENT_VERSION_LABEL})</span>
              <button type="button" aria-label="Close" onClick={() => setShowAgreement(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>
                ✕
              </button>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600, padding: '10px 20px',
              background: scrolledAgreement ? 'hsl(150 50% 94%)' : 'hsl(40 95% 90%)',
              color: scrolledAgreement ? 'hsl(150 55% 28%)' : 'hsl(30 80% 34%)',
              borderBottom: `1px solid ${scrolledAgreement ? 'hsl(150 45% 80%)' : 'hsl(40 85% 78%)'}`,
            }}>
              {scrolledAgreement
                ? '✓ Thanks for reading — you can now tick the consent boxes below.'
                : '↓ Please scroll to the end to enable the consent checkboxes.'}
            </div>
            <div ref={modalAgreementRef} onScroll={onAgreementScroll} style={{ overflowY: 'auto', padding: '16px 20px', fontSize: 13 }}>
              <MarkdownBody body={AGREEMENT_BODY} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
