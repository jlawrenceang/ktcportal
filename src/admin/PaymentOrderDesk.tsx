import { useEffect, useMemo, useState, type ReactNode } from 'react'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { peso, loadPricingConfig, type PricingConfig } from '../lib/pricing'
import Notice from '../components/Notice'
import Modal from '../components/Modal'
import { useT } from '../lib/i18n'

// Cashier payment-order desk (ADR-0037 Phase A). The anti-fraud collection point:
//   1. Record the FINAL ERP + BIR invoice on each billed charge.  ← the gate
//   2. Bundle one customer's invoiced charges into a Payment Order, then collect
//      against ONE OR number (confirm_payment_order).
//   3. Confirm a single charge for a walk-in (confirm_charge_payment).
// NOTHING is payable until invoice_state === 'final' — that gate is surfaced
// visibly because it is the core compliance + anti-fraud control: no ERP+BIR
// number on file, no confirmed money.

interface ChargeRow {
  id: string
  // A charge hangs off EITHER a job order OR a release order (XOR, migration 0214).
  job_order_id: string | null
  release_order_id: string | null
  charge_type: 'service' | 'rps' | 'addon' | 'release'
  label: string
  qty: number
  unit_rate: number | null
  amount: number
  vatable: boolean
  bill_status: string
  erp_invoice_no: string | null
  bir_invoice_no: string | null
  invoice_state: 'draft' | 'final'
  payment_status: string
  payment_order_id: string | null
  created_by: string | null
  created_at: string
  job_order?: {
    id: string
    jo_number: string | null
    consignee_id: string | null
    broker?: { id: string; full_name: string | null; customer_code: string | null } | null
    consignee?: { code: string; name: string } | null
  } | null
  // Release charges carry their parent here instead — same customer/consignee
  // shape so grouping + display work identically for both parents.
  release_order?: {
    id: string
    release_number: string | null
    consignee_id: string | null
    customer?: { id: string; full_name: string | null; customer_code: string | null } | null
    consignee?: { code: string; name: string } | null
  } | null
}

interface PoChargeRow {
  id: string
  label: string
  amount: number
  vatable: boolean
  invoice_state: string
  erp_invoice_no: string | null
  bir_invoice_no: string | null
  job_order?: { jo_number: string | null } | null
  release_order?: { release_number: string | null } | null
}

interface PoRow {
  id: string
  po_number: string | null
  customer_id: string | null
  consignee_id: string | null
  status: string
  collection_or_no: string | null
  payment_status: string | null
  created_at: string
  customer?: { full_name: string | null; customer_code: string | null } | null
  consignee?: { code: string; name: string } | null
  charges?: PoChargeRow[]
}

interface Group {
  key: string
  customerName: string
  customerCode: string | null
  consigneeId: string | null
  consigneeLabel: string
  charges: ChargeRow[]
}

const CHARGE_SELECT =
  'id, job_order_id, release_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, erp_invoice_no, bir_invoice_no, invoice_state, payment_status, payment_order_id, created_by, created_at, job_order:job_orders(id, jo_number, consignee_id, broker:customers(id, full_name, customer_code), consignee:consignees(code, name)), release_order:release_orders(id, release_number, consignee_id, customer:customers(id, full_name, customer_code), consignee:consignees(code, name))'
const PO_SELECT =
  'id, po_number, customer_id, consignee_id, status, collection_or_no, payment_status, created_at, customer:customers(full_name, customer_code), consignee:consignees(code, name), charges:charges(id, label, amount, vatable, invoice_state, erp_invoice_no, bir_invoice_no, job_order:job_orders(jo_number), release_order:release_orders(release_number))'

// The parent reference shown on a charge row — JO number, or the release number
// for a release charge (a charge hangs off either parent, migration 0214).
const parentRef = (c: { job_order?: { jo_number: string | null } | null; release_order?: { release_number: string | null } | null }) =>
  c.job_order?.jo_number ?? c.release_order?.release_number ?? '—'

