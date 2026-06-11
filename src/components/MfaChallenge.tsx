import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Shown after password sign-in when the account has a verified TOTP factor
// but the session is still aal1. Verifying upgrades the session to aal2 —
// which is also what the backend requires (is_admin / has_permission return
// false at aal1 for enrolled accounts), so this screen can't be bypassed by
// poking the API directly.
export default function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const { signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || code.trim().length < 6) return
    setBusy(true)
    setError(null)
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.[0]
    if (fErr || !totp) {
      setBusy(false)
      setError(fErr?.message ?? 'No authenticator found on this account.')
      return
    }
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
    if (cErr || !ch) {
      setBusy(false)
      setError(cErr?.message ?? 'Could not start the verification.')
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: ch.id,
      code: code.trim(),
    })
    setBusy(false)
    if (vErr) {
      setError("That code didn't match — check your authenticator app and try again.")
      setCode('')
      return
    }
    onVerified()
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="ktc-glass" style={{ padding: 32, maxWidth: 400, width: '100%' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>Two-factor authentication</h1>
        <p className="ktc-label" style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <input
            className="ktc-input ktc-mono"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center', padding: '13px 16px' }}
          />
          {error && <div role="alert" style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
          <button className="ktc-btn" type="submit" disabled={busy || code.trim().length < 6}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button type="button" className="ktc-link" style={{ fontSize: 13, justifySelf: 'center' }} onClick={() => void signOut()}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
