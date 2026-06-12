import { useEffect } from 'react'
import { supabase } from './supabase'

// One session per account, last login wins (migration 0054): a fresh
// sign-in claims the account and evicts every other auth session server-
// side. This hook is the evicted side's exit: it asks "am I still the
// live session?" on mount, on tab focus and every 60s, and when the
// answer is no it signs THIS client out locally — local scope only, a
// global sign-out here would revoke the new session that just won.
export function useSessionGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let busy = false
    const check = async () => {
      if (busy) return
      busy = true
      try {
        const { data, error } = await supabase.rpc('is_current_session')
        // Errors (offline, RPC not deployed yet) must never sign anyone out.
        if (stopped || error || data !== false) return
        sessionStorage.setItem('ktc_session_superseded', '1')
        await supabase.auth.signOut({ scope: 'local' })
      } finally {
        busy = false
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = setInterval(() => void check(), 60 * 1000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    void check()
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled])
}
