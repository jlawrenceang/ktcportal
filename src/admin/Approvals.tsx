import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { AdminRow } from './AdminRow'

interface PendingBroker {
  id: string
  broker_code: string | null
  full_name: string | null
  email: string | null
  customer_id: string | null
  valid_id_path: string | null
}

interface PendingAccreditation {
  id: string
  broker: { full_name: string | null; email: string | null } | null
  consignee: { code: string; name: string } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function Approvals() {
  const [brokers, setBrokers] = useState<PendingBroker[]>([])
  const [accreditations, setAccreditations] = useState<PendingAccreditation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  async function load() {
    const [b, a] = await Promise.all([
      supabase.from('brokers').select('id, broker_code, full_name, email, customer_id, valid_id_path').eq('status', 'pending').order('created_at'),
      supabase.from('accreditations').select('id, broker:brokers(full_name, email), consignee:consignees(code, name)').eq('status', 'pending').order('requested_at'),
    ])
    if (b.error || a.error) { setError(b.error?.message ?? a.error?.message ?? 'Load failed'); setLoading(false); return }
    setBrokers((b.data ?? []) as PendingBroker[])
    setAccreditations(((a.data ?? []) as unknown as PendingAccreditation[]).map((r) => ({ ...r, broker: one(r.broker), consignee: one(r.consignee) })))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function decideBroker(id: string, status: 'approved' | 'rejected') {
    setActing(id); setError(null)
    const { error } = await supabase.from('brokers').update({ status, decided_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    setBrokers((x) => x.filter((r) => r.id !== id))
  }
  async function decideAccreditation(id: string, status: 'approved' | 'rejected') {
    setActing(id); setError(null)
    const { error } = await supabase.from('accreditations').update({ status, decided_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    setAccreditations((x) => x.filter((r) => r.id !== id))
  }
  async function viewId(path: string | null | undefined) {
    if (!path) return
    const { data, error } = await supabase.storage.from('valid-ids').createSignedUrl(path, 60)
    if (error || !data) return setError(error?.message ?? 'Could not open ID.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <AdminShell>
      {error && <div className="ktc-glass" style={{ padding: 14, marginBottom: 16, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Account approvals</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>Review the broker's valid ID before approving their account.</p>
        {loading ? <span className="ktc-label">Loading…</span> : brokers.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No accounts pending. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {brokers.map((b) => (
              <AdminRow key={b.id} title={`${b.broker_code ? b.broker_code + ' · ' : ''}${b.full_name || b.email || 'Unknown'}`}
                subtitle={`${b.email ?? ''}${b.customer_id ? ` · #${b.customer_id}` : ''}`}
                onViewId={b.valid_id_path ? () => viewId(b.valid_id_path) : undefined}
                busy={acting === b.id} onApprove={() => decideBroker(b.id, 'approved')} onReject={() => decideBroker(b.id, 'rejected')} />
            ))}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Accreditation approvals</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>Approving makes the consignee selectable in that broker's Job Order form.</p>
        {loading ? <span className="ktc-label">Loading…</span> : accreditations.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No pending requests. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {accreditations.map((r) => (
              <AdminRow key={r.id} title={r.broker?.full_name || r.broker?.email || 'Unknown broker'}
                subtitle={`requests ${r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : 'consignee'}`}
                busy={acting === r.id} onApprove={() => decideAccreditation(r.id, 'approved')} onReject={() => decideAccreditation(r.id, 'rejected')} />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
