import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { resumeTrustedMfaSession } from './mfaTrust'
import { supabase } from './supabase'

interface AalState {
  current: string
  next: string
}

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

export function useMfaGate(session: Session | null) {
  const sessionId = useMemo(() => jwtSessionId(session?.access_token), [session?.access_token])
  const [aal, setAal] = useState<AalState | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [checkedTrustFor, setCheckedTrustFor] = useState<string | null>(null)
  const [checkingTrust, setCheckingTrust] = useState(false)

  useEffect(() => {
    setAal(null)
    setTrusted(false)
    setCheckedTrustFor(null)
    setCheckingTrust(false)
    if (!session) return
    let active = true
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (active) setAal({ current: data?.currentLevel ?? 'aal1', next: data?.nextLevel ?? 'aal1' })
    })
    return () => { active = false }
  }, [session, sessionId])

  const needsServerMfa = !!aal && aal.next === 'aal2' && aal.current !== 'aal2'

  useEffect(() => {
    if (!session || !sessionId || !needsServerMfa || trusted || checkedTrustFor === sessionId) return
    let active = true
    setCheckedTrustFor(sessionId)
    setCheckingTrust(true)
    void resumeTrustedMfaSession().then((ok) => {
      if (active && ok) setTrusted(true)
    }).finally(() => {
      if (active) setCheckingTrust(false)
    })
    return () => { active = false }
  }, [checkedTrustFor, needsServerMfa, session, sessionId, trusted])

  const loading = !!session && (!aal || checkingTrust)
  const needsChallenge = !!session && needsServerMfa && !trusted && !checkingTrust
  const markVerified = useCallback(() => {
    setAal({ current: 'aal2', next: 'aal2' })
    setTrusted(true)
    if (sessionId) setCheckedTrustFor(sessionId)
  }, [sessionId])

  return { loading, needsChallenge, markVerified }
}
