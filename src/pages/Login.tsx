import { useEffect, useRef, useState, type FormEvent, type UIEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Turnstile, { captchaEnabled } from '../components/Turnstile'
import { AGREEMENT_VERSION, AGREEMENT_VERSION_LABEL, AGREEMENT_BODY } from '../content/legal'
import { APP_VERSION } from '../version'
import { MarkdownBody } from '../components/MarkdownDoc'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [showAgreement, setShowAgreement] = useState(false) // full-agreement modal
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false) // KTC Customer Agreement — Terms & Conditions + NDA
  const [consentDpa, setConsentDpa] = useState(false) // Data Privacy Act consent
  const [scrolledAgreement, setScrolledAgreement] = useState(false) // must read to the end to tick
  const agreementRef = useRef<HTMLDivElement>(null)
  const modalAgreementRef = useRef<HTMLDivElement>(null)
  // bumping this remounts the widget, forcing a fresh single-use token
  const [captchaKey, setCaptchaKey] = useState(0)

  function resetCaptcha() {
    setCaptchaToken(null)
    setCaptchaKey((k) => k + 1)
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

  // Surface an inactivity sign-out (set by the broker portal's idle timeout).
  useEffect(() => {
    if (sessionStorage.getItem('ktc_idle_logout')) {
      setNotice('You were signed out after 10 minutes of inactivity. Please sign in again.')
      sessionStorage.removeItem('ktc_idle_logout')
    }
  }, [])

  // Reset when leaving signup; if the agreement is too short to scroll, enable immediately.
  useEffect(() => {
    if (mode !== 'signup') { setScrolledAgreement(false); return }
    const el = agreementRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledAgreement(true)
  }, [mode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup' && !agreedTerms) {
      setError('Please accept the KTC Customer Agreement (Terms & Conditions) to continue.')
      return
    }
    if (mode === 'signup' && !consentDpa) {
      setError('Please give your Data Privacy Act consent to continue.')
      return
    }
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA.')
      return
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
      setError(res.error)
      return
    }
    if (mode === 'signup') {
      setNotice('Account created. Check your email to confirm your address, then sign in to upload your valid ID and finish your application.')
      setMode('signin')
      setFullName('')
      setContactNumber('')
      setAgreedTerms(false)
      setConsentDpa(false)
      return
    }
    navigate('/', { replace: true })
  }

  const isSignup = mode === 'signup'

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 64, marginBottom: 20 }} />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {isSignup ? 'Create account' : 'Sign in'}
        </h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 24 }}>
          KTC Online Portal — for accredited customers.
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
            <label className="ktc-label" htmlFor="password">Password</label>
            <input id="password" className="ktc-input" type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'} />
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
                  I have read and agree to the Terms &amp; Conditions and the confidentiality / non-disclosure
                  obligations of the KTC Customer Agreement above.
                </span>
              </label>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, opacity: scrolledAgreement ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={consentDpa}
                  onChange={(e) => setConsentDpa(e.target.checked)}
                  disabled={!scrolledAgreement}
                  style={{ marginTop: 2, flex: '0 0 auto' }}
                  required
                />
                <span className="ktc-label" style={{ fontSize: 13 }}>
                  I consent to KTC processing my personal data, including the valid ID I upload, under the
                  Data Privacy Act of 2012 as described in the Agreement above.
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

          {error && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
          {notice && <div className="ktc-label" style={{ fontSize: 13 }}>{notice}</div>}

          <button className="ktc-btn" type="submit" disabled={busy || (captchaEnabled && !captchaToken) || (isSignup && (!agreedTerms || !consentDpa))} style={{ marginTop: 6 }}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button className="ktc-link" type="button"
            onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); setNotice(null); resetCaptcha(); setAgreedTerms(false); setConsentDpa(false) }}>
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
