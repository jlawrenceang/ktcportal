import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { AdminRow } from './AdminRow'
import { BrokerReview } from './BrokerReview'

interface PendingBroker {
  id: string
  customer_code: string | null
  full_name: string | null
  email: string | null
  customer_id: string | null
  valid_id_path: string | null
  email_confirmed_at: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  privacy_consent_version: string | null
  privacy_consented_at: string | null
}

interface PendingAccreditation {
  id: string
  broker: { full_name: string | null; email: string | null } | null
  consignee: { code: string; name: string } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function ReasonBox({ reason, onChange, busy, onCancel, onConfirm }: {
  reason: string; onChange: (v: string) => void; busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'hsl(0 70% 98%)', border: '1px solid hsl(0 60% 88%)', display: 'grid', gap: 8 }}>
      <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>Reason for rejection (shown to the customer)</label>
      <textarea className="ktc-input" rows={2} value={reason} onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Valid ID unreadable — please re-upload a clear copy." />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={busy || !reason.trim()} onClick={onConfirm}
          style={{ border: 0, borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg, hsl(0 65% 52%), hsl(0 70% 44%))' }}>
          Confirm rejection
        </button>
        <button type="button" disabled={busy} onClick={onCancel}
          style={{ border: '1px solid hsl(var(--line))', borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.7)', color: 'hsl(var(--ink-2))' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function Approvals() {
  const [brokers, setBrokers] = useState<PendingBroker[]>([])
  const [accreditations, setAccreditations] = useState<PendingAccreditation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    const [b, a] = await Promise.all([
      supabase.from('customers').select('id, customer_code, full_name, email, customer_id, valid_id_path, email_confirmed_at, terms_version, terms_accepted_at, privacy_consent_version, privacy_consented_at').eq('status', 'pending').order('created_at'),
      supabase.from('accreditations').select('id, broker:customers(full_name, email), consignee:consignees(code, name)').eq('status', 'pending').order('requested_at'),
    ])
    if (b.error || a.error) { setError(b.error?.message ?? a.error?.message ?? 'Load failed'); setLoading(false); return }
    setBrokers((b.data ?? []) as PendingBroker[])
    setAccreditations(((a.data ?? []) as unknown as PendingAccreditation[]).map((r) => ({ ...r, broker: one(r.broker), consignee: one(r.consignee) })))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  function resetReject() { setRejectId(null); setRejectReason('') }

  async function decideBroker(id: string, status: 'approved' | 'rejected', reason?: string) {
    setActing(id); setError(null)
    const { error } = await supabase.from('customers').update({
      status, decided_at: new Date().toISOString(),
      decision_reason: status === 'rejected' ? (reason?.trim() || null) : null,
    }).eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    resetReject()
    setBrokers((x) => x.filter((r) => r.id !== id))
  }
  async function decideAccreditation(id: string, status: 'approved' | 'rejected', reason?: string) {
    setActing(id); setError(null)
    const { error } = await supabase.from('accreditations').update({
      status, decided_at: new Date().toISOString(),
      decision_reason: status === 'rejected' ? (reason?.trim() || null) : null,
    }).eq('id', id)
    setActing(null)
    if (error) return setError(error.message)
    resetReject()
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
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>Review the customer's valid ID and confirm they accepted the Agreement (Terms + Data Privacy consent) before approving.</p>
        {loading ? <span className="ktc-label">Loading…</span> : brokers.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No accounts pending. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {brokers.map((b) => (
              <div key={b.id} style={{ display: 'grid', gap: rejectId === b.id ? 8 : 0 }}>
                <AdminRow title={`${b.customer_code ? b.customer_code + ' · ' : ''}${b.full_name || b.email || 'Unknown'}`}
                  subtitle={`${b.email ?? ''}${b.customer_id ? ` · #${b.customer_id}` : ''}`}
                  extra={<BrokerReview b={b} />}
                  onViewId={b.valid_id_path ? () => viewId(b.valid_id_path) : undefined}
                  busy={acting === b.id} onApprove={() => decideBroker(b.id, 'approved')}
                  onReject={() => { setRejectId(b.id); setRejectReason('') }} />
                {rejectId === b.id && (
                  <ReasonBox reason={rejectReason} onChange={setRejectReason} busy={acting === b.id}
                    onCancel={resetReject} onConfirm={() => decideBroker(b.id, 'rejected', rejectReason)} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Accreditation approvals</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>Approving makes the consignee selectable in that customer's Job Order form.</p>
        {loading ? <span className="ktc-label">Loading…</span> : accreditations.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No pending requests. 🎉</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {accreditations.map((r) => (
              <div key={r.id} style={{ display: 'grid', gap: rejectId === r.id ? 8 : 0 }}>
                <AdminRow title={r.broker?.full_name || r.broker?.email || 'Unknown customer'}
                  subtitle={`requests ${r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : 'consignee'}`}
                  busy={acting === r.id} onApprove={() => decideAccreditation(r.id, 'approved')}
                  onReject={() => { setRejectId(r.id); setRejectReason('') }} />
                {rejectId === r.id && (
                  <ReasonBox reason={rejectReason} onChange={setRejectReason} busy={acting === r.id}
                    onCancel={resetReject} onConfirm={() => decideAccreditation(r.id, 'rejected', rejectReason)} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
