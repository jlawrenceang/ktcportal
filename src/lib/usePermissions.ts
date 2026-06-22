import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useBroker } from './useBroker'

export type Permission =
  | 'view_job_orders'
  | 'view_xray_queue'
  | 'verify_release_docs'
  | 'file_job_orders'
  | 'process_job_orders'
  | 'confirm_xray'
  | 'record_invoice'
  | 'review_payments'
  | 'manage_approvals'
  | 'manage_customers'
  | 'manage_consignees'
  | 'review_consignee_requests'
  | 'manage_pricing'
  | 'manage_vessel_schedule'
  | 'assess_rps'
  | 'manage_support'
  | 'accept_orders'
  | 'complete_orders'
  | 'hold_reject_orders'

/**
 * UI mirror of the owner-tweakable role gates (role_permissions, migration
 * 0035). This only decides what to SHOW — the backend enforces the same gates
 * via has_permission() in RLS policies and the record_van_xray /
 * record_service_invoice RPCs. Owner passes every gate (failsafe).
 */
export function usePermissions() {
  const { broker, loading: brokerLoading } = useBroker()
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (brokerLoading) return
    const role = broker?.is_owner ? 'owner' : broker?.staff_role ?? (broker?.is_admin ? 'admin' : null)
    if (!role) { setAllowed(new Set()); setLoading(false); return }
    if (role === 'owner') { setAllowed(new Set(['*'])); setLoading(false); return }
    let active = true
    supabase
      .from('role_permissions')
      .select('permission, allowed')
      .eq('role', role)
      .then(({ data }) => {
        if (!active) return
        setAllowed(new Set((data ?? []).filter((r) => r.allowed).map((r) => r.permission as string)))
        setLoading(false)
      })
    return () => { active = false }
  }, [broker, brokerLoading])

  const can = (p: Permission) => allowed.has('*') || allowed.has(p)

  return { can, loading: loading || brokerLoading, broker }
}
