import { useEffect, useRef } from 'react'

// Sign the user out after `ms` of no interaction. Any of the listed activity
// events resets the countdown. The callback is kept in a ref so changing its
// identity each render doesn't re-arm the listeners.
//
// Last activity is also persisted to localStorage so the rule survives a
// closed browser: come back after the timeout (even via a fresh tab or a
// restored session) and the stale marker signs you out immediately. The
// shared marker doubles as a multi-tab guard — activity in any tab keeps
// every tab alive.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

const KEY = 'ktc_last_activity'

/** Stamp activity "now" — called on successful sign-in so a marker left over
 *  from a previous session can't instantly log the fresh session out. */
export function stampActivity() {
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch { /* storage unavailable — in-memory timer still applies */ }
}

const lastActivity = () => {
  try {
    return Number(localStorage.getItem(KEY) || 0)
  } catch {
    return 0
  }
}

export function useIdleLogout(onIdle: () => void, ms: number) {
  const cb = useRef(onIdle)
  cb.current = onIdle

  useEffect(() => {
    // Closed-browser / restored-session case: already idle past the limit.
    const stored = lastActivity()
    if (stored && Date.now() - stored > ms) {
      try { localStorage.removeItem(KEY) } catch { /* ignore */ }
      cb.current()
      return
    }

    let timer: ReturnType<typeof setTimeout>
    let last = 0
    const fire = () => {
      // Another tab may have seen activity — trust the shared marker.
      const at = lastActivity()
      const idleFor = Date.now() - at
      if (at && idleFor < ms) {
        timer = setTimeout(fire, ms - idleFor)
        return
      }
      try { localStorage.removeItem(KEY) } catch { /* ignore */ }
      cb.current()
    }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(fire, ms)
    }
    const onActivity = () => {
      // Throttle: at most one re-arm per second (mousemove can fire constantly).
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      try { localStorage.setItem(KEY, String(now)) } catch { /* ignore */ }
      arm()
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    stampActivity()
    arm()
    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [ms])
}
