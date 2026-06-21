import { useEffect, useState, type CSSProperties } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePermissions } from '../lib/usePermissions'
import { useFileViewer } from '../components/FileViewerModal'
import { peso } from '../lib/pricing'
import { RELEASE_STATUS_LABEL, type ReleaseOrder } from '../lib/types'
import { useT } from '../lib/i18n'

// Release / Pull-out desks (ADR-0024). Two permission-gated sections sharing one
// queue of release_orders — an admin/owner sees both:
//   1. Documents desk (verify_release_docs): check the DO/BL, then set charges.
//   2. Cashier (review_payments): confirm the payment proof, then record the OR.
// All transitions go through SECURITY DEFINER RPCs that enforce the same gates.

// PostgREST one-to-one embeds can come back as a single object OR a 1-element
// array depending on the relationship metadata — normalize to a single value.
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const SELECT =
  'id, release_number, bl_number, doc_path, status, amount, charges_note, payment_status, payment_proof_path, payment_submitted_at, payment_note, or_number, created_at, verified_at, staff_note, consignee:consignees(code, name), broker:customers(full_name, email)'

const STATUS_STYLE: Record<string, { bg: string; ink: string }> = {
  submitted: { bg: 'var(--c-h210-60-90)', ink: 'var(--c-h210-55-36)' },
  docs_verified: { bg: 'var(--c-h265-55-91)', ink: 'var(--c-h265-45-42)' },
  payable: { bg: 'var(--c-h40-90-86)', ink: 'var(--c-h30-75-32)' },
  paid: { bg: 'var(--c-h150-50-88)', ink: 'var(--c-h150-55-26)' },
  released: { bg: 'var(--c-h150-50-88)', ink: 'var(--c-h150-55-26)' },
  on_hold: { bg: 'var(--c-h40-90-86)', ink: 'var(--c-h30-75-32)' },
  cancelled: { bg: 'var(--c-h220-12-88)', ink: 'var(--c-h220-8-40)' },
}

const btn = (variant: 'solid' | 'ghost' | 'danger'): CSSProperties => ({
  border: variant === 'ghost' ? '1px solid var(--glass-brd)' : 0,
  borderRadius: 9,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  color: variant === 'solid' ? '#fff' : variant === 'danger' ? 'var(--acc-2)' : 'hsl(var(--ink))',
  background:
    variant === 'solid' ? 'linear-gradient(135deg, var(--acc), var(--acc-2))'
    : variant === 'danger' ? 'var(--c-h0-75-96)'
    : 'var(--c-w60)',
})

