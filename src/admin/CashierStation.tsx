import { useEffect, useState, type ReactNode } from 'react'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePageTour } from '../components/TourProvider'
import { cashierSteps } from './AdminTour'
import { peso } from '../lib/pricing'
import type { JoSupplement } from '../lib/types'
import { useT } from '../lib/i18n'

// Cashier station — a focused desk for the money work, instead of the cluttered
// shared queue. Three queues:
//   1. Review online payment proofs (confirm / reject)   — review_payments
//   2. Collect at the window (walk-in)                   — record_office_payment
//   3. Record the ERP Service Invoice number (= paid+done) — record_invoice
// Confirming payment trips the two-gate auto-complete server-side.

interface CashOrder {
  id: string
  jo_number: string | null
  entry_number: string | null
  status: string
  payment_status: string | null
  payment_proof_path: string | null
  rps_payment_status: string | null
  rps_payment_proof_path: string | null
  rps_status: string | null
  service_invoice_no: string | null
  completed_at: string | null
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  supplements?: JoSupplement[]
}

// A supplement flattened with its parent JO's identity, for the cashier desk.
interface SuppRow extends JoSupplement { jo_number: string | null; who: string }

const SELECT = 'id, jo_number, entry_number, status, payment_status, payment_proof_path, rps_payment_status, rps_payment_proof_path, rps_status, service_invoice_no, completed_at, broker:customers(full_name), consignee:consignees(code, name), supplements:jo_supplements(id, suffix, label, amount, payment_status, payment_proof_path)'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const dangerBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#e0574a,#c5392b)', color: '#fff', border: 0, borderRadius: 10, padding: '8px 14px', fontWeight: 650, cursor: 'pointer', fontSize: 13 }

