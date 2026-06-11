import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePermissions } from '../lib/usePermissions'

// X-ray checker station (tablet-first, big touch targets).
//  * Queue: open orders with an X-ray service line, oldest first.
//  * Lookup: search a container/van number or JO number → cleared or not.
//  * "Confirm X-ray done" stamps date/time and completes the order
//    (record_xray RPC — permission-gated server-side).

interface CheckerOrder {
  id: string
  jo_number: string | null
  status: string
  xray_performed_at: string | null
  service_invoice_no: string | null
  created_at: string
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: { container_number: string; service_request: string }[]
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const SELECT =
  'id, jo_number, status, xray_performed_at, service_invoice_no, created_at, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)'

const isXray = (s: string) => s.toLowerCase().includes('x-ray')

function Clearance({ o }: { o: CheckerOrder }) {
  if (o.xray_performed_at) {
    return (
      <span className="ktc-chip ktc-chip--success">
        CLEARED · {new Date(o.xray_performed_at).toLocaleString()}
      </span>
    )
  }
  if (['submitted', 'processing', 'on_hold'].includes(o.status)) {
    return <span className="ktc-chip ktc-chip--danger">NOT CLEARED · X-ray pending</span>
  }
  return <span className="ktc-chip">{o.status}</span>
}

export default function Checker() {
  const { can } = usePermissions()
  const [queue, setQueue] = useState<CheckerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CheckerOrder[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('job_orders')
      .select(SELECT)
      .in('status', ['submitted', 'processing', 'on_hold'])
      .order('created_at', { ascending: true })
    const rows = ((data ?? []) as unknown as CheckerOrder[])
      .map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) }))
      .filter((o) => (o.lines ?? []).some((l) => isXray(l.service_request)))
    setQueue(rows)
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { refresh, cooling } = useAutoRefresh(load)

  // Container / JO lookup — answers "is this van cleared for release?"
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setResults(null); return }
    const handle = setTimeout(async () => {
      const byJo = supabase.from('job_orders').select(SELECT).ilike('jo_number', `%${q}%`).limit(10)
      const byContainer = supabase
        .from('job_order_lines')
        .select('job_order:job_orders(' + SELECT + ')')
        .ilike('container_number', `%${q}%`)
        .limit(20)
      const [j, c] = await Promise.all([byJo, byContainer])
      const found = new Map<string, CheckerOrder>()
      for (const row of (j.data ?? []) as unknown as CheckerOrder[]) found.set(row.id, row)
      for (const row of (c.data ?? []) as unknown as { job_order: CheckerOrder | CheckerOrder[] | null }[]) {
        const jo = one(row.job_order)
        if (jo) found.set(jo.id, jo)
      }
      setResults(Array.from(found.values()).map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) })))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  async function confirmXray(id: string) {
    setBusyId(id); setError(null)
    const { error: rpcErr } = await supabase.rpc('record_xray', { p_id: id })
    setBusyId(null); setConfirmId(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setQuery(''); setResults(null)
    await load()
  }

  function OrderCard({ o, highlight }: { o: CheckerOrder; highlight?: boolean }) {
    const xrayLines = (o.lines ?? []).filter((l) => isXray(l.service_request))
    const confirmable = can('confirm_xray') && !o.xray_performed_at && ['submitted', 'processing', 'on_hold'].includes(o.status)
    return (
      <div style={{
        padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.6)',
        border: highlight ? '1px solid rgb(var(--acc-rgb) / 0.45)' : '1px solid var(--glass-brd)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <b className="ktc-mono" style={{ fontSize: 17 }}>{o.jo_number ?? '—'}</b>
          <Clearance o={o} />
          <span className="ktc-label" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            filed {new Date(o.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className="ktc-label" style={{ fontSize: 13.5, marginTop: 6 }}>
          {o.broker?.full_name || 'Unknown customer'} · {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'no consignee'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {(xrayLines.length ? xrayLines : o.lines ?? []).map((l, i) => (
            <span key={i} className="ktc-mono" style={{ fontSize: 13.5, fontWeight: 600, padding: '6px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.7)', border: '1px solid var(--glass-brd)' }}>
              {l.container_number}
              <span className="ktc-label" style={{ fontSize: 11, marginLeft: 8, fontFamily: 'var(--font-sans)' }}>{l.service_request}</span>
            </span>
          ))}
        </div>
        {confirmable && (
          <div style={{ marginTop: 14 }}>
            {confirmId === o.id ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Confirm X-ray done now ({new Date().toLocaleTimeString()})?</span>
                <button className="ktc-btn" style={{ width: 'auto', padding: '12px 22px', fontSize: 15 }} disabled={busyId === o.id}
                  onClick={() => void confirmXray(o.id)}>
                  {busyId === o.id ? 'Saving…' : '✓ Yes — X-ray done'}
                </button>
                <button className="ktc-btn-secondary" style={{ padding: '12px 18px' }} onClick={() => setConfirmId(null)}>Back</button>
              </div>
            ) : (
              <button className="ktc-btn" style={{ width: 'auto', padding: '13px 26px', fontSize: 15 }} onClick={() => setConfirmId(o.id)}>
                ✓ Confirm X-ray done
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.026em' }}>X-ray Checker</h1>
          <p className="ktc-sub">Confirm completed X-rays · look up a van's clearance before release.</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>↻ Refresh</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'hsl(0 75% 97%)', border: '1px solid hsl(0 70% 88%)' }}>
          {error}
        </div>
      )}

      {/* Lookup */}
      <div className="ktc-glass" style={{ padding: 22, marginBottom: 18 }}>
        <label className="ktc-label" htmlFor="lookup" style={{ fontWeight: 600 }}>Check a container / van or JO number</label>
        <input
          id="lookup"
          className="ktc-input ktc-mono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. TCLU1234567 or JO-000123"
          autoComplete="off"
          style={{ marginTop: 8, fontSize: 17, padding: '14px 16px' }}
        />
        {results && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {results.length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 14 }}>No job order found for “{query.trim()}”. No X-ray request on file.</span>
            ) : (
              results.map((o) => <OrderCard key={o.id} o={o} highlight />)
            )}
          </div>
        )}
      </div>

      {/* Pending X-ray queue */}
      <div className="ktc-glass" style={{ padding: 22 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>
          X-ray line — {loading ? '…' : queue.length} waiting
        </h2>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {loading ? (
            [72, 72].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 16 }} />)
          ) : queue.length === 0 ? (
            <span className="ktc-label" style={{ fontSize: 14 }}>Queue is clear. 🎉</span>
          ) : (
            queue.map((o) => <OrderCard key={o.id} o={o} />)
          )}
        </div>
      </div>
    </AdminShell>
  )
}
