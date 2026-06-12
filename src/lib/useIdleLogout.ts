import { useEffect, useRef, useState } from 'react'

// Sign the user out after `ms` of no interaction. Any of the listed activity
// events resets the countdown. The callback is kept in a ref so changing its
// identity each render doesn't re-arm the listeners.
//
// One minute before the deadline the hook returns `warning = true` so the
// shell can show a "still there?" prompt — any click/keypress/movement
// (including on the prompt itself) counts as activity, resets the timer and
// clears the warning.
//
// Last activity is also persisted to localStorage so the rule survives a
// closed browser: come back after the timeout (even via a fresh tab or a
// restored session) and the stale marker signs you out immediately. The
// shared marker doubles as a multi-tab guard — activity in any tab keeps
// every tab alive.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

const KEY = 'ktc_last_activity'

/** Show the "still there?" prompt this long before the sign-out fires. */
const WARN_MS = 60 * 1000

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

export function useIdleLogout(onIdle: () => void, ms: number, enabled = true): boolean {
  const cb = useRef(onIdle)
  cb.current = onIdle
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // Closed-browser / restored-session case: already idle past the limit.
    const stored = lastActivity()
    if (stored && Date.now() - stored > ms) {
      try { localStorage.removeItem(KEY) } catch { /* ignore */ }
      cb.current()
      return
    }

    let warnTimer: ReturnType<typeof setTimeout>
    let fireTimer: ReturnType<typeof setTimeout>
    let last = 0
    const fire = () => {
      // Another tab may have seen activity — trust the shared marker.
      const at = lastActivity()
      const idleFor = Date.now() - at
      if (at && idleFor < ms) {
        setWarning(false)
        fireTimer = setTimeout(fire, ms - idleFor)
        return
      }
      try { localStorage.removeItem(KEY) } catch { /* ignore */ }
      setWarning(false)
      cb.current()
    }
    const warn = () => {
      const at = lastActivity()
      const idleFor = Date.now() - at
      if (at && idleFor < ms - WARN_MS) {
        warnTimer = setTimeout(warn, ms - WARN_MS - idleFor)
        return
      }
      setWarning(true)
    }
    const arm = () => {
      clearTimeout(warnTimer)
      clearTimeout(fireTimer)
      if (ms > WARN_MS) warnTimer = setTimeout(warn, ms - WARN_MS)
      fireTimer = setTimeout(fire, ms)
    }
    const onActivity = () => {
      // Throttle: at most one re-arm per second (mousemove can fire constantly).
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      try { localStorage.setItem(KEY, String(now)) } catch { /* ignore */ }
      setWarning(false)
      arm()
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    stampActivity()
    arm()
    return () => {
      clearTimeout(warnTimer)
      clearTimeout(fireTimer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [ms, enabled])

  return warning
}