const CHARGE_TYPE_LABEL: Record<string, string> = {
  service: 'X-ray service',
  rps: 'RPS move',
  addon: 'Add-on charge',
  release: 'Release charge',
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// VAT-exclusive amounts → subtotal + VAT (on the vatable portion only) + total.
function totals(items: { amount: number; vatable: boolean }[], vatRate: number) {
  let subtotal = 0
  let vatableBase = 0
  for (const it of items) {
    subtotal += it.amount
    if (it.vatable) vatableBase += it.amount
  }
  const vat = vatableBase * vatRate
  return { subtotal, vat, total: subtotal + vat }
}

type ModalState =
  | { kind: 'collect'; po: PoRow }
  | { kind: 'cancelPo'; po: PoRow }
  | { kind: 'voidCharge'; charge: ChargeRow }
  | { kind: 'rejectCharge'; charge: ChargeRow }
  | null

export default function PaymentOrderDesk({ app = false }: { app?: boolean }) {
  const { t } = useT()
  const { can, broker } = usePermissions()
  const isAdmin = !!(broker?.is_admin || broker?.is_owner)

  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [pos, setPos] = useState<PoRow[]>([])
  const [cfg, setCfg] = useState<PricingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Per-charge selection (for bundling into a payment order).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Inline ERP+BIR invoice entry — the charge id being invoiced + the two fields.
  const [invId, setInvId] = useState<string | null>(null)
  const [invErp, setInvErp] = useState('')
  const [invBir, setInvBir] = useState('')
  // Modal prompts (collect OR / cancel PO / void / reject) + their text field.
  const [modal, setModal] = useState<ModalState>(null)
  const [modalText, setModalText] = useState('')

  async function load() {
    setError(null)
    const [chargesRes, posRes, pricing] = await Promise.all([
      supabase
        .from('charges')
        .select(CHARGE_SELECT)
        .eq('bill_status', 'billed')
        .is('payment_order_id', null)
        // Release charges are settled ONLY at the release desk (release_orders path) — they
        // dual-write here toward the future cutover but must NOT be collected via the charge
        // desk, or the same release money is collectable twice (0239 enforces this server-side).
        .neq('charge_type', 'release')
        .not('payment_status', 'in', '(confirmed,reversed)')
        .order('created_at', { ascending: true }),
      supabase
        .from('payment_orders')
        .select(PO_SELECT)
        .in('status', ['open', 'submitted'])
        .order('created_at', { ascending: false }),
      loadPricingConfig(),
    ])
    if (chargesRes.error) { setLoadError(chargesRes.error.message); setLoading(false); return }
    if (posRes.error) { setLoadError(posRes.error.message); setLoading(false); return }
    setLoadError(null)
    const cRows = ((chargesRes.data ?? []) as unknown as ChargeRow[]).map((c) => {
      const jo = one(c.job_order)
      const ro = one(c.release_order)
      return {
        ...c,
        job_order: jo ? { ...jo, broker: one(jo.broker), consignee: one(jo.consignee) } : null,
        release_order: ro ? { ...ro, customer: one(ro.customer), consignee: one(ro.consignee) } : null,
      }
    })
    const pRows = ((posRes.data ?? []) as unknown as PoRow[]).map((p) => ({
      ...p,
      customer: one(p.customer),
      consignee: one(p.consignee),
      charges: (p.charges ?? []).map((ch) => ({ ...ch, job_order: one(ch.job_order), release_order: one(ch.release_order) })),
    }))
    setCharges(cRows)
    setPos(pRows)
    setCfg(pricing)
    // Drop any selections that no longer exist (got bundled / cancelled).
    setSelected((s) => {
      const live = new Set(cRows.map((c) => c.id))
      const n = new Set<string>()
      for (const id of s) if (live.has(id)) n.add(id)
      return n
    })
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const { refresh, cooling } = useAutoRefresh(load)

  const vatRate = cfg?.vatRate ?? 0.12

  // Billed charges grouped by customer + consignee (a payment order bundles one
  // consignee's charges, so the group key carries both).
  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    for (const c of charges) {
      // Parent is a job order OR a release order — read customer/consignee from
      // whichever is set so release charges group + collect like JO charges.
      const jo = c.job_order
      const ro = c.release_order
      const broker = jo?.broker ?? ro?.customer ?? null
      const consignee = jo?.consignee ?? ro?.consignee ?? null
      const customerId = broker?.id ?? 'unknown'
      const consigneeId = jo?.consignee_id ?? ro?.consignee_id ?? null
      const key = `${customerId}::${consigneeId ?? 'none'}`
      let g = m.get(key)
      if (!g) {
        g = {
          key,
          customerName: broker?.full_name ?? t('Unknown customer'),
          customerCode: broker?.customer_code ?? null,
          consigneeId,
          consigneeLabel: consignee ? `${consignee.code} · ${consignee.name}` : t('No consignee'),
          charges: [],
        }
        m.set(key, g)
      }
      g.charges.push(c)
    }
    return Array.from(m.values())
  }, [charges, t])

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function saveInvoice(id: string) {
    const erp = invErp.trim().toUpperCase()
    const bir = invBir.trim()
    if (!erp || !bir) { setError(t('Enter both the ERP control number and the BIR invoice serial.')); return }
    setBusyId(id); setError(null)
    const { error: e } = await supabase.rpc('record_charge_invoice', { p_charge: id, p_erp: erp, p_bir: bir })
    setBusyId(null)
    if (e) { setError(e.message); return }
    setInvId(null); setInvErp(''); setInvBir('')
    await load()
  }

  async function confirmCharge(id: string) {
    setBusyId(id); setError(null)
    const { error: e } = await supabase.rpc('confirm_charge_payment', { p_charge: id, p_ok: true, p_note: null })
    setBusyId(null)
    if (e) { setError(e.message); return }
    await load()
  }

  async function createPo(g: Group) {
    const ids = g.charges
      .filter((c) => selected.has(c.id) && c.invoice_state === 'final' && (c.payment_status === 'unpaid' || c.payment_status === 'rejected'))
      .map((c) => c.id)
    if (!g.consigneeId || ids.length === 0) return
    setBusyId(g.key); setError(null)
    const { error: e } = await supabase.rpc('create_payment_order', { p_consignee: g.consigneeId, p_charge_ids: ids })
    setBusyId(null)
    if (e) { setError(e.message); return }
    setSelected((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n })
    await load()
  }

  // Modal-driven actions (collect / cancel PO / void / reject).
  async function runModal() {
    if (!modal) return
    const text = modalText.trim()
    if (modal.kind === 'collect') {
      if (!text) { setError(t('Enter the collection OR number.')); return }
      setBusyId(modal.po.id); setError(null)
      const { error: e } = await supabase.rpc('confirm_payment_order', { p_po: modal.po.id, p_or_no: text.toUpperCase() })
      setBusyId(null)
      if (e) { setError(e.message); return }
    } else if (modal.kind === 'cancelPo') {
      if (!text) { setError(t('Enter a reason.')); return }
      setBusyId(modal.po.id); setError(null)
      const { error: e } = await supabase.rpc('cancel_payment_order', { p_po: modal.po.id, p_reason: text })
      setBusyId(null)
      if (e) { setError(e.message); return }
    } else if (modal.kind === 'voidCharge') {
      if (!text) { setError(t('Enter a reason.')); return }
      setBusyId(modal.charge.id); setError(null)
      const { error: e } = await supabase.rpc('cancel_charge', { p_charge: modal.charge.id, p_reason: text })
      setBusyId(null)
      if (e) { setError(e.message); return }
    } else if (modal.kind === 'rejectCharge') {
      if (!text) { setError(t('Why? (shown to the customer)')); return }
      setBusyId(modal.charge.id); setError(null)
      const { error: e } = await supabase.rpc('confirm_charge_payment', { p_charge: modal.charge.id, p_ok: false, p_note: text })
      setBusyId(null)
      if (e) { setError(e.message); return }
    }
    setModal(null); setModalText('')
    await load()
  }

  // ── small presentational helpers ──
  function PayChip({ status }: { status: string }) {
    if (status === 'submitted') return <span className="ktc-chip ktc-chip--warning">{t('Proof submitted')}</span>
    if (status === 'rejected') return <span className="ktc-chip ktc-chip--error">{t('Proof rejected')}</span>
    return <span className="ktc-chip">{t('Unpaid')}</span>
  }

  function InvoiceChip({ c }: { c: ChargeRow | PoChargeRow }) {
    if (c.invoice_state === 'final') {
      return (
        <span className="ktc-chip ktc-chip--success" title={`${t('ERP')} ${c.erp_invoice_no ?? ''} · ${t('BIR')} ${c.bir_invoice_no ?? ''}`}>
          {t('Invoiced')} · {c.erp_invoice_no}{c.bir_invoice_no ? ` · #${c.bir_invoice_no}` : ''}
        </span>
      )
    }
    return <span className="ktc-chip ktc-chip--warning">{t('Invoice required')}</span>
  }

  function Amounts({ items }: { items: { amount: number; vatable: boolean }[] }) {
    const sum = totals(items, vatRate)
    return (
      <div style={{ display: 'grid', gap: 2, justifyItems: 'end', fontSize: 12.5 }}>
        <span className="ktc-label">{t('Subtotal')}: <span className="ktc-mono">{peso(sum.subtotal)}</span></span>
        <span className="ktc-label">{t('VAT')} ({Math.round(vatRate * 100)}%): <span className="ktc-mono">{peso(sum.vat)}</span></span>
        <span className="ktc-mono" style={{ fontWeight: 700, fontSize: 14 }}>{t('Total')}: {peso(sum.total)}</span>
      </div>
    )
  }

  const Section = ({ title, sub, count, children }: { title: string; sub: string; count: number; children: ReactNode }) => (
    <div className="ktc-glass ktc-glass--flat" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>
        {title} {count > 0 && <span className="ktc-chip ktc-chip--accent" style={{ marginLeft: 6 }}>{count}</span>}
      </h2>
      <p className="ktc-label" style={{ marginTop: 3, marginBottom: count ? 14 : 0, fontSize: 12.5 }}>{sub}</p>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </div>
  )

  // One billed charge row (inside a customer/consignee group).
  function ChargeLine({ c }: { c: ChargeRow }) {
    const final = c.invoice_state === 'final'
    // Only an unpaid/rejected charge may be bundled — a 'submitted' charge is awaiting
    // the cashier's confirm/reject of the customer's proof, so bundling it would let the
    // same charge be settled twice (mirrors the create_payment_order RPC guard, 0229).
    const bundleable = final && (c.payment_status === 'unpaid' || c.payment_status === 'rejected')
    return (
      <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
            {can('review_payments') && (
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                disabled={!bundleable}
                onChange={() => toggle(c.id)}
                aria-label={t('Select charge {label} to bundle', { label: c.label })}
                title={!final ? t('Record the invoice first') : !bundleable ? t('Awaiting payment review — confirm or reject the proof first') : t('Select to bundle into a payment order')}
                style={{ marginTop: 3, width: 16, height: 16, cursor: bundleable ? 'pointer' : 'not-allowed' }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <b className="ktc-mono" style={{ fontSize: 14 }}>{parentRef(c)}</b>
                <span style={{ fontSize: 13.5 }}>{c.label}</span>
                <span className="ktc-chip ktc-chip--info">{t(CHARGE_TYPE_LABEL[c.charge_type] ?? c.charge_type)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <span className="ktc-mono" style={{ fontWeight: 700 }}>{peso(c.amount)}</span>
                {!c.vatable && <span className="ktc-label" style={{ fontSize: 11.5 }}>{t('VAT-exempt')}</span>}
                <InvoiceChip c={c} />
                <PayChip status={c.payment_status} />
              </div>
            </div>
          </div>
        </div>

        {/* The gate: ERP + BIR invoice entry. While not final, confirm/bundle stay disabled. */}
        {can('record_invoice') && !final && (
          invId === c.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <input className="ktc-input ktc-mono" value={invErp} onChange={(e) => setInvErp(e.target.value.toUpperCase())}
                aria-label={t('ERP control number')}
                placeholder={t('ERP control no. (OR-INV / BI-INV)')} autoFocus style={{ maxWidth: 215, width: '100%', padding: '7px 11px', fontSize: 13 }} />
              <input className="ktc-input ktc-mono" value={invBir} onChange={(e) => setInvBir(e.target.value)}
                aria-label={t('BIR invoice serial')}
                placeholder={t('BIR invoice serial (4-8 digits)')} inputMode="numeric" style={{ maxWidth: 190, width: '100%', padding: '7px 11px', fontSize: 13 }} />
              <button className="ktc-btn ktc-btn--sm" disabled={busyId === c.id || !invErp.trim() || !invBir.trim()} onClick={() => void saveInvoice(c.id)}>{t('Save invoice')}</button>
              <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setInvId(null); setInvErp(''); setInvBir('') }}>{t('Cancel')}</button>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <button className="ktc-btn ktc-btn--sm" disabled={busyId === c.id} onClick={() => { setInvId(c.id); setInvErp(''); setInvBir('') }}
                title={t('Record BOTH the ERP control number and the BIR invoice serial — required before any payment can be confirmed')}>
                {t('Record invoice')}
              </button>
            </div>
          )
        )}

        {/* Final invoice on file → walk-in confirm / reject available. */}
        {final && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            {can('review_payments') && (
              <>
                <button className="ktc-btn ktc-btn--sm" disabled={busyId === c.id} onClick={() => void confirmCharge(c.id)}
                  title={t('Confirm this single charge as paid (walk-in collection)')}>{t('Confirm payment')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12.5, color: 'var(--acc-2)' }} disabled={busyId === c.id}
                  onClick={() => { setModal({ kind: 'rejectCharge', charge: c }); setModalText('') }}>{t('Reject')}</button>
              </>
            )}
            {isAdmin && (
              <button type="button" className="ktc-link" style={{ fontSize: 12.5, marginLeft: 'auto' }} disabled={busyId === c.id}
                onClick={() => { setModal({ kind: 'voidCharge', charge: c }); setModalText('') }}>{t('Void charge')}</button>
            )}
          </div>
        )}
      </div>
    )
  }

  // One open payment order (collect against an OR number).
  function PoCard({ po }: { po: PoRow }) {
    const items = po.charges ?? []
    const allFinal = items.length > 0 && items.every((c) => c.invoice_state === 'final')
    return (
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <b className="ktc-mono" style={{ fontSize: 15 }}>{po.po_number ?? '—'}</b>
            <span style={{ fontSize: 13.5 }}>{po.customer?.full_name ?? t('Unknown customer')}</span>
            <span className="ktc-label" style={{ fontSize: 12.5 }}>{po.consignee ? `${po.consignee.code} · ${po.consignee.name}` : ''}</span>
          </div>
          <Amounts items={items} />
        </div>

        <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
          {items.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 10px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <b className="ktc-mono">{parentRef(c)}</b>
              <span>{c.label}</span>
              <span className="ktc-mono" style={{ fontWeight: 600 }}>{peso(c.amount)}</span>
              <span style={{ marginLeft: 'auto' }}><InvoiceChip c={c} /></span>
            </div>
          ))}
        </div>

        {!allFinal && (
          <Notice tone="warning" style={{ marginTop: 10 }}>
            {t('Every charge needs an ERP + BIR invoice on file before this collection can be confirmed.')}
          </Notice>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          {can('review_payments') && (
            <button className="ktc-btn ktc-btn--sm" disabled={busyId === po.id || !allFinal}
              onClick={() => { setModal({ kind: 'collect', po }); setModalText('') }}>{t('Collect & confirm')}</button>
          )}
          {isAdmin && (
            <button type="button" className="ktc-link" style={{ fontSize: 12.5, marginLeft: 'auto', color: 'var(--acc-2)' }} disabled={busyId === po.id}
              onClick={() => { setModal({ kind: 'cancelPo', po }); setModalText('') }}>{t('Cancel payment order')}</button>
          )}
        </div>
      </div>
    )
  }

  const modalTitle =
    modal?.kind === 'collect' ? t('Collect payment order')
      : modal?.kind === 'cancelPo' ? t('Cancel payment order')
        : modal?.kind === 'voidCharge' ? t('Void charge')
          : modal?.kind === 'rejectCharge' ? t('Reject payment')
            : ''

  return (
    <RoleShell app={app} title="Payment Orders">
      <div style={{ margin: '14px 4px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Payment Orders')}</h1>
          <p className="ktc-sub">{t('Invoice billed charges, bundle them into payment orders, and collect against the OR number.')}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      {/* The compliance gate, surfaced up front — it is the anti-fraud control. */}
      <Notice tone="info" badge={t('Compliance gate')} title={t('No invoice, no payment')} style={{ marginBottom: 14 }}>
        {t('Record the ERP control number and BIR invoice serial on each charge before it can be confirmed or bundled into a payment order. A charge only becomes payable once its invoice is final.')}
      </Notice>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>{error}</div>
      )}

      {loading ? (
        <div className="ktc-skeleton" style={{ height: 120, borderRadius: 14 }} />
      ) : loadError ? (
        <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>{loadError}</Notice>
      ) : (
        <>
          {/* 1 — Open payment orders awaiting collection */}
          <Section title={t('Payment orders to collect')} count={pos.length} sub={t('Bundled charges awaiting collection. Confirm with the one OR number for the collection.')}>
            {pos.length === 0
              ? <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No payment orders to collect.')}</span>
              : pos.map((po) => <PoCard key={po.id} po={po} />)}
          </Section>

          {/* 2 — Billed charges to invoice + bundle/collect, grouped by customer */}
          <Section title={t('Billed charges')} count={charges.length} sub={t('Record each charge’s ERP + BIR invoice, then select a customer’s charges to bundle into a payment order, or confirm a single walk-in charge.')}>
            {groups.length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 13.5 }}>{t('No billed charges waiting.')}</span>
            ) : groups.map((g) => {
              const groupSel = g.charges.filter((c) => selected.has(c.id) && c.invoice_state === 'final')
              return (
                <div key={g.key} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <b style={{ fontSize: 14.5 }}>{g.customerName}</b>
                    {g.customerCode && <span className="ktc-mono ktc-label" style={{ fontSize: 12 }}>{g.customerCode}</span>}
                    <span className="ktc-label" style={{ fontSize: 12.5 }}>· {g.consigneeLabel}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {g.charges.map((c) => <ChargeLine key={c.id} c={c} />)}
                  </div>
                  {can('review_payments') && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-brd)' }}>
                      {groupSel.length > 0 && (
                        <span className="ktc-mono" style={{ fontWeight: 700, fontSize: 13.5 }}>
                          {t('{n} selected', { n: groupSel.length })} · {peso(totals(groupSel, vatRate).total)}
                        </span>
                      )}
                      <button className="ktc-btn ktc-btn--sm" style={{ marginLeft: 'auto' }}
                        disabled={busyId === g.key || groupSel.length === 0 || !g.consigneeId}
                        title={!g.consigneeId ? t('This customer’s charges have no consignee to bill against.') : t('Bundle the selected charges into one payment order')}
                        onClick={() => void createPo(g)}>
                        {t('Create payment order')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </Section>
        </>
      )}

      <Modal open={!!modal} onClose={() => { if (!busyId) { setModal(null); setModalText('') } }} title={modalTitle}>
        {modal?.kind === 'collect' && (
          <p className="ktc-label" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            {t('Enter the official receipt (OR) number for this collection. Confirming records payment against every charge in the order.')}
          </p>
        )}
        {modal?.kind === 'voidCharge' && (
          <p className="ktc-label" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            {t('Voiding cancels this unconfirmed charge. It is recorded in the audit trail with your reason.')}
          </p>
        )}
        <input
          className={modal?.kind === 'collect' ? 'ktc-input ktc-mono' : 'ktc-input'}
          value={modalText}
          onChange={(e) => setModalText(modal?.kind === 'collect' ? e.target.value.toUpperCase() : e.target.value)}
          aria-label={
            modal?.kind === 'collect' ? t('OR number')
              : modal?.kind === 'rejectCharge' ? t('Reject reason')
                : t('Reason')
          }
          placeholder={
            modal?.kind === 'collect' ? t('OR number')
              : modal?.kind === 'rejectCharge' ? t('Why? (shown to the customer)')
                : t('Reason')
          }
          autoFocus
          style={{ width: '100%', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button className="ktc-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={!!busyId || !modalText.trim()} onClick={() => void runModal()}>
            {busyId ? t('Saving…') : modal?.kind === 'collect' ? t('Confirm collection') : modal?.kind === 'rejectCharge' ? t('Reject') : t('Confirm')}
          </button>
          <button className="ktc-btn-secondary" style={{ padding: '10px 18px' }} disabled={!!busyId} onClick={() => { setModal(null); setModalText('') }}>{t('Cancel')}</button>
        </div>
      </Modal>
    </RoleShell>
  )
}
