import { Navigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import MfaChallenge from './MfaChallenge'
import SessionConflictModal from './SessionConflictModal'
import FinishRegistration from './FinishRegistration'
import ReConsent from './ReConsent'
import { AGREEMENT_VERSION } from '../content/legal'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, sessionClaim, runSessionClaim } = useAuth()

  // MFA gate: an account with a verified TOTP factor must pass the challenge
  // (aal2) before the portal renders. Backend-enforced too — is_admin() /
  // has_permission() return false at aal1 for enrolled accounts.
  const [aal, setAal] = useState<{ current: string; next: string } | null>(null)
  useEffect(() => {
    if (!session) { setAal(null); return }
    let active = true
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (active) setAal({ current: data?.currentLevel ?? 'aal1', next: data?.nextLevel ?? 'aal1' })
    })
    return () => { active = false }
  }, [session])

  // Single-session gate: once the session is fully authenticated (past the
  // email + MFA gates), run the claim check exactly once. It either claims
  // silently (no other device) or holds at 'conflict' for Terminate/Cancel.
  const sessionUser = session?.user
  const isStaffEarly = !!sessionUser?.email?.endsWith('@ktc-staff.local')
  const emailOk = !!(sessionUser?.email_confirmed_at || sessionUser?.confirmed_at)
  const aalReady = !!aal && !(aal.next === 'aal2' && aal.current !== 'aal2')
  const fullyAuthed = !!session && (isStaffEarly || emailOk) && aalReady
  useEffect(() => {
    if (fullyAuthed) runSessionClaim()
  }, [fullyAuthed, runSessionClaim])

  // OAuth (Google) registration gate: a Google sign-up hasn't agreed to the
  // Customer Agreement or given a contact number yet (the email/password form
  // collects both). Check the customer's recorded consent — SCOPED to OAuth
  // users, so an email/password customer skips this read + gate entirely.
  const isOauthUser = (session?.user?.app_metadata as { provider?: string } | undefined)?.provider === 'google'
  const [oauthReg, setOauthReg] = useState<'unknown' | 'needed' | 'done'>('unknown')
  useEffect(() => {
    if (!isOauthUser || !session) return
    let active = true
    void supabase.from('customers').select('terms_version').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => { if (active) setOauthReg((data as { terms_version: string | null } | null)?.terms_version ? 'done' : 'needed') })
    return () => { active = false }
  }, [isOauthUser, session])

  // Re-consent gate: a customer whose recorded agreement version no longer matches the current
  // AGREEMENT_VERSION must re-accept before the portal renders (has_recorded_consent() only checks
  // the version is non-null, so a bump never re-gated). Scoped to customers (staff_role null);
  // staff/owner hold no agreement, and a missing row isn't a consenting customer either. (T1-07)
  const [consent, setConsent] = useState<'unknown' | 'ok' | 'needed'>('unknown')
  useEffect(() => {
    if (!session) { setConsent('unknown'); return }
    let active = true
    void supabase.from('customers').select('staff_role, terms_version').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (!active) return
        const row = data as { staff_role: string | null; terms_version: string | null } | null
        if (!row || row.staff_role) { setConsent('ok'); return }
        setConsent(row.terms_version === AGREEMENT_VERSION ? 'ok' : 'needed')
      })
    return () => { active = false }
  }, [session])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />

  if (!aal) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (aal.next === 'aal2' && aal.current !== 'aal2') {
    return <MfaChallenge onVerified={() => setAal({ current: 'aal2', next: 'aal2' })} />
  }

  // Single-session gate: another device is live → ask before evicting.
  if (sessionClaim === 'conflict') return <SessionConflictModal />
  // 'idle' / 'checking' → the claim check is in flight; hold the portal back a
  // beat so it can't flash before a possible conflict prompt.
  if (sessionClaim !== 'resolved') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }

  // Google sign-ups: hold for the consent check, then collect agreement + contact.
  if (isOauthUser && oauthReg === 'unknown') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (isOauthUser && oauthReg === 'needed') {
    return <FinishRegistration onDone={() => { setOauthReg('done'); setConsent('ok') }} />
  }

  // Re-consent gate (customers only): hold until known, block on an agreement-version mismatch.
  if (consent === 'unknown') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (consent === 'needed') return <ReConsent onDone={() => setConsent('ok')} />

  return <>{children}</>
}
