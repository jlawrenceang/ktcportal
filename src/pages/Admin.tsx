import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'

interface PendingBroker {
  id: string
  full_name: string | null
  email: string | null
  customer_id: string | null
  valid_id_path: string | null
  created_at: string
}

interface PendingAccreditation {
  id: string
  requested_at: string
  broker: { full_name: string | null; email: string | null; customer_id: string | null } | null
  consignee: { code: string; name: string } | null
}

// Supabase types embedded to-one relations as arrays; normalize to an object.
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function Admin() {
  const { broker, loading: brokerLoading } = useBroker()
  const [brokers, setBrokers] = useState<PendingBroker[]>([])
  const [accreditations, setAccreditations] = useState<PendingAccreditation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  async function load() {
    const [brokersRes, accsRes] = await Promise.all([
      supabase
        .from('brokers')
        .select('id, full_name, email, customer_id, valid_id_path, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('accreditations')
        .select('id, requested_at, broker:brokers(full_name, email, customer_id), consignee:consignees(code, name)')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true }),
    ])
    if (brokersRes.error || accsRes.error) {
      setError(brokersRes.error?.message ?? accsRes.error?.message ?? 'Load failed')
      setLoading(false)
      return
    }
    setBrokers((brokersRes.data ?? []) as PendingBroker[])
    setAccreditations(
      ((accsRes.data ?? []) as unknown as PendingAccreditation[]).map((r) => ({
        ...r,
        broker: one(r.broker),
        consignee: one(r.consignee),
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function decideBroker(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    setError(null)
    const { error } = await supabase
      .from('brokers')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    setBrokers((b) => b.filter((x) => x.id !== id))
  }

  async function decideAccreditation(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    setError(null)
    const { error } = await supabase
      .from('accreditations')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    setAccreditations((a) => a.filter((x) => x.id !== id))
  }

  async function viewId(path: string | null | undefined) {
    if (!path) return
    const { data, error } = await supabase.storage.from('valid-ids').createSignedUrl(path, 60)
    if (error || !data) return setError(error?.message ?? 'Could not open ID.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (!brokerLoading && !hasAdminAccess(broker)) {
    return (
      <Shell>
        <div className="ktc-glass" style={{ padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Admin</h1>
          <p className="ktc-label" style={{ marginTop: 8 }}>You don't have admin access.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {error && (
        <div className="ktc-glass" style={{ padding: 14, marginBottom: 16, color: 'var(--acc-2)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ---- Broker account approvals ---- */}
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Account approvals</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          New broker registrations awaiting account approval. Review their valid ID before approving.
        </p>
        {loading ? (
          <span className="ktc-label">Loading…</span>
        ) : brokers.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No accounts pending. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {brokers.map((b) => (
              <Row
                key={b.id}
                title={b.full_name || b.email || 'Unknown'}
                subtitle={`${b.email ?? ''}${b.customer_id ? ` · #${b.customer_id}` : ''}`}
                onViewId={b.valid_id_path ? () => viewId(b.valid_id_path) : undefined}
                busy={acting === b.id}
                onApprove={() => decideBroker(b.id, 'approved')}
                onReject={() => decideBroker(b.id, 'rejected')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Accreditation approvals ---- */}
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Accreditation approvals</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          Approving makes the consignee selectable in that broker's Job Order form.
        </p>
        {loading ? (
          <span className="ktc-label">Loading…</span>
        ) : accreditations.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No pending requests. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {accreditations.map((r) => (
              <Row
                key={r.id}
                title={r.broker?.full_name || r.broker?.email || 'Unknown broker'}
                subtitle={`requests ${r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : 'consignee'}`}
                busy={acting === r.id}
                onApprove={() => decideAccreditation(r.id, 'approved')}
                onReject={() => decideAccreditation(r.id, 'rejected')}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function Row(props: {
  title: string
  subtitle: string
  onViewId?: () => void
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.55)',
        border: '1px solid var(--glass-brd)',
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>{props.title}</b></div>
        <div className="ktc-label" style={{ fontSize: 13 }}>{props.subtitle}</div>
        {props.onViewId && (
          <button className="ktc-link" style={{ fontSize: 12, marginTop: 2 }} onClick={props.onViewId}>
            View valid ID
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={props.onApprove}
          disabled={props.busy}
          style={{
            border: 0, borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', color: '#fff',
            background: 'linear-gradient(135deg, hsl(150 55% 42%), hsl(150 60% 34%))',
          }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={props.onReject}
          disabled={props.busy}
          style={{
            border: '1px solid hsl(var(--line))', borderRadius: 10, padding: '8px 14px',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            background: 'rgba(255,255,255,0.7)', color: 'hsl(var(--ink-2))',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
