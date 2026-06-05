import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'hsl(40 90% 94%)', fg: 'hsl(35 80% 38%)' },
  approved: { bg: 'hsl(150 50% 93%)', fg: 'hsl(150 60% 30%)' },
  rejected: { bg: 'hsl(0 70% 95%)', fg: 'hsl(0 65% 45%)' },
}

export default function Brokers() {
  const [rows, setRows] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // External brokers only — staff/admins live under Settings.
    supabase
      .from('brokers')
      .select('*')
      .eq('is_admin', false)
      .eq('is_owner', false)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows((data ?? []) as Broker[])
        setLoading(false)
      })
  }, [])

  async function viewId(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('valid-ids').createSignedUrl(path, 60)
    if (error || !data) return setError(error?.message ?? 'Could not open ID.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Brokers</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          All registered broker accounts and their status. Approve or reject under the Approvals tab.
        </p>
        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? <span className="ktc-label">Loading…</span> : rows.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No broker accounts yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((b) => {
              const ss = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)',
                }}>
                  <div style={{ fontSize: 14, lineHeight: 1.5, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {b.broker_code && (
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 600, color: 'hsl(var(--ink-2))' }}>{b.broker_code}</span>
                      )}
                      <b>{b.full_name || b.email || 'Unknown'}</b>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{b.status}</span>
                    </div>
                    <div className="ktc-label" style={{ fontSize: 13 }}>
                      {b.email}{b.customer_id ? ` · #${b.customer_id}` : ''}
                      {b.valid_id_path && (<> · <button className="ktc-link" style={{ fontSize: 12 }} onClick={() => viewId(b.valid_id_path)}>View ID</button></>)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
