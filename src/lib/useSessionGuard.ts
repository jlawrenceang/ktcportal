import { useEffect } from 'react'
import { supabase } from './supabase'
import { emitSuperseded } from './sessionEvents'
import { sessionChannelName } from './sessionChannel'

// One session per account, last login wins (migration 0054): a fresh
// sign-in claims the account and evicts every other auth session server-
// side. This hook is the evicted side's exit: it asks "am I still the
// live session?" on mount, on tab focus, every 60s, AND the instant a
// newer login broadcasts on this account's realtime channel. When the
// answer is no it raises the in-session "signed out elsewhere" notice and
// signs THIS client out locally — local scope only, a global sign-out
// here would revoke the new session that just won.
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
        stopped = true // one supersede is terminal — don't double-fire
        sessionStorage.setItem('ktc_session_superseded', '1')
        emitSuperseded() // in-session "you were signed out on another device" overlay
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

    // Instant path: subscribe to this account's claim channel so a new login
    // elsewhere wakes us to re-check straight away (no ~60s poll wait).
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || stopped) return
      realtimeChannel = supabase.channel(sessionChannelName(uid))
      realtimeChannel.on('broadcast', { event: 'claimed' }, () => { void check() })
      realtimeChannel.subscribe()
    })

    void check()
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel)
    }
  }, [enabled])
}
