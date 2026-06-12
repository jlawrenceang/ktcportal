import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { SERVICE_REQUESTS } from './types'

const STORE_KEY = 'ktc_services'
let cache: string[] | null = null

// Fallback order: last catalogue this browser saw (kept current every load)
// → built-in list (only a brand-new device that can't reach the server).
function lastKnown(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (Array.isArray(stored) && stored.length && stored.every((s) => typeof s === 'string')) return stored
  } catch { /* fall through */ }
  return [...SERVICE_REQUESTS]
}

/**
 * The ACTIVE service catalogue, from service_rates (admin-managed in
 * Settings — add/deactivate without code changes). Renders the last-known
 * catalogue instantly, then refreshes from the server.
 */
export function useServices(): string[] {
  const [list, setList] = useState<string[]>(() => cache ?? lastKnown())
  useEffect(() => {
    if (cache) return
    let on = true
    void supabase
      .from('service_rates')
      .select('service')
      .eq('active', true)
      .order('sort_order')
      .order('service')
      .then(({ data }) => {
        if (!on || !data?.length) return
        cache = data.map((d) => d.service as string)
        try { localStorage.setItem(STORE_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
        setList(cache)
      })
    return () => { on = false }
  }, [])
  return list
}
