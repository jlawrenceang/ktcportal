import { Navigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import MfaChallenge from './MfaChallenge'
import MfaGateError from './MfaGateError'
import SessionConflictModal from './SessionConflictModal'
import FinishRegistration from './FinishRegistration'
import ReConsent from './ReConsent'
import { AGREEMENT_VERSION } from '../content/legal'
import { useMfaGate } from '../lib/useMfaGate'
import RouteLoader from './RouteLoader'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, sessionClaim, runSessionClaim } = useAuth()

  // MFA gate: an account with a verified TOTP factor must pass the challenge
  // (aal2) before the portal renders. Backend-enforced too — is_admin() /
  // has_permission() return false at aal1 for enrolled accounts.
  const mfa = useMfaGate(session)

  // Single-session gate: once the session is fully authenticated (past the
  // email + MFA gates), run the claim check exactly once. It either claims
  // silently (no other device) or holds at 'conflict' for Terminate/Cancel.
  const sessionUser = session?.user
  const isStaffEarly = !!sessionUser?.email?.endsWith('@ktc-staff.local')
  const emailOk = !!(sessionUser?.email_confirmed_at || sessionUser?.confirmed_at)
  const aalReady = !mfa.loading && !mfa.needsChallenge
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
    return <RouteLoader />
  }
  if (!session) return <Navigate to="/login" replace />

  if (mfa.error) {
    return <MfaGateError message={mfa.error} onRetry={mfa.retry} />
  }
  if (mfa.loading) {
    return <RouteLoader />
  }
  if (mfa.needsChallenge) {
    return <MfaChallenge onVerified={mfa.markVerified} />
  }

  // Single-session gate: another device is live → ask before evicting.
  if (sessionClaim === 'conflict') return <SessionConflictModal />
  // 'idle' / 'checking' → the claim check is in flight; hold the portal back a
  // beat so it can't flash before a possible conflict prompt.
  if (sessionClaim !== 'resolved') {
    return <RouteLoader />
  }

  // Google sign-ups: hold for the consent check, then collect agreement + contact.
  if (isOauthUser && oauthReg === 'unknown') {
    return <RouteLoader />
  }
  if (isOauthUser && oauthReg === 'needed') {
    return <FinishRegistration onDone={() => { setOauthReg('done'); setConsent('ok') }} />
  }

  // Re-consent gate (customers only): hold until known, block on an agreement-version mismatch.
  if (consent === 'unknown') {
    return <RouteLoader />
  }
  if (consent === 'needed') return <ReConsent onDone={() => setConsent('ok')} />

  return <>{children}</>
}
