import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { Broker, JobOrder } from '../lib/types'
import { BrokerReview } from './BrokerReview'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'hsl(40 90% 94%)', fg: 'hsl(35 80% 38%)' },
  approved: { bg: 'hsl(150 50% 93%)', fg: 'hsl(150 60% 30%)' },
  rejected: { bg: 'hsl(0 70% 95%)', fg: 'hsl(0 65% 45%)' },
  suspended: { bg: 'hsl(28 85% 93%)', fg: 'hsl(24 80% 40%)' },
}
const JO_STATUS: Record<string, string> = {
  held: 'Pending approval (held)', submitted: 'Submitted', processing: 'Processing', completed: 'Completed', cancelled: 'Cancelled',
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function CustomerDetail() {
  const { id } = useParams()
  const [cust, setCust] = useState<Broker | null>(null)
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const [c, o] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).maybeSingle(),
        supabase.from('job_orders')
          .select('id, jo_number, entry_number, status, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)')
          .eq('customer_id', id).order('created_at', { ascending: false }),
      ])
      if (c.error) setError(c.error.message)
      setCust((c.data as Broker) ?? null)
      setOrders(((o.data ?? []) as unknown as JobOrder[]).map((r) => ({ ...r, consignee: one(r.consignee) })))
      setLoading(false)
    })()
  }, [id])

  async function viewId(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('valid-ids').createSignedUrl(path, 60)
    if (error || !data) return setError(error?.message ?? 'Could not open ID.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (loading) return <AdminShell><span className="ktc-label">Loading…</span></AdminShell>
  if (!cust) return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <p className="ktc-label">Customer not found. <Link to="/admin/customers" className="ktc-link">Back to Customers</Link></p>
      </div>
    </AdminShell>
  )

  const ss = STATUS_STYLE[cust.status] ?? STATUS_STYLE.pending
  return (
    <AdminShell>
      {error && <div className="ktc-glass" style={{ padding: 14, marginBottom: 16, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {cust.customer_code && <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 600, color: 'hsl(var(--ink-2))' }}>{cust.customer_code}</span>}
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{cust.full_name || cust.email || 'Customer'}</h1>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{cust.status}</span>
        </div>
        <div className="ktc-label" style={{ marginTop: 10, fontSize: 14, display: 'grid', gap: 4 }}>
          <div>Email: {cust.email}</div>
          <div>Contact: {cust.contact_number || '—'}</div>
          {cust.valid_id_path && <div>Valid ID: <button className="ktc-link" style={{ fontSize: 13 }} onClick={() => viewId(cust.valid_id_path)}>View</button></div>}
          {cust.decided_at && <div>Decided: {new Date(cust.decided_at).toLocaleString()}</div>}
          {cust.decision_reason && <div>Note to customer: {cust.decision_reason}</div>}
        </div>
        <BrokerReview b={cust} />
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Job order history</h2>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>{orders.length} order{orders.length === 1 ? '' : 's'}.</p>
        {orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No job orders yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{o.jo_number ?? 'Draft (no number yet)'}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()} · {JO_STATUS[o.status] ?? o.status}</span>
                </div>
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                  {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'No consignee'}{o.entry_number ? ` · Entry ${o.entry_number}` : ''}
                </div>
                {o.lines && o.lines.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {o.lines.map((l, i) => <li key={i}>{l.container_number} — {l.service_request}</li>)}
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
