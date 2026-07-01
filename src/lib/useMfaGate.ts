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

function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Security check timed out.')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function useMfaGate(session: Session | null) {
  const sessionId = useMemo(() => jwtSessionId(session?.access_token), [session?.access_token])
  const [aal, setAal] = useState<AalState | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [checkedTrustFor, setCheckedTrustFor] = useState<string | null>(null)
  const [checkingTrust, setCheckingTrust] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    setAal(null)
    setTrusted(false)
    setCheckedTrustFor(null)
    setCheckingTrust(false)
    setError(null)
    if (!session) return
    let active = true
    void withTimeout(supabase.auth.mfa.getAuthenticatorAssuranceLevel())
      .then(({ data, error: aalError }) => {
        if (!active) return
        if (aalError) {
          setError(aalError.message)
          return
        }
        setAal({ current: data?.currentLevel ?? 'aal1', next: data?.nextLevel ?? 'aal1' })
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Security check failed.')
      })
    return () => { active = false }
  }, [session?.user.id, sessionId, retryNonce])

  const needsServerMfa = !!aal && aal.next === 'aal2' && aal.current !== 'aal2'

  useEffect(() => {
    if (!session || !sessionId || !needsServerMfa || trusted || checkedTrustFor === sessionId) return
    let active = true
    setCheckedTrustFor(sessionId)
    setCheckingTrust(true)
    void withTimeout(resumeTrustedMfaSession())
      .then((ok) => {
        if (active && ok) setTrusted(true)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingTrust(false)
      })
    return () => { active = false }
  }, [checkedTrustFor, needsServerMfa, session, sessionId, trusted])

  const loading = !!session && !error && (!aal || checkingTrust)
  const needsChallenge = !!session && needsServerMfa && !trusted && !checkingTrust
  const markVerified = useCallback(() => {
    setAal({ current: 'aal2', next: 'aal2' })
    setTrusted(true)
    if (sessionId) setCheckedTrustFor(sessionId)
  }, [sessionId])
  const retry = useCallback(() => setRetryNonce((n) => n + 1), [])

  return { loading, needsChallenge, markVerified, error, retry }
}
