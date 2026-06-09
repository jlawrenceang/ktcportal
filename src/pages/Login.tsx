import { useEffect, useRef, useState, type FormEvent, type UIEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Turnstile, { captchaEnabled } from '../components/Turnstile'
import { AGREEMENT_VERSION, AGREEMENT_VERSION_LABEL, AGREEMENT_BODY } from '../content/legal'
import { MarkdownBody } from '../components/MarkdownDoc'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [idFile, setIdFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [agreedTerms, setAgreedTerms] = useState(false) // KTC Broker Agreement — Terms & Conditions + NDA
  const [consentDpa, setConsentDpa] = useState(false) // Data Privacy Act consent
  const [scrolledAgreement, setScrolledAgreement] = useState(false) // must read to the end to tick
  const agreementRef = useRef<HTMLDivElement>(null)
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

  // Reset when leaving signup; if the agreement is too short to scroll, enable immediately.
  useEffect(() => {
    if (mode !== 'signup') { setScrolledAgreement(false); return }
    const el = agreementRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledAgreement(true)
  }, [mode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup' && !agreedTerms) {
      setError('Please accept the KTC Broker Agreement (Terms & Conditions) to continue.')
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
            idFile,
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
      setNotice('Account created. If email confirmation is on, confirm via email, then sign in.')
      setMode('signin')
      setFullName('')
      setIdFile(null)
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
          KTC Job Order portal — for accredited brokers.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          {isSignup && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="fullName">Full name</label>
              <input id="fullName" className="ktc-input" type="text" required value={fullName}
                onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
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
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="validId">Valid ID (image or PDF)</label>
              <input id="validId" className="ktc-input" type="file" accept="image/*,application/pdf"
                onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} required
                style={{ padding: '9px 13px' }} />
              <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>
                Uploaded securely; only KTC admins can view it.
              </span>
            </div>
          )}

          {isSignup && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  KTC Broker Agreement ({AGREEMENT_VERSION_LABEL})
                </span>
                <Link to="/agreement" target="_blank" className="ktc-link" style={{ fontSize: 12 }}>
                  View full ↗
                </Link>
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
              {!scrolledAgreement && (
                <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>
                  Please scroll to the end of the agreement to enable the checkboxes.
                </span>
              )}
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
                  obligations of the KTC Broker Agreement above.
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

        <p className="ktc-label" style={{ marginTop: 14, fontSize: 12, opacity: 0.85 }}>
          <Link to="/agreement" className="ktc-link">KTC Broker Agreement</Link>
        </p>
      </div>
    </div>
  )
}