export default function Releases() {
  const { t } = useT()
  const { can, loading: permLoading } = usePermissions()
  const [rows, setRows] = useState<ReleaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setError)

  // Documents desk — hold-for-correction note prompt (release id being held).
  const [holdId, setHoldId] = useState<string | null>(null)
  const [holdNote, setHoldNote] = useState('')
  // Documents desk — set-charges inputs (release id being charged).
  const [chargeId, setChargeId] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeNote, setChargeNote] = useState('')
  // Cashier — reject-payment note prompt (release id being rejected).
  const [payRejectId, setPayRejectId] = useState<string | null>(null)
  const [payNote, setPayNote] = useState('')
  // Cashier — OR-number input (release id being recorded).
  const [orId, setOrId] = useState<string | null>(null)
  const [orNo, setOrNo] = useState('')

  async function load() {
    const { data, error: err } = await supabase
      .from('release_orders')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRows(
      ((data ?? []) as unknown as ReleaseOrder[]).map((r) => ({
        ...r,
        consignee: one(r.consignee),
        broker: one(r.broker),
      })),
    )
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { refresh, cooling } = useAutoRefresh(load)

  async function verifyDocs(id: string, ok: boolean, note: string | null) {
    setBusyId(id); setError(null)
    const { error: err } = await supabase.rpc('verify_release_order', { p_id: id, p_ok: ok, p_note: note })
    setBusyId(null)
    if (err) { setError(err.message); return }
    setHoldId(null); setHoldNote('')
    await load()
  }

  async function setCharges(id: string) {
    const amount = Number(chargeAmount)
    if (!chargeAmount.trim() || Number.isNaN(amount) || amount < 0) { setError(t('Enter a valid charge amount.')); return }
    setBusyId(id); setError(null)
    const { error: err } = await supabase.rpc('set_release_charges', { p_id: id, p_amount: amount, p_note: chargeNote.trim() || null })
    setBusyId(null)
    if (err) { setError(err.message); return }
    setChargeId(null); setChargeAmount(''); setChargeNote('')
    await load()
  }

  async function confirmPayment(id: string, ok: boolean, note: string | null) {
    setBusyId(id); setError(null)
    const { error: err } = await supabase.rpc('confirm_release_payment', { p_id: id, p_ok: ok, p_note: note })
    setBusyId(null)
    if (err) { setError(err.message); return }
    setPayRejectId(null); setPayNote('')
    await load()
  }

  async function recordOr(id: string) {
    if (!orNo.trim()) { setError(t('Enter the OR number.')); return }
    setBusyId(id); setError(null)
    const { error: err } = await supabase.rpc('record_release_or', { p_id: id, p_or: orNo.trim() })
    setBusyId(null)
    if (err) { setError(err.message); return }
    setOrId(null); setOrNo('')
    await load()
  }

  const who = (r: ReleaseOrder) => r.broker?.full_name || r.broker?.email || t('Unknown customer')

  function Header({ r }: { r: ReleaseOrder }) {
    const sp = STATUS_STYLE[r.status] ?? STATUS_STYLE.cancelled
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b className="ktc-mono" style={{ fontSize: 14.5 }}>{r.release_number ?? '—'}</b>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              {t(RELEASE_STATUS_LABEL[r.status] ?? r.status)}
            </span>
            <span className="ktc-chip">{t('BL')}: <span className="ktc-mono">{r.bl_number}</span></span>
            {r.amount != null && <span className="ktc-chip ktc-chip--info ktc-mono">{peso(Number(r.amount))}</span>}
          </span>
          <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</span>
        </div>
        <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
          {who(r)}
          {' · '}{r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : t('no consignee')}
        </div>
      </>
    )
  }

  const cardStyle: CSSProperties = { padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }

  function Empty({ label }: { label: string }) {
    return <div className="ktc-label" style={{ fontSize: 14 }}>{label}</div>
  }

  const showDocs = can('verify_release_docs')
  const showCashier = can('review_payments')

  // Documents desk buckets.
  const toCheck = rows.filter((r) => r.status === 'submitted' || r.status === 'on_hold')
  const toCharge = rows.filter((r) => r.status === 'docs_verified')
  // Cashier buckets.
  const toReviewPay = rows.filter((r) => r.payment_status === 'submitted')
  const toRecordOr = rows.filter((r) => r.status === 'paid' && !r.or_number)

  if (!permLoading && !showDocs && !showCashier) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 24 }}>
          <p className="ktc-label" style={{ fontSize: 14 }}>{t('No access to the release desk.')}</p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Release / Pull-out')}</h1>
          <p className="ktc-sub">{t('Verify release documents, set charges, confirm payment, and record the OR.')}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>
          {error}
        </div>
      )}

      {/* ── Documents desk (CSR / documents) ─────────────────────────────── */}
      {showDocs && (
        <div className="ktc-glass" style={{ padding: 22, marginBottom: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 650 }}>{t('Documents desk')}</h2>
          <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Check the delivery order / bill of lading, then set the charges.')}</p>

          <h3 style={{ margin: '8px 0 10px', fontSize: 13.5, fontWeight: 650 }}>
            {t('To verify')}{!loading ? ` · ${toCheck.length}` : ''}
          </h3>
          {loading ? (
            <div style={{ display: 'grid', gap: 10 }}>{[64, 64].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)}</div>
          ) : toCheck.length === 0 ? (
            <Empty label={t('Nothing waiting for a document check.')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {toCheck.map((r) => {
                const isBusy = busyId === r.id
                return (
                  <div key={r.id} style={cardStyle}>
                    <Header r={r} />
                    {r.staff_note && r.status === 'on_hold' && (
                      <div style={{ marginTop: 10, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-h40-90-96)', border: '1px solid var(--c-h35-85-84)', color: 'var(--c-h30-60-32)' }}>
                        <b>{t('Note to customer:')}</b> {r.staff_note}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button style={btn('ghost')} disabled={!r.doc_path}
                        onClick={() => void openFromStorage('release-docs', r.doc_path, `${t('DO / BL')} — ${r.release_number ?? r.bl_number} (${who(r)})`)}>
                        {t('View DO/BL')}
                      </button>
                      <button style={btn('solid')} disabled={isBusy} onClick={() => void verifyDocs(r.id, true, null)}>{t('Verify')}</button>
                      {holdId === r.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input" value={holdNote} onChange={(e) => setHoldNote(e.target.value)} autoFocus
                            placeholder={t('What needs correcting? (shown to the customer)')} style={{ maxWidth: 260, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('danger')} disabled={isBusy || !holdNote.trim()} onClick={() => void verifyDocs(r.id, false, holdNote.trim())}>{t('Put on hold')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setHoldId(null); setHoldNote('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <button style={btn('ghost')} disabled={isBusy} onClick={() => { setHoldId(r.id); setHoldNote('') }}>{t('Hold for a corrected doc')}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <h3 style={{ margin: '20px 0 10px', fontSize: 13.5, fontWeight: 650 }}>
            {t('Set charges')}{!loading ? ` · ${toCharge.length}` : ''}
          </h3>
          {loading ? (
            <div className="ktc-skeleton" style={{ height: 64, borderRadius: 12 }} />
          ) : toCharge.length === 0 ? (
            <Empty label={t('No verified releases waiting for charges.')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {toCharge.map((r) => {
                const isBusy = busyId === r.id
                return (
                  <div key={r.id} style={cardStyle}>
                    <Header r={r} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button style={btn('ghost')} disabled={!r.doc_path}
                        onClick={() => void openFromStorage('release-docs', r.doc_path, `${t('DO / BL')} — ${r.release_number ?? r.bl_number} (${who(r)})`)}>
                        {t('View DO/BL')}
                      </button>
                      {chargeId === r.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input ktc-mono" value={chargeAmount} inputMode="decimal" autoFocus placeholder={t('Amount (₱)')}
                            onChange={(e) => setChargeAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ maxWidth: 150, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <input className="ktc-input" value={chargeNote} placeholder={t('Note (optional)')}
                            onChange={(e) => setChargeNote(e.target.value)} style={{ maxWidth: 220, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('solid')} disabled={isBusy || !chargeAmount.trim()} onClick={() => void setCharges(r.id)}>{t('Set charges')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setChargeId(null); setChargeAmount(''); setChargeNote('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <button style={btn('solid')} disabled={isBusy} onClick={() => { setChargeId(r.id); setChargeAmount(''); setChargeNote('') }}>{t('Set charges')}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Cashier ──────────────────────────────────────────────────────── */}
      {showCashier && (
        <div className="ktc-glass" style={{ padding: 22 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 650 }}>{t('Cashier')}</h2>
          <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Confirm payment proofs, then record the OR to release the shipment.')}</p>

          <h3 style={{ margin: '8px 0 10px', fontSize: 13.5, fontWeight: 650 }}>
            {t('Payments to review')}{!loading ? ` · ${toReviewPay.length}` : ''}
          </h3>
          {loading ? (
            <div style={{ display: 'grid', gap: 10 }}>{[64, 64].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)}</div>
          ) : toReviewPay.length === 0 ? (
            <Empty label={t('No payment proofs waiting for review.')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {toReviewPay.map((r) => {
                const isBusy = busyId === r.id
                return (
                  <div key={r.id} style={cardStyle}>
                    <Header r={r} />
                    {r.payment_submitted_at && (
                      <div className="ktc-label" style={{ fontSize: 12, marginTop: 4 }}>
                        {t('Proof submitted {date}', { date: new Date(r.payment_submitted_at).toLocaleString() })}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button style={btn('ghost')} disabled={!r.payment_proof_path}
                        onClick={() => void openFromStorage('payment-slips', r.payment_proof_path, `${t('Release payment slip')} — ${r.release_number ?? r.bl_number} (${who(r)})`)}>
                        {t('View payment proof')}
                      </button>
                      {payRejectId === r.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} autoFocus
                            placeholder={t('Why? (shown to the customer)')} style={{ maxWidth: 260, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void confirmPayment(r.id, false, payNote.trim())}>{t('Reject proof')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayRejectId(null); setPayNote('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <>
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void confirmPayment(r.id, true, null)}>{t('Confirm payment')}</button>
                          <button style={btn('danger')} disabled={isBusy} onClick={() => { setPayRejectId(r.id); setPayNote('') }}>{t('Reject')}</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <h3 style={{ margin: '20px 0 10px', fontSize: 13.5, fontWeight: 650 }}>
            {t('Record OR')}{!loading ? ` · ${toRecordOr.length}` : ''}
          </h3>
          {loading ? (
            <div className="ktc-skeleton" style={{ height: 64, borderRadius: 12 }} />
          ) : toRecordOr.length === 0 ? (
            <Empty label={t('No paid releases waiting for an OR number.')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {toRecordOr.map((r) => {
                const isBusy = busyId === r.id
                return (
                  <div key={r.id} style={cardStyle}>
                    <Header r={r} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      {orId === r.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input ktc-mono" value={orNo} onChange={(e) => setOrNo(e.target.value)} autoFocus
                            placeholder={t('OR number')} style={{ maxWidth: 200, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('solid')} disabled={isBusy || !orNo.trim()} onClick={() => void recordOr(r.id)}>{t('Record OR')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setOrId(null); setOrNo('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <button style={btn('solid')} disabled={isBusy} onClick={() => { setOrId(r.id); setOrNo('') }}
                          title={t('Records the official receipt number and releases the shipment')}>
                          {t('Record OR')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {viewerModal}
    </AdminShell>
  )
}
