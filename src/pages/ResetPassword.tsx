import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Landed here from the password-reset email (the link establishes a recovery
// session). Set the new password, then sign out and log in fresh.
export default function ResetPassword() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (pw !== pw2) { setError('Passwords don’t match.'); return }
    setBusy(true); setError(null)
    const { error: uErr } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (uErr) {
      setError(/session|missing|expired|invalid/i.test(uErr.message)
        ? 'This reset link is invalid or has expired. Please request a new one.'
        : uErr.message)
      return
    }
    await signOut()
    sessionStorage.setItem('ktc_password_reset', '1')
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 440, padding: '36px 36px 32px' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 56, marginBottom: 18 }} />
        <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>Set a new password</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>Choose a new password for your account.</p>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'hsl(0 75% 96%)', border: '1px solid hsl(0 70% 85%)', color: 'hsl(0 65% 42%)', fontSize: 13, fontWeight: 500 }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="pw">New password</label>
            <input id="pw" className="ktc-input" type="password" required minLength={6} value={pw}
              onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="pw2">Confirm new password</label>
            <input id="pw2" className="ktc-input" type="password" required minLength={6} value={pw2}
              onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>

        <p className="ktc-label" style={{ marginTop: 18, fontSize: 13 }}>
          <Link to="/login" className="ktc-link">← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
