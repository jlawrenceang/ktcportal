import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surfaced in the console so a missing .env.local is obvious in dev.
  console.warn(
    '[KTC] Supabase env not set. Copy .env.example to .env.local and fill ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your KTC Supabase project.',
  )
}

// Surface server overload to the global <ServerBusyBanner/>: wrap fetch so any
// 502/503/504/429 or network failure emits 'ktc:server-busy', and a healthy 2xx
// emits 'ktc:server-ok'. The banner debounces single blips into a friendly
// "servers are busy — try again" notice. Behaviour of each call is unchanged.
const emit = (name: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)) }
const trackedFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init)
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) emit('ktc:server-busy')
    else if (res.ok) emit('ktc:server-ok')
    return res
  } catch (e) {
    emit('ktc:server-busy') // network failure / unreachable
    throw e
  }
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  global: { fetch: trackedFetch },
})