export default function CashierStation({ app = false }: { app?: boolean }) {
  const { t } = useT()
  usePageTour('cashier', cashierSteps)
  const [orders, setOrders] = useState<CashOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reject, setReject] = useState<{ id: string; kind: 'base' | 'rps' } | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [invId, setInvId] = useState<string | null>(null)
  const [invNo, setInvNo] = useState('')
  const [padNo, setPadNo] = useState('')
  const [office, setOffice] = useState<{ id: string; kind: 'base' | 'rps'; label: string } | null>(null)
  // Additional-charge (supplement) review: the supplement being rejected.
  const [suppReject, setSuppReject] = useState<string | null>(null)
  const [suppNote, setSuppNote] = useState('')

  async function load() {
    const { data, error } = await supabase.from('job_orders').select(SELECT)
      .in('status', ['submitted', 'processing', 'on_hold', 'completed'])
      .order('created_at', { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setOrders(((data ?? []) as unknown as CashOrder[]).map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) })))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const { refresh, cooling } = useAutoRefresh(load)

  async function viewProof(path: string | null) {
    if (!path) return
    const { data } = await supabase.storage.from('payment-slips').createSignedUrl(path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function doReview(id: string, confirm: boolean, kind: 'base' | 'rps', note?: string) {
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('review_payment', { p_id: id, p_confirm: confirm, p_note: note ?? null, p_kind: kind })
    setBusyId(null); setReject(null); setRejectNote('')
    if (error) { setError(error.message); return }
    await load()
  }
  async function recordOffice(id: string, kind: 'base' | 'rps') {
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('record_office_payment', { p_id: id, p_kind: kind, p_note: 'Paid at cashier office' })
    setBusyId(null); setOffice(null)
    if (error) { setError(error.message); return }
    await load()
  }
  async function saveInvoice(id: string) {
    if (!invNo.trim() || !padNo.trim()) { setError(t('Enter both the invoice control number and the pad/serial number.')); return }
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('record_service_invoice', { p_id: id, p_invoice_no: invNo.trim().toUpperCase(), p_pad_no: padNo.trim().toUpperCase() })
    setBusyId(null); setInvId(null); setInvNo(''); setPadNo('')
    if (error) { setError(error.message); return }
    await load()
  }

  async function reviewSupp(id: string, confirm: boolean, note?: string) {
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('review_supplement_payment', { p_supp: id, p_confirm: confirm, p_note: note ?? null })
    setBusyId(null); setSuppReject(null); setSuppNote('')
    if (error) { setError(error.message); return }
    await load()
  }
  async function recordSuppOffice(id: string) {
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('record_supplement_office_payment', { p_supp: id })
    setBusyId(null)
    if (error) { setError(error.message); return }
    await load()
  }

  const toReview = orders.filter((o) => o.payment_status === 'submitted' || o.rps_payment_status === 'submitted')
  const toCollect = orders.filter((o) => o.status === 'processing' && (o.payment_status === 'unpaid' || o.payment_status === 'rejected'))
  const toInvoice = orders.filter((o) => o.status === 'completed' && !o.service_invoice_no)
  // Outstanding additional charges across all orders, flattened with JO identity.
  const supps: SuppRow[] = orders.flatMap((o) =>
    (o.supplements ?? [])
      .filter((s) => s.payment_status !== 'confirmed')
      .map((s) => ({ ...s, jo_number: o.jo_number, who: o.broker?.full_name ?? t('Unknown') })))

  const who = (o: CashOrder) => `${o.broker?.full_name ?? t('Unknown')}${o.consignee ? ` · ${o.consignee.code}` : ''}`

  function Card({ o, children }: { o: CashOrder; children: ReactNode }) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b className="ktc-mono" style={{ fontSize: 15 }}>{o.jo_number ?? '—'}</b>
          <span className="ktc-label" style={{ fontSize: 12.5 }}>{who(o)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
      </div>
    )
  }

  function ReviewActions({ o, kind }: { o: CashOrder; kind: 'base' | 'rps' }) {
    const proof = kind === 'rps' ? o.rps_payment_proof_path : o.payment_proof_path
    const label = kind === 'rps' ? t('RPS payment') : t('X-ray payment')
    if (reject && reject.id === o.id && reject.kind === kind) {
      return (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="ktc-input" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
          <button style={dangerBtn} disabled={busyId === o.id || !rejectNote.trim()} onClick={() => void doReview(o.id, false, kind, rejectNote.trim())}>{t('Reject proof')}</button>
          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setReject(null); setRejectNote('') }}>{t('Cancel')}</button>
        </span>
      )
    }
    return (
      <>
        <span className="ktc-chip ktc-chip--warning">{label}</span>
        <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => void viewProof(proof)}>{t('View slip')}</button>
        <button className="ktc-btn ktc-btn--sm" disabled={busyId === o.id} onClick={() => void doReview(o.id, true, kind)}>{t('Confirm payment')}</button>
        <button style={dangerBtn} disabled={busyId === o.id} onClick={() => { setReject({ id: o.id, kind }); setRejectNote('') }}>{t('Reject')}</button>
      </>
    )
  }

  const Section = ({ title, sub, count, children }: { title: string; sub: string; count: number; children: ReactNode }) => (
    <div className="ktc-glass ktc-glass--flat" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{title} {count > 0 && <span className="ktc-chip ktc-chip--accent" style={{ marginLeft: 6 }}>{count}</span>}</h2>
      <p className="ktc-label" style={{ marginTop: 3, marginBottom: count ? 14 : 0, fontSize: 12.5 }}>{sub}</p>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </div>
  )

  return (
    <RoleShell app={app} title="Cashier">
      <div style={{ margin: '14px 4px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Cashier')}</h1>
          <p className="ktc-sub">{t('Review payments, collect at the window, and record the ERP invoice.')}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>{error}</div>
      )}

      {loading ? (
        <div className="ktc-skeleton" style={{ height: 120, borderRadius: 14 }} />
      ) : (
        <>
          {/* 1 — Online proofs to review */}
          <Section title={t('Payments to review')} count={toReview.length} sub={t('Online payment slips waiting for your confirmation.')}>
            {toReview.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('Nothing to review. 🎉')}</span> : toReview.map((o) => (
              <Card key={o.id} o={o}>
                {o.payment_status === 'submitted' && <ReviewActions o={o} kind="base" />}
                {o.rps_payment_status === 'submitted' && <ReviewActions o={o} kind="rps" />}
              </Card>
            ))}
          </Section>

          {/* 2 — Collect at the window (walk-in) */}
          <Section title={t('Collect at the window')} count={toCollect.length} sub={t('Accepted orders still unpaid. Encourage customers to pay online (upload a slip) to skip the cashier line.')}>
            {toCollect.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No walk-in collections pending.')}</span> : toCollect.map((o) => (
              <Card key={o.id} o={o}>
                <span className="ktc-chip">{o.payment_status === 'rejected' ? t('Proof rejected') : t('Unpaid')}</span>
                <button className="ktc-btn ktc-btn--sm" disabled={busyId === o.id} onClick={() => setOffice({ id: o.id, kind: 'base', label: o.jo_number ?? '—' })}>{t('Record office payment')}</button>
                {o.rps_status === 'needed' && o.rps_payment_status !== 'confirmed' && (
                  <button className="ktc-btn-secondary ktc-btn--sm" disabled={busyId === o.id} onClick={() => setOffice({ id: o.id, kind: 'rps', label: `${o.jo_number ?? '—'} · RPS` })}>{t('Record RPS office payment')}</button>
                )}
              </Card>
            ))}
          </Section>

          {/* 3 — Record the ERP invoice */}
          <Section title={t('Record invoice')} count={toInvoice.length} sub={t('Completed orders awaiting the ERP Service Invoice number.')}>
            {toInvoice.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No invoices to record.')}</span> : toInvoice.map((o) => (
              <Card key={o.id} o={o}>
                {invId === o.id ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="ktc-input" value={invNo} onChange={(e) => setInvNo(e.target.value.toUpperCase())} placeholder={t('Invoice control no.')} autoFocus style={{ maxWidth: 200, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                    <input className="ktc-input" value={padNo} onChange={(e) => setPadNo(e.target.value.toUpperCase())} placeholder={t('Pad / serial no.')} style={{ maxWidth: 170, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                    <button className="ktc-btn ktc-btn--sm" disabled={busyId === o.id} onClick={() => void saveInvoice(o.id)}>{t('Save')}</button>
                    <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setInvId(null); setInvNo(''); setPadNo('') }}>{t('Cancel')}</button>
                  </span>
                ) : (
                  <>
                    <span className="ktc-chip ktc-chip--success">{t('Completed')}</span>
                    <button className="ktc-btn ktc-btn--sm" onClick={() => { setInvId(o.id); setInvNo(''); setPadNo('') }}>{t('Record invoice')}</button>
                    <span className="ktc-label" style={{ fontSize: 11.5 }}>{t('Cash: OR-INV-… · Credit: BI-INV-…')}</span>
                  </>
                )}
              </Card>
            ))}
          </Section>

          {/* 4 — Additional charges (supplements) */}
          <Section title={t('Additional charges')} count={supps.length} sub={t('Extra charges tagged onto orders — review the customer’s proof or collect at the window. The order stays under review until it’s settled.')}>
            {supps.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No additional charges outstanding.')}</span> : supps.map((s) => (
              <div key={s.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <b className="ktc-mono" style={{ fontSize: 15 }}>{s.jo_number ?? '—'}-{s.suffix}</b>
                  <span style={{ fontSize: 13.5 }}>{s.label}</span>
                  <span className="ktc-mono" style={{ fontWeight: 700 }}>{peso(s.amount)}</span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>· {s.who}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {suppReject === s.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input className="ktc-input" value={suppNote} onChange={(e) => setSuppNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                      <button style={dangerBtn} disabled={busyId === s.id || !suppNote.trim()} onClick={() => void reviewSupp(s.id, false, suppNote.trim())}>{t('Reject proof')}</button>
                      <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setSuppReject(null); setSuppNote('') }}>{t('Cancel')}</button>
                    </span>
                  ) : s.payment_status === 'submitted' ? (
                    <>
                      <span className="ktc-chip ktc-chip--warning">{t('Proof to review')}</span>
                      <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => void viewProof(s.payment_proof_path ?? null)}>{t('View slip')}</button>
                      <button className="ktc-btn ktc-btn--sm" disabled={busyId === s.id} onClick={() => void reviewSupp(s.id, true)}>{t('Confirm payment')}</button>
                      <button style={dangerBtn} disabled={busyId === s.id} onClick={() => { setSuppReject(s.id); setSuppNote('') }}>{t('Reject')}</button>
                    </>
                  ) : (
                    <>
                      <span className="ktc-chip">{s.payment_status === 'rejected' ? t('Proof rejected') : t('Unpaid')}</span>
                      <button className="ktc-btn ktc-btn--sm" disabled={busyId === s.id} onClick={() => void recordSuppOffice(s.id)}>{t('Record office payment')}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Section>
        </>
      )}

      {office && (
        <div className="ktc-modal-backdrop" onClick={() => { if (!busyId) setOffice(null) }}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 390, padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{t('Record office payment?')}</h3>
            <p className="ktc-label" style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 16px' }}>
              {t('Mark {label} as PAID at the cashier window. This confirms payment in the system (and completes the order if every service is done).', { label: office.label })}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="ktc-btn" style={{ width: 'auto', padding: '11px 22px' }} disabled={!!busyId} onClick={() => void recordOffice(office.id, office.kind)}>{busyId ? t('Saving…') : t('✓ Yes, mark paid')}</button>
              <button className="ktc-btn-secondary" style={{ padding: '11px 18px' }} disabled={!!busyId} onClick={() => setOffice(null)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </RoleShell>
  )
}
