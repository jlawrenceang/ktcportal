import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { JobOrder } from '../lib/types'

interface AdminJobOrder extends JobOrder {
  broker?: { full_name: string | null; email: string | null } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function AllJobOrders() {
  const [orders, setOrders] = useState<AdminJobOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('job_orders')
      .select(
        'id, jo_number, entry_number, status, created_at, broker:customers(full_name, email), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)',
      )
      // Held orders belong to not-yet-verified brokers — keep them out of the queue
      // until they're released (status -> submitted) on approval.
      .neq('status', 'held')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = ((data ?? []) as unknown as AdminJobOrder[]).map((o) => ({
          ...o,
          broker: one(o.broker),
          consignee: one(o.consignee),
        }))
        setOrders(rows)
        setLoading(false)
      })
  }, [])

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Job Orders</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>All job orders submitted across customers.</p>

        {loading ? <span className="ktc-label">Loading…</span> : orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No job orders yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{o.jo_number ?? '—'}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()} · {o.status}</span>
                </div>
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                  {o.broker?.full_name || o.broker?.email || 'Unknown customer'}
                  {' · '}{o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'no consignee'}
                  {o.entry_number ? ` · Entry ${o.entry_number}` : ''}
                </div>
                {o.lines && o.lines.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {o.lines.map((l, i) => (<li key={i}>{l.container_number} — {l.service_request}</li>))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
