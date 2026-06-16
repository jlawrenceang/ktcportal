import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Broker } from './types'

// Module-level cache of the last-loaded profile, keyed by user id. useBroker is
// called fresh by every page (it isn't a shared context), so without this each
// navigation re-fetches and flashes `broker = null` for a moment — which made
// the AdminShell role pill blink to its "Admin" fallback even for the owner.
// Seeding state from the cache keeps the role stable across navigations. The
// cache is cleared on sign-out so a later login never shows the old role.
let cache: { uid: string; broker: Broker | null } | null = null
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') cache = null
})

/**
 * Loads the signed-in user's own broker profile.
 * Must filter by user_id: admins can read ALL broker rows (RLS), so an
 * unfiltered .maybeSingle() would error on multiple rows and return null.
 *
 * `refresh()` refetches in place (no loading flash) — used by the pending
 * banner so a customer can pull their latest status without a page reload.
 */
export function useBroker() {
  const [broker, setBroker] = useState<Broker | null>(cache?.broker ?? null)
  // Only show a loading state when we have nothing cached to render meanwhile.
  const [loading, setLoading] = useState(!cache)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id
      if (!uid) {
        cache = null
        if (active) {
          setBroker(null)
          setLoading(false)
        }
        return
      }
      // A cached row for a DIFFERENT user must not leak through — drop it.
      if (cache && cache.uid !== uid) {
        cache = null
        if (active) { setBroker(null); setLoading(true) }
      }
      supabase
        .from('customers')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data: row }) => {
          cache = { uid, broker: (row as Broker) ?? null }
          if (active) {
            setBroker((row as Broker) ?? null)
            setLoading(false)
          }
        })
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return { broker, loading, refresh }
}
