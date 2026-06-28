import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { idDeletable, type Broker } from '../lib/types'
import { BrokerReview } from './BrokerReview'
import { useFileViewer } from '../components/FileViewerModal'
import { useT } from '../lib/i18n'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'var(--c-h40-90-94)', fg: 'var(--c-h35-80-38)' },
  approved: { bg: 'var(--c-h150-50-93)', fg: 'var(--c-h150-60-30)' },
  rejected: { bg: 'var(--c-h0-70-95)', fg: 'var(--c-h0-65-45)' },
  suspended: { bg: 'var(--c-h28-85-93)', fg: 'var(--c-h24-80-40)' },
}

const btn = (kind: 'danger' | 'ok' | 'muted'): CSSProperties => ({
  border: kind === 'muted' ? '1px solid hsl(var(--line))' : 0,
  borderRadius: 10, padding: '7px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer',
  color: kind === 'muted' ? 'hsl(var(--ink-2))' : '#fff',
  background: kind === 'danger' ? 'linear-gradient(135deg, var(--c-h24-80-52), var(--c-h20-80-44))'
    : kind === 'ok' ? 'linear-gradient(135deg, var(--c-h150-55-42), var(--c-h150-60-34))'
    : 'var(--c-w70)',
})

export default function Brokers() {
  const { t } = useT()
  const [rows, setRows] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [suspendId, setSuspendId] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [query, setQuery] = useState('')
  const PAGE = 25
  const [visible, setVisible] = useState(PAGE)
  useEffect(() => { setVisible(PAGE) }, [query])

  async function load() {
    // External brokers only — staff/admins live under Settings.
    const { data, error } = await supabase
      .from('customers').select('*').eq('is_admin', false).eq('is_owner', false).is('staff_role', null)
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

  const { openFromStorage, viewerModal } = useFileViewer(setError)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? rows.filter((b) =>
        [b.full_name, b.email, b.customer_code, b.customer_id]
          .some((f) => (f ?? '').toLowerCase().includes(q)))
    : rows
  const shown = filtered.slice(0, visible)

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Customers')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 20 }}>
          {t('All registered customer accounts and their status. Approve/reject pending ones under Approvals; suspend or reactivate approved accounts here.')}
        </p>
        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? <span className="ktc-label">{t('Loading…')}</span> : rows.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No customer accounts yet.')}</div>
        ) : (
          <>
            <div style={{ marginBottom: 12, maxWidth: 360 }}>
              <input className="ktc-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search by name, email, or customer ID…')} aria-label={t('Search customers')} />
            </div>
            {filtered.length === 0 ? (
              <div className="ktc-label" style={{ fontSize: 14 }}>{t('No customers match your search.')}</div>
            ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {shown.map((b) => {
              const ss = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending
              return (
                <div key={b.id} style={{ display: 'grid', gap: suspendId === b.id ? 8 : 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)',
                  }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {b.customer_code && (
                          <span className="ktc-mono" style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--ink-2))' }}>{b.customer_code}</span>
                        )}
                        <Link to={`/admin/customers/${b.id}`} className="ktc-link" style={{ fontWeight: 600, color: 'inherit' }}>{b.full_name || b.email || t('Unknown')}</Link>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{t(b.status)}</span>
                      </div>
                      <div className="ktc-label" style={{ fontSize: 13 }}>
                        {b.email}{b.customer_id ? ` · #${b.customer_id}` : ''}
                        {b.valid_id_path && (<> · <button className="ktc-link" style={{ fontSize: 12 }} onClick={() => void openFromStorage('valid-ids', b.valid_id_path, t('Valid ID — {name}', { name: b.full_name || b.email || t('customer') }), {
                          // 🗑 appears only past the 24h guaranteed window
                          // (auto-purge at 3 days); the storage policy
                          // re-checks server-side either way.
                          onDeleted: idDeletable(b) ? async () => {
                            await supabase.from('customers').update({ valid_id_path: null }).eq('id', b.id)
                            await load()
                          } : undefined,
                        })}>{t('View ID')}</button></>)}
                      </div>
                      <BrokerReview b={b} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {b.status === 'approved' && (
                        <button type="button" disabled={acting === b.id} style={btn('danger')}
                          onClick={() => { setSuspendId(b.id); setSuspendReason('') }}>{t('Suspend')}</button>
                      )}
                      {b.status === 'suspended' && (
                        <button type="button" disabled={acting === b.id} style={btn('ok')}
                          onClick={() => setStatus(b.id, 'approved')}>{t('Reactivate')}</button>
                      )}
                    </div>
                  </div>
                  {suspendId === b.id && (
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-h28-85-97)', border: '1px solid var(--c-h28-70-88)', display: 'grid', gap: 8 }}>
                      <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Reason for suspension (shown to the customer)')}</label>
                      <textarea className="ktc-input" rows={2} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                        placeholder={t('e.g. Pending document re-verification.')} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" disabled={acting === b.id || !suspendReason.trim()} style={btn('danger')}
                          onClick={() => setStatus(b.id, 'suspended', suspendReason)}>{t('Confirm suspension')}</button>
                        <button type="button" disabled={acting === b.id} style={btn('muted')}
                          onClick={() => { setSuspendId(null); setSuspendReason('') }}>{t('Cancel')}</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
            )}
            {filtered.length > shown.length && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setVisible((v) => v + PAGE)}>
                  {t('Show more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {viewerModal}
    </AdminShell>
  )
}
