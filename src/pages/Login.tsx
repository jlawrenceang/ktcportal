import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const res =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, { fullName, idFile })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    if (mode === 'signup') {
      setNotice('Account created. If email confirmation is on, confirm via email, then sign in.')
      setMode('signin')
      setFullName('')
      setIdFile(null)
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

          {error && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
          {notice && <div className="ktc-label" style={{ fontSize: 13 }}>{notice}</div>}

          <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button className="ktc-link" type="button"
            onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); setNotice(null) }}>
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  )
}
