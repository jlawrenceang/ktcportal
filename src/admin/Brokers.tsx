import { useEffect, useState, type CSSProperties } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'
import { BrokerReview } from './BrokerReview'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'hsl(40 90% 94%)', fg: 'hsl(35 80% 38%)' },
  approved: { bg: 'hsl(150 50% 93%)', fg: 'hsl(150 60% 30%)' },
  rejected: { bg: 'hsl(0 70% 95%)', fg: 'hsl(0 65% 45%)' },
  suspended: { bg: 'hsl(28 85% 93%)', fg: 'hsl(24 80% 40%)' },
}

const btn = (kind: 'danger' | 'ok' | 'muted'): CSSProperties => ({
  border: kind === 'muted' ? '1px solid hsl(var(--line))' : 0,
  borderRadius: 10, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer',
  color: kind === 'muted' ? 'hsl(var(--ink-2))' : '#fff',
  background: kind === 'danger' ? 'linear-gradient(135deg, hsl(24 80% 52%), hsl(20 80% 44%))'
    : kind === 'ok' ? 'linear-gradient(135deg, hsl(150 55% 42%), hsl(150 60% 34%))'
    : 'rgba(255,255,255,0.7)',
})

export default function Brokers() {
  const [rows, setRows] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [suspendId, setSuspendId] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  async function load() {
    // External brokers only — staff/admins live under Settings.
    const { data, error } = await supabase
      .from('customers').select('*').eq('is_admin', false).eq('is_owner', false)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRows((data ?? []) as Broker[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function setStatus(id: string, status: 'approved' | 'suspended', reason?: string) {
    setActing(id); setError(null)
    const { error } = await supabase.from('customers').update({
      status, decided_at: new Date().toISOString(),
      decision_reason: status === 'suspended' ? (reason?.trim() || null) : null,
    }).eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    setSuspendId(null); setSuspendReason('')
    void load()
  }

  async function viewId(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('valid-ids').createSignedUrl(path, 60)
    if (error || !data) return setError(error?.message ?? 'Could not open ID.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Customers</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          All registered customer accounts and their status. Approve/reject pending ones under Approvals; suspend or reactivate approved accounts here.
        </p>
        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? <span className="ktc-label">Loading…</span> : rows.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No customer accounts yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((b) => {
              const ss = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending
              return (
                <div key={b.id} style={{ display: 'grid', gap: suspendId === b.id ? 8 : 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)',
                  }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {b.customer_code && (
                          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 600, color: 'hsl(var(--ink-2))' }}>{b.customer_code}</span>
                        )}
                        <b>{b.full_name || b.email || 'Unknown'}</b>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{b.status}</span>
                      </div>
                      <div className="ktc-label" style={{ fontSize: 13 }}>
                        {b.email}{b.customer_id ? ` · #${b.customer_id}` : ''}
                        {b.valid_id_path && (<> · <button className="ktc-link" style={{ fontSize: 12 }} onClick={() => viewId(b.valid_id_path)}>View ID</button></>)}
                      </div>
                      <BrokerReview b={b} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {b.status === 'approved' && (
                        <button type="button" disabled={acting === b.id} style={btn('danger')}
                          onClick={() => { setSuspendId(b.id); setSuspendReason('') }}>Suspend</button>
                      )}
                      {b.status === 'suspended' && (
                        <button type="button" disabled={acting === b.id} style={btn('ok')}
                          onClick={() => setStatus(b.id, 'approved')}>Reactivate</button>
                      )}
                    </div>
                  </div>
                  {suspendId === b.id && (
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'hsl(28 85% 97%)', border: '1px solid hsl(28 70% 88%)', display: 'grid', gap: 8 }}>
                      <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>Reason for suspension (shown to the customer)</label>
                      <textarea className="ktc-input" rows={2} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                        placeholder="e.g. Pending document re-verification." />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" disabled={acting === b.id || !suspendReason.trim()} style={btn('danger')}
                          onClick={() => setStatus(b.id, 'suspended', suspendReason)}>Confirm suspension</button>
                        <button type="button" disabled={acting === b.id} style={btn('muted')}
                          onClick={() => { setSuspendId(null); setSuspendReason('') }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
