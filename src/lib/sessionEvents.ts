// Tiny pub/sub so the headless useSessionGuard hook can tell the app-root
// overlay "this session was just superseded on another device" without
// coupling the hook to React context. One event, in-process only.

type Listener = () => void
const listeners = new Set<Listener>()

/** Notify the app that THIS session was evicted by a newer login. */
export function emitSuperseded() {
  for (const l of listeners) {
    try { l() } catch { /* a bad listener must not block the others */ }
  }
}

/** Subscribe to supersede events; returns an unsubscribe fn. */
export function onSuperseded(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
