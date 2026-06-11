import { supabase } from './supabase'

// Client-side error reporting → log_client_error RPC → app_errors table
// (surfaced in Settings → System health; watchdog emails the owner on a
// spike). Throttled hard: reporting must never become its own problem.

const seen = new Set<string>()
let windowStart = Date.now()
let sentThisWindow = 0

const IGNORE = [
  'ResizeObserver loop', // benign browser noise
  'Script error.',       // opaque cross-origin errors carry no signal
]

function report(message: string, stack?: string | null) {
  try {
    if (!message || IGNORE.some((m) => message.includes(m))) return
    const now = Date.now()
    if (now - windowStart > 60_000) {
      windowStart = now
      sentThisWindow = 0
    }
    if (sentThisWindow >= 5) return
    const key = message.slice(0, 200)
    if (seen.has(key)) return // once per distinct error per session
    seen.add(key)
    sentThisWindow++
    void supabase.rpc('log_client_error', {
      p_message: message.slice(0, 500),
      p_stack: stack?.slice(0, 4000) ?? null,
      p_path: window.location.pathname,
      p_ua: navigator.userAgent.slice(0, 300),
    })
  } catch {
    // never break the app over reporting
  }
}

export function reportError(err: unknown) {
  const e = err as { message?: string; stack?: string } | null
  report(e?.message ?? String(err), e?.stack)
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    report(e.message || 'Unknown error', (e.error as Error | undefined)?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | null
    report(r?.message ?? String(e.reason), r?.stack)
  })
}
