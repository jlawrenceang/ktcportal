import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Broker } from './types'

/** Loads the signed-in user's broker profile (RLS returns only their own row). */
export function useBroker() {
  const [broker, setBroker] = useState<Broker | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('brokers')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setBroker((data as Broker) ?? null)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  return { broker, loading }
}
