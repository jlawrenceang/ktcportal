import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { SERVICE_REQUESTS } from './types'

let cache: string[] | null = null

/**
 * The ACTIVE service catalogue, from service_rates (admin-managed in
 * Settings — add/deactivate without code changes). Falls back to the
 * built-in list until loaded or if the table is ever empty.
 */
export function useServices(): string[] {
  const [list, setList] = useState<string[]>(cache ?? [...SERVICE_REQUESTS])
  useEffect(() => {
    if (cache) return
    let on = true
    void supabase
      .from('service_rates')
      .select('service')
      .eq('active', true)
      .order('service')
      .then(({ data }) => {
        if (!on || !data?.length) return
        cache = data.map((d) => d.service as string)
        setList(cache)
      })
    return () => { on = false }
  }, [])
  return list
}
