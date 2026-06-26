import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { stampActivity } from './useIdleLogout'
import { broadcastSessionClaimed } from './sessionChannel'

// Single-session claim state machine (see ProtectedRoute + SessionConflictModal):
//  idle      — nothing checked yet for the current session
//  checking  — asking the server whether another device is live
//  conflict  — another device IS live; waiting for the user's Terminate/Cancel
//  resolved  — this session owns the account; portal may render
export type SessionClaim = 'idle' | 'checking' | 'conflict' | 'resolved'

// Read the session_id claim out of a Supabase access token (JWT). Used only to
// key "have I already run the claim for THIS session" — never trusted for auth.
function jwtSessionId(token?: string | null): string | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { session_id?: string }).session_id ?? null
  } catch {
    return null
  }
}

interface SignUpExtras {
  fullName?: string
  contactNumber?: string
  idFile?: File | null
  captchaToken?: string
  irrVersion?: string
  termsVersion?: string
  privacyVersion?: string
}

interface AuthValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, extras?: SignUpExtras) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Single-session gate state for the current session (see ProtectedRoute). */
  sessionClaim: SessionClaim
  /** Run the claim check once for the fully-authenticated session (idempotent). */
  runSessionClaim: () => void
  /** Conflict resolution: evict the other device and keep this session. */
  terminateOtherSession: () => Promise<void>
  /** Conflict resolution: abandon this login, leave the other device alone. */
  cancelSessionClaim: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionClaim, setSessionClaim] = useState<SessionClaim>('idle')
  // session_id this provider has already run the claim check for — so the
  // gate runs once per session, not on every protected-route navigation or
  // token refresh (a refresh rotates the access token but keeps session_id).
  const claimedSid = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Reset the gate whenever we drop to no session (sign-out / eviction), so the
  // next login is re-checked from scratch.
  useEffect(() => {
    if (!session) {
      claimedSid.current = null
      setSessionClaim('idle')
    }
  }, [session])

  // Claim this session (record + evict others, aal2-gated server-side) and
  // nudge any other device to re-check immediately.
  const claimAndBroadcast = useCallback(async () => {
    await supabase.rpc('claim_session').then(() => undefined, () => undefined)
    const { data } = await supabase.auth.getSession() // local read, no network
    if (data.session?.user.id) broadcastSessionClaimed(data.session.user.id)
  }, [])

  // Run once per fully-authenticated session: is another device live?
  // If yes → hold at 'conflict' for the user's choice; if no → claim and go.
  // Triggered by ProtectedRoute after the email + MFA gates pass.
  const runSessionClaim = useCallback(() => {
    void (async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      const sid = jwtSessionId(s?.access_token)
      if (!sid || claimedSid.current === sid) return
      claimedSid.current = sid
      setSessionClaim('checking')
      const { data, error } = await supabase.rpc('has_other_live_session')
      if (error) {
        // Check failed — fall back to the old "last login wins" behavior
        // rather than trapping the user on a loading screen.
        await claimAndBroadcast()
        setSessionClaim('resolved')
        return
      }
      if (data === true) {
        setSessionClaim('conflict') // wait for Terminate / Cancel
      } else {
        await claimAndBroadcast()
        setSessionClaim('resolved')
      }
    })()
  }, [claimAndBroadcast])

  const terminateOtherSession = useCallback(async () => {
    await claimAndBroadcast()
    setSessionClaim('resolved')
  }, [claimAndBroadcast])

  const cancelSessionClaim = useCallback(async () => {
    // Abandon this login: sign THIS device out locally (the other device keeps
    // its session — it was never claimed/evicted). Resetting the guard lets a
    // later re-login be checked again.
    claimedSid.current = null
    setSessionClaim('idle')
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const signIn: AuthValue['signIn'] = async (identifier, password, captchaToken) => {
    // staff log in with a username (no @) -> map to the synthetic staff email
    const email = identifier.includes('@')
      ? identifier.trim()
      : `${identifier.trim().toLowerCase()}@ktc-staff.local`
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (!error) {
      // Fresh sign-in = fresh idle clock (a stale marker from a previous
      // session must not instantly log the new session out).
      stampActivity()
      // The single-session claim is NOT done here anymore: it runs in the
      // ProtectedRoute gate once the session is fully authenticated (past the
      // email + MFA gates), so a device-conflict can prompt Terminate/Cancel
      // BEFORE any eviction happens.
    }
    return { error: error?.message ?? null }
  }
  const signUp: AuthValue['signUp'] = async (email, password, extras) => {
    const acceptedAt = new Date().toISOString()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // With email confirmation ON, the confirm link lands on /confirmed, which
        // signs out and asks the broker to log in with their password.
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/confirmed` : undefined,
        // Consent is recorded on the auth user immediately — works even when there
        // is no session yet (email confirmation on). The valid ID + consent columns
        // are synced after first login (see PendingPanel), since storage/RLS need a session.
        data: {
          full_name: extras?.fullName ?? null,
          contact_number: extras?.contactNumber ?? null,
          irr_version: extras?.irrVersion ?? null,
          irr_accepted_at: extras?.irrVersion ? acceptedAt : null,
          terms_version: extras?.termsVersion ?? null,
          terms_accepted_at: extras?.termsVersion ? acceptedAt : null,
          privacy_consent_version: extras?.privacyVersion ?? null,
          privacy_consented_at: extras?.privacyVersion ? acceptedAt : null,
        },
        ...(extras?.captchaToken ? { captchaToken: extras.captchaToken } : {}),
      },
    })
    if (error) return { error: error.message }

    // 1 email = 1 account. Supabase HIDES "email already registered" to prevent
    // enumeration: for an existing confirmed email it returns a user with an
    // EMPTY identities array and sends NO confirmation — which looks like a
    // successful signup. This is a closed broker portal, so surface it plainly
    // instead of letting someone think they re-registered.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: 'This email already has an account. Please sign in instead — or reset your password if you’ve forgotten it.' }
    }

    // With a session (email confirmation off), persist the valid ID + contact
    // number onto the customer row for admin visibility. Consent is recorded
    // separately via the server-stamped RPC below (the consent columns are not
    // client-writable — see migration 0162). Best-effort.
    if (data.session && data.user) {
      const updates: Record<string, unknown> = {}
      if (extras?.contactNumber) updates.contact_number = extras.contactNumber
      if (extras?.idFile) {
        const ext = extras.idFile.name.split('.').pop()?.toLowerCase() || 'dat'
        const path = `${data.user.id}/valid-id.${ext}`
        const { error: upErr } = await supabase.storage
          .from('valid-ids')
          .upload(path, extras.idFile, { upsert: true })
        if (!upErr) updates.valid_id_path = path
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('customers').update(updates).eq('user_id', data.user.id)
      }
      // Server-stamp the Customer Agreement consent (IRR + Terms + Privacy) in one
      // call; the consent columns are revoked from client UPDATE in 0162.
      const consentVersion = extras?.termsVersion ?? extras?.irrVersion ?? extras?.privacyVersion
      if (consentVersion) {
        await supabase.rpc('record_agreement_consent', { p_version: consentVersion })
      }
    }
    return { error: null }
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        signIn,
        signUp,
        signOut,
        sessionClaim,
        runSessionClaim,
        terminateOtherSession,
        cancelSessionClaim,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
