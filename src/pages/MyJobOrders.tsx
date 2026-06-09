import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import type { JobOrder } from '../lib/types'

const STATUS_LABEL: Record<string, string> = {
  held: 'Pending approval',
  submitted: 'Submitted',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function MyJobOrders() {
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('job_orders')
      .select(
        'id, jo_number, entry_number, status, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)',
      )
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as JobOrder[])
        setLoading(false)
      })
  }, [])

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>My Job Orders</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          Job orders you've submitted.
        </p>

        {loading ? (
          <span className="ktc-label">Loading…</span>
        ) : orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>
            No job orders yet. Create one on the{' '}
            <Link to="/job-order" className="ktc-link">New Job Order</Link> page.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.55)',
                  border: '1px solid var(--glass-brd)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ fontSize: 15 }}>{o.jo_number}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>
                    {new Date(o.created_at).toLocaleDateString()} · {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                {o.status === 'held' && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'hsl(30 60% 38%)' }}>
                    Can’t be processed until you pass final verification — upload your valid ID, then a KTC admin verifies your account and it’s sent automatically.
                  </div>
                )}
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                  {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'No consignee'}
                  {o.entry_number ? ` · Entry ${o.entry_number}` : ''}
                </div>
                {o.lines && o.lines.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {o.lines.map((l, i) => (
                      <li key={i}>
                        {l.container_number} — {l.service_request}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
