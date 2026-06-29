import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { usePermissions, type Permission } from './usePermissions'

// "Needs attention" counts for the admin nav badges — one number per section,
// each gated by the same permission that reveals the section. Only the counts
// the signed-in role can see are fetched (RLS would zero out the rest anyway).
// Refreshed on navigation + every 60s so the pills stay live, mirroring the
// customer Orders badge.
const num = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0

// `perm` may be a single gate or a list — the badge shows when the role holds
// ANY of them (mirrors the nav section's `anyPerm`).
type CountDef = { route: string; perm: Permission | Permission[]; run: () => Promise<number> }

const DEFS: CountDef[] = [
  // Accounts waiting for approval.
  { route: '/admin/approvals', perm: 'manage_approvals',
    run: () => num(supabase.from('customers').select('id', { count: 'exact', head: true })
      .eq('is_admin', false).eq('is_owner', false).is('staff_role', null).eq('status', 'pending')) },
  // Consignees waiting for approval. Visible to whoever can see the section —
  // the CSR (review_consignee_requests) AND admin/operations (manage_consignees),
  // matching AdminBottomNav's anyPerm gate so the badge never goes missing.
  { route: '/admin/consignees', perm: ['review_consignee_requests', 'manage_consignees'],
    run: () => num(supabase.from('consignees').select('id', { count: 'exact', head: true }).eq('status', 'pending')) },
  // Open job orders in the working queue.
  { route: '/admin/job-orders', perm: 'view_job_orders',
    run: () => num(supabase.from('job_orders').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'processing', 'on_hold']).is('archived_at', null)) },
  // Open support tickets.
  { route: '/admin/support', perm: 'manage_support',
    run: () => num(supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open')) },
  // Customer payment proofs awaiting the cashier's review — a billed charge whose
  // payment was submitted (post-cutover: money lives on `charges`, settled at the
  // Payment Orders desk).
  { route: '/admin/payment-orders', perm: 'review_payments',
    run: () => num(supabase.from('charges').select('id', { count: 'exact', head: true })
      .eq('bill_status', 'billed').eq('payment_status', 'submitted')) },
  // Vans still awaiting an X-ray confirmation (per line, in the live queue).
  // KTC-16: only ACCEPTED orders (processing/on_hold) belong to the checker — a
  // still-submitted order hasn't cleared the ops accept gate yet.
  { route: '/admin/checker', perm: 'confirm_xray',
    run: () => num(supabase.from('job_order_lines').select('id, job_orders!inner(status)', { count: 'exact', head: true })
      .is('xray_done_at', null).ilike('service_request', '%x-ray%')
      .in('job_orders.status', ['processing', 'on_hold'])) },
]

export function useAdminCounts(): Record<string, number> {
  const { can, loading } = usePermissions()
  const loc = useLocation()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [tick, setTick] = useState(0)

  // 60s heartbeat so the pills refresh even without navigating.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (loading) return
    let active = true
    const defs = DEFS.filter((d) => (Array.isArray(d.perm) ? d.perm.some((p) => can(p)) : can(d.perm)))
    void Promise.all(defs.map(async (d) => {
      try { return [d.route, await d.run()] as const }
      catch { return [d.route, 0] as const }
    })).then((pairs) => {
      if (!active) return
      const next: Record<string, number> = {}
      for (const [route, n] of pairs) next[route] = n
      setCounts(next)
    })
    return () => { active = false }
    // `can` is intentionally omitted — it changes identity every render and we
    // re-read it inside; re-run only on perms-ready, navigation, and the tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loc.pathname, tick])

  return counts
}
