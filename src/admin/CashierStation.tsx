import { useEffect, useState, type ReactNode } from 'react'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePageTour } from '../components/TourProvider'
import { cashierSteps } from './AdminTour'
import { peso, loadPricingConfig, computeBreakdown, type PricingConfig, type Breakdown } from '../lib/pricing'
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
  is_rexray?: boolean
  rexray_billable?: boolean
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: { service_request: string }[]
  supplements?: JoSupplement[]
}

// A supplement flattened with its parent JO's identity, for the cashier desk.
interface SuppRow extends JoSupplement { jo_number: string | null; who: string }

const SELECT = 'id, jo_number, entry_number, status, payment_status, payment_proof_path, rps_payment_status, rps_payment_proof_path, rps_status, service_invoice_no, completed_at, is_rexray, rexray_billable, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(service_request), supplements:jo_supplements(id, suffix, label, amount, bill_status, payment_status, payment_proof_path)'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const dangerBtn: React.CSSProperties = { background: 'linear-gradient(135deg,#e0574a,#c5392b)', color: '#fff', border: 0, borderRadius: 10, padding: '8px 14px', fontWeight: 650, cursor: 'pointer', fontSize: 13 }

export default function CashierStation({ app = false }: { app?: boolean }) {
  const { t } = useT()
  usePageTour('cashier', cashierSteps)
  const [orders, setOrders] = useState<CashOrder[]>([])
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  // RPS moves keyed by job_order_id (move_type → qty) — feeds the RPS portion of the balance.
  const [moves, setMoves] = useState<Map<string, Map<string, number>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Per-supplement amount entry for the "Charges to bill" bucket (keyed by supplement id).
  const [billAmt, setBillAmt] = useState<Record<string, string>>({})
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
    const [{ data, error }, pricing] = await Promise.all([
      supabase.from('job_orders').select(SELECT)
        .in('status', ['submitted', 'processing', 'on_hold', 'completed'])
        .order('created_at', { ascending: true }),
      loadPricingConfig(),
    ])
    if (error) { setError(error.message); setLoading(false); return }
    const rows = ((data ?? []) as unknown as CashOrder[]).map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) }))
    setOrders(rows)
    setCfg(pricing)
    // Fetch RPS moves only for orders that were assessed an RPS charge → per-order move map,
    // so the cashier sees the same RPS amount the customer's Payment page shows.
    const rpsIds = rows.filter((o) => o.rps_status === 'needed').map((o) => o.id)
    if (rpsIds.length) {
      const { data: rm } = await supabase.from('rps_moves').select('job_order_id, move_type, qty').in('job_order_id', rpsIds)
      const m = new Map<string, Map<string, number>>()
      for (const r of (rm ?? []) as { job_order_id: string; move_type: string; qty: number }[]) {
        const inner = m.get(r.job_order_id) ?? new Map<string, number>()
        inner.set(r.move_type, (inner.get(r.move_type) ?? 0) + r.qty)
        m.set(r.job_order_id, inner)
      }
      setMoves(m)
    } else {
      setMoves(new Map())
    }
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
  // Bill an ops-requested charge (NULL amount): set the amount → it becomes a payable.
  async function billSupp(id: string) {
    const amount = Number(billAmt[id])
    if (!(amount > 0)) { setError(t('Enter an amount greater than zero.')); return }
    setBusyId(id); setError(null)
    const { error } = await supabase.rpc('bill_supplement', { p_id: id, p_amount: amount })
    setBusyId(null)
    if (error) { setError(error.message); return }
    setBillAmt((m) => { const n = { ...m }; delete n[id]; return n })
    await load()
  }

  // Per-order money breakdown — the SAME helper the customer Payment page uses, so the
  // cashier confirms against the exact amount shown elsewhere (no parallel calculation).
  function bd(o: CashOrder): Breakdown | null {
    return cfg ? computeBreakdown(o, cfg, moves.get(o.id)) : null
  }

  const toReview = orders.filter((o) => o.payment_status === 'submitted' || o.rps_payment_status === 'submitted')
  const toCollect = orders.filter((o) => o.status === 'processing' && (o.payment_status === 'unpaid' || o.payment_status === 'rejected'))
  // RPS collection is independent of base-payment state: an order assessed an RPS charge AFTER
  // its X-ray payment was already confirmed must still be settleable at the window (T1-05).
  const toCollectRps = orders.filter((o) => o.rps_status === 'needed' && o.rps_payment_status !== 'confirmed' && o.rps_payment_status !== 'submitted')
  // Record the ERP invoice on a completed order, OR on a live order whose base proof is
  // awaiting review, OR on a live unpaid/rejected walk-in — since 0177 the invoice must be
  // on file BEFORE the base payment can be confirmed/collected, so the cashier needs to
  // record it here (record_service_invoice accepts any live order, 0177) without leaving.
  const toInvoice = orders.filter((o) => !o.service_invoice_no && (
    o.status === 'completed' ||
    o.payment_status === 'submitted' ||
    (o.status === 'processing' && (o.payment_status === 'unpaid' || o.payment_status === 'rejected'))
  ))
  // Ops-requested charges awaiting the cashier to set an amount (NULL amount, bill_status=requested).
  const toBill: SuppRow[] = orders.flatMap((o) =>
    (o.supplements ?? [])
      .filter((s) => s.bill_status === 'requested')
      .map((s) => ({ ...s, jo_number: o.jo_number, who: o.broker?.full_name ?? t('Unknown') })))
  // Outstanding additional charges across all orders, flattened with JO identity.
  const supps: SuppRow[] = orders.flatMap((o) =>
    (o.supplements ?? [])
      .filter((s) => s.amount > 0 && s.payment_status !== 'confirmed')
      .map((s) => ({ ...s, jo_number: o.jo_number, who: o.broker?.full_name ?? t('Unknown') })))

  const who = (o: CashOrder) => `${o.broker?.full_name ?? t('Unknown')}${o.consignee ? ` · ${o.consignee.code}` : ''}`

  // Amount to collect/verify for one card — the base X-ray or the RPS portion, from the
  // shared breakdown. Flags incomplete rates so the cashier doesn't trust a misleading ₱0.
  function Money({ o, kind }: { o: CashOrder; kind: 'base' | 'rps' }) {
    const b = bd(o)
    if (!b) return null
    const amount = kind === 'rps' ? b.rpsAmount : b.baseTotal
    return (
      <span className="ktc-mono" style={{ fontWeight: 700, fontSize: 14 }}>
        {peso(amount)}
        {b.hasMissingRates && <span className="ktc-label" style={{ fontWeight: 500, fontSize: 11, marginLeft: 5 }}>{t('· rates incomplete')}</span>}
      </span>
    )
  }

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
        <Money o={o} kind={kind} />
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
            {toReview.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('Nothing to review.')}</span> : toReview.map((o) => (
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
                <Money o={o} kind="base" />
                <button className="ktc-btn ktc-btn--sm" disabled={busyId === o.id} onClick={() => setOffice({ id: o.id, kind: 'base', label: o.jo_number ?? '—' })}>{t('Record office payment')}</button>
              </Card>
            ))}
          </Section>

          {/* 2b — Collect RPS at the window (independent of base payment) */}
          <Section title={t('Collect RPS at the window')} count={toCollectRps.length} sub={t('Orders assessed an RPS charge that is still due — collectable here even after the X-ray payment is already settled.')}>
            {toCollectRps.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No RPS collections pending.')}</span> : toCollectRps.map((o) => (
              <Card key={o.id} o={o}>
                <span className="ktc-chip ktc-chip--warning">{o.rps_payment_status === 'rejected' ? t('RPS proof rejected') : t('RPS unpaid')}</span>
                <Money o={o} kind="rps" />
                <button className="ktc-btn ktc-btn--sm" disabled={busyId === o.id} onClick={() => setOffice({ id: o.id, kind: 'rps', label: `${o.jo_number ?? '—'} · RPS` })}>{t('Record RPS office payment')}</button>
              </Card>
            ))}
          </Section>

          {/* 3 — Record the ERP invoice */}
          <Section title={t('Record invoice')} count={toInvoice.length} sub={t('Orders awaiting the ERP Service Invoice number — record it to release the order, and so a walk-in payment can then be collected.')}>
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
                    <span className={`ktc-chip ${o.status === 'completed' ? 'ktc-chip--success' : 'ktc-chip--warning'}`}>
                      {o.status === 'completed' ? t('Completed') : o.payment_status === 'submitted' ? t('Proof submitted') : t('Walk-in · unpaid')}
                    </span>
                    <Money o={o} kind="base" />
                    <button className="ktc-btn ktc-btn--sm" onClick={() => { setInvId(o.id); setInvNo(''); setPadNo('') }}>{t('Record invoice')}</button>
                    <span className="ktc-label" style={{ fontSize: 11.5 }}>{t('Cash: OR-INV-… · Credit: BI-INV-…')}</span>
                  </>
                )}
              </Card>
            ))}
          </Section>

          {/* 3b — Ops-requested charges awaiting a price (bill_supplement) */}
          <Section title={t('Charges to bill')} count={toBill.length} sub={t('Charges operations requested — set the amount to bill the customer, then it becomes payable.')}>
            {toBill.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No charges waiting to be billed.')}</span> : toBill.map((s) => (
              <div key={s.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <b className="ktc-mono" style={{ fontSize: 15 }}>{s.jo_number ?? '—'}-{s.suffix}</b>
                  <span style={{ fontSize: 13.5 }}>{s.label}</span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>· {s.who}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="ktc-input ktc-mono" inputMode="decimal" value={billAmt[s.id] ?? ''} onChange={(e) => setBillAmt((m) => ({ ...m, [s.id]: e.target.value }))} placeholder={t('Amount (₱)')} style={{ maxWidth: 150, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                  <button className="ktc-btn ktc-btn--sm" disabled={busyId === s.id || !(Number(billAmt[s.id]) > 0)} onClick={() => void billSupp(s.id)}>{t('Bill')}</button>
                </div>
              </div>
            ))}
          </Section>

          {/* 4 — Additional charges (supplements) */}
          <Section title={t('Additional charges')} count={supps.length} sub={t('Extra charges tagged onto orders — review the customer’s proof or collect at the window. The order stays under review until it’s settled.')}>
            {supps.length === 0 ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No additional charges outstanding.')}</span> : supps.map((s) => (
              <div key={s.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <b className="ktc-mono" style={{ fontSize: 15 }}>{s.jo_number ?? '—'}-{s.suffix}</b>
                  <span style={{ fontSize: 13.5 }}>{s.label}</span>
                  <span className="ktc-mono" style={{ fontWeight: 700 }}>{s.amount > 0 ? peso(s.amount) : '—'}</span>
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
