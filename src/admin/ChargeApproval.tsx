import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useT } from '../lib/i18n'
import { peso, loadPricingConfig } from '../lib/pricing'
import Notice from '../components/Notice'
import Modal from '../components/Modal'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import { one, resolveNames, shortId, type Charge, type ChargeType } from '../lib/charges'

// Admin charge tools (ADR-0037 Phase A · anti-fraud control 2 + 3).
//   • Add a charge to a JO — service / RPS price off the spine; an ADD-ON is a
//     maker-checker proposal that a DIFFERENT staffer must approve.
//   • Approve a proposed add-on (approve_charge — approver ≠ creator, server-enforced).
//   • Cancel an unconfirmed charge / reverse a confirmed one — both need a reason
//     (never a silent delete), recorded to the charge audit trail.
// Every charge shows its bill status + WHO created/approved it (accountability).

const SELECT =
  'id, job_order_id, charge_type, label, qty, unit_rate, amount, vatable, bill_status, approved_by, erp_invoice_no, bir_invoice_no, invoice_state, invoice_recorded_at, payment_status, payment_order_id, created_by, created_at, job_order:job_orders(jo_number, status, consignee:consignees(code, name))'

const orSafe = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim()

// JO picker for the add-charge form — search by JO number or entry number
// (RLS scopes admins to every order). Module-level so SearchPicker's effect is
// stable (mirrors searchConsignees in pickerSearches.ts).
async function searchJobOrders(q: string): Promise<PickerItem[]> {
  const s = orSafe(q)
  const { data } = await supabase
    .from('job_orders')
    .select('id, jo_number, entry_number, consignee:consignees(code, name)')
    .or(`jo_number.ilike.%${s}%,entry_number.ilike.%${s}%`)
    .order('created_at', { ascending: false })
    .limit(30)
  return ((data ?? []) as unknown as { id: string; jo_number: string | null; entry_number: string | null; consignee: { code: string; name: string } | { code: string; name: string }[] | null }[])
    .map((o) => ({ id: o.id, title: o.jo_number ?? o.entry_number ?? '—', sub: one(o.consignee)?.name ?? '' }))
}

type Filter = 'proposed' | 'billed' | 'closed' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'proposed', label: 'Awaiting approval' },
  { key: 'billed', label: 'Billed' },
  { key: 'closed', label: 'Cancelled / reversed' },
  { key: 'all', label: 'All' },
]

const TYPE_LABEL: Record<ChargeType, string> = { service: 'X-ray service', rps: 'RPS move', addon: 'Add-on' }

export default function ChargeApproval() {
  const { t } = useT()
  const { can, broker } = usePermissions()
  const allowed = !!broker?.is_admin || !!broker?.is_owner || can('complete_orders')

  const [charges, setCharges] = useState<Charge[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [vatRate, setVatRate] = useState(0.12)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('proposed')

  // Add-charge modal.
  const [addOpen, setAddOpen] = useState(false)
  const [jo, setJo] = useState<PickerItem | null>(null)
  const [cType, setCType] = useState<ChargeType>('addon')
  const [cLabel, setCLabel] = useState('')
  const [cQty, setCQty] = useState('1')
  const [cRate, setCRate] = useState('')
  const [cVatable, setCVatable] = useState(true)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Cancel / reverse reason modal.
  const [reasonFor, setReasonFor] = useState<{ charge: Charge; kind: 'cancel' | 'reverse' } | null>(null)
  const [reason, setReason] = useState('')
  const [reasonBusy, setReasonBusy] = useState(false)
  const [reasonError, setReasonError] = useState<string | null>(null)

  async function load(f: Filter = filter) {
    setActionError(null)
    let q = supabase.from('charges').select(SELECT)
    if (f === 'proposed') q = q.eq('bill_status', 'proposed')
    else if (f === 'billed') q = q.eq('bill_status', 'billed')
    else if (f === 'closed') q = q.or('bill_status.eq.cancelled,payment_status.eq.reversed')
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
    if (error) { setLoadError(error.message); setLoading(false); return }
    setLoadError(null)
    const rows = ((data ?? []) as unknown as Charge[]).map((c) => ({ ...c, job_order: one(c.job_order) as Charge['job_order'] }))
    setCharges(rows)
    setNames(await resolveNames(rows.flatMap((c) => [c.created_by, c.approved_by])))
    setLoading(false)
  }

  useEffect(() => {
    if (!allowed) { setLoading(false); return }
    void loadPricingConfig().then((cfg) => setVatRate(cfg.vatRate))
    void load()
  }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  const { refresh, cooling } = useAutoRefresh(() => load(), { enabled: allowed })

  function changeFilter(f: Filter) {
    setFilter(f); setLoading(true)
    void load(f)
  }

  const nameOf = (id: string | null) => (id ? names.get(id) ?? shortId(id) : '—')
  const vatOf = (c: Charge) => (c.vatable ? (c.amount ?? 0) * vatRate : 0)

  async function approve(c: Charge) {
    setBusyId(c.id); setActionError(null)
    const { error } = await supabase.rpc('approve_charge', { p_charge: c.id })
    setBusyId(null)
    if (error) { setActionError(error.message); return }
    await load()
  }

  async function submitAdd() {
    setAddError(null)
    if (!jo) { setAddError(t('Pick the job order this charge belongs to.')); return }
    if (!cLabel.trim()) { setAddError(t('Enter a label for the charge.')); return }
    const qty = Number(cQty)
    if (!(qty > 0)) { setAddError(t('Enter a quantity greater than zero.')); return }
    const rate = cType === 'addon' ? Number(cRate) : null
    if (cType === 'addon' && !(Number(cRate) > 0)) { setAddError(t('Enter the add-on rate (VAT-exclusive).')); return }
    setAddBusy(true)
    const { error } = await supabase.rpc('add_charge', {
      p_jo: jo.id, p_type: cType, p_label: cLabel.trim(), p_qty: qty, p_unit_rate: rate, p_vatable: cVatable,
    })
    setAddBusy(false)
    if (error) { setAddError(error.message); return }
    setAddOpen(false); setJo(null); setCType('addon'); setCLabel(''); setCQty('1'); setCRate(''); setCVatable(true)
    await load()
  }

  async function submitReason() {
    if (!reasonFor) return
    setReasonError(null)
    if (!reason.trim()) { setReasonError(t('A reason is required — it is recorded on the audit trail.')); return }
    setReasonBusy(true)
    const { error } = reasonFor.kind === 'cancel'
      ? await supabase.rpc('cancel_charge', { p_charge: reasonFor.charge.id, p_reason: reason.trim() })
      : await supabase.rpc('reverse_charge', { p_charge: reasonFor.charge.id, p_reason: reason.trim() })
    setReasonBusy(false)
    if (error) { setReasonError(error.message); return }
    setReasonFor(null); setReason('')
    await load()
  }

  function PaymentChip({ c }: { c: Charge }) {
    const map: Record<string, { cls: string; label: string }> = {
      unpaid: { cls: '', label: t('Unpaid') },
      submitted: { cls: 'ktc-chip--warning', label: t('Proof to review') },
      confirmed: { cls: 'ktc-chip--success', label: t('Paid') },
      rejected: { cls: 'ktc-chip--error', label: t('Proof rejected') },
      reversed: { cls: 'ktc-chip--info', label: t('Reversed') },
    }
    const s = map[c.payment_status] ?? map.unpaid
    return <span className={`ktc-chip ${s.cls}`}>{s.label}</span>
  }

  function InvoiceChip({ c }: { c: Charge }) {
    if (c.invoice_state === 'final' && c.erp_invoice_no) {
      return <span className="ktc-chip ktc-chip--success" title={`${t('ERP')} ${c.erp_invoice_no}${c.bir_invoice_no ? ` · ${t('BIR')} ${c.bir_invoice_no}` : ''}`}>{t('Final invoice')}</span>
    }
    if (c.erp_invoice_no || c.bir_invoice_no) return <span className="ktc-chip ktc-chip--warning">{t('Draft invoice')}</span>
    return <span className="ktc-chip">{t('No invoice')}</span>
  }

  function BillChip({ c }: { c: Charge }) {
    if (c.bill_status === 'proposed') return <span className="ktc-chip ktc-chip--warning">{t('Proposed · needs approval')}</span>
    if (c.bill_status === 'cancelled') return <span className="ktc-chip ktc-chip--error">{t('Cancelled')}</span>
    return <span className="ktc-chip ktc-chip--info">{t('Billed')}</span>
  }

  function ChargeCard({ c }: { c: Charge }) {
    const isBusy = busyId === c.id
    const canApprove = c.bill_status === 'proposed'
    const canCancel = c.bill_status !== 'cancelled' && c.payment_status !== 'confirmed' && c.payment_status !== 'reversed'
    const canReverse = c.payment_status === 'confirmed'
    return (
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b className="ktc-mono" style={{ fontSize: 14.5 }}>{c.job_order?.jo_number ?? '—'}</b>
          <span className="ktc-chip ktc-chip--accent">{t(TYPE_LABEL[c.charge_type])}</span>
          <BillChip c={c} />
          <PaymentChip c={c} />
          <InvoiceChip c={c} />
          <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>{new Date(c.created_at).toLocaleString()}</span>
        </div>

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 13.5 }}>
          <span style={{ fontWeight: 600 }}>{c.label}</span>
          {c.job_order?.consignee && <span className="ktc-label" style={{ fontSize: 12.5 }}>· {c.job_order.consignee.code} — {c.job_order.consignee.name}</span>}
        </div>

        {/* Money — amounts are VAT-EXCLUSIVE; show subtotal + VAT + total. */}
        <div style={{ marginTop: 10, display: 'grid', gap: 3, fontSize: 13, maxWidth: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="ktc-label">{c.qty} × {c.unit_rate != null ? peso(c.unit_rate) : t('off rate spine')}</span>
            <span className="ktc-mono">{peso(c.amount ?? 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="ktc-label">{t('VAT')} {c.vatable ? `(${(vatRate * 100).toFixed(0)}%)` : `· ${t('VAT-exempt')}`}</span>
            <span className="ktc-mono">{peso(vatOf(c))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--glass-brd)', fontWeight: 700 }}>
            <span>{t('Total')}</span>
            <span className="ktc-mono">{peso((c.amount ?? 0) + vatOf(c))}</span>
          </div>
        </div>

        {/* Accountability — who created / approved. */}
        <div style={{ marginTop: 10, fontSize: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span className="ktc-label">{t('Created by')}: <b style={{ color: 'hsl(var(--ink))' }}>{nameOf(c.created_by)}</b></span>
          <span className="ktc-label">{t('Approved by')}: <b style={{ color: 'hsl(var(--ink))' }}>{c.approved_by ? nameOf(c.approved_by) : t('— not yet')}</b></span>
        </div>

        {(canApprove || canCancel || canReverse) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {canApprove && (
              <button className="ktc-btn ktc-btn--sm" style={{ width: 'auto', padding: '8px 14px' }} disabled={isBusy}
                title={t('Maker-checker: you must be a different staffer than the creator. The server rejects self-approval.')}
                onClick={() => void approve(c)}>{t('Approve charge')}</button>
            )}
            {canReverse && (
              <button className="ktc-btn-secondary ktc-btn--sm" style={{ width: 'auto', padding: '8px 14px' }} disabled={isBusy}
                onClick={() => { setReasonFor({ charge: c, kind: 'reverse' }); setReason(''); setReasonError(null) }}>{t('Reverse (credit note)')}</button>
            )}
            {canCancel && (
              <button className="ktc-btn-secondary ktc-btn--sm" style={{ width: 'auto', padding: '8px 14px' }} disabled={isBusy}
                onClick={() => { setReasonFor({ charge: c, kind: 'cancel' }); setReason(''); setReasonError(null) }}>{t('Cancel charge')}</button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Charges & approvals')}</h1>
          <p className="ktc-sub">{t('Add charges to a job order, approve proposed add-ons (a different staffer must approve), and cancel or reverse with a recorded reason.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {allowed && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>↻ {t('Refresh')}</button>}
          {allowed && <button type="button" className="ktc-btn ktc-btn--sm" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => { setAddOpen(true); setAddError(null) }}>＋ {t('Add charge')}</button>}
        </div>
      </div>

      {!allowed ? (
        <Notice tone="error" title={t('Not authorized')}>{t('You do not have access to the charge tools.')}</Notice>
      ) : (
        <>
          {actionError && <div style={{ marginBottom: 14 }}><Notice tone="error">{actionError}</Notice></div>}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => changeFilter(f.key)}
                className={filter === f.key ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'} style={{ width: 'auto', padding: '7px 14px' }}>
                {t(f.label)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="ktc-skeleton" style={{ height: 140, borderRadius: 14 }} />
          ) : loadError ? (
            <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>{loadError}</Notice>
          ) : charges.length === 0 ? (
            <div className="ktc-label" style={{ fontSize: 14 }}>{t('No charges in this view.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {charges.map((c) => <ChargeCard key={c.id} c={c} />)}
            </div>
          )}
        </>
      )}

      {/* Add-charge modal */}
      <Modal open={addOpen} onClose={() => { if (!addBusy) setAddOpen(false) }} title={t('Add a charge')} maxWidth={460}>
        <div style={{ display: 'grid', gap: 14 }}>
          {addError && <Notice tone="error">{addError}</Notice>}
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="ch-jo">{t('Job order')} *</label>
            <SearchPicker inputId="ch-jo" placeholder={t('Search by JO number or entry number…')} selected={jo} onSelect={setJo} search={searchJobOrders} minChars={2} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="ch-type">{t('Charge type')} *</label>
            <select id="ch-type" className="ktc-input" value={cType} onChange={(e) => setCType(e.target.value as ChargeType)}>
              <option value="addon">{t('Add-on (needs approval by another staffer)')}</option>
              <option value="service">{t('X-ray service (priced off the rate spine)')}</option>
              <option value="rps">{t('RPS move (priced off the rate spine)')}</option>
            </select>
            {cType !== 'addon' && <span className="ktc-label" style={{ fontSize: 11.5 }}>{t('Service / RPS charges are priced from the rate spine — leave the rate to the server.')}</span>}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="ch-label">{t('Label')} *</label>
            <input id="ch-label" className="ktc-input" value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder={t('e.g. Re-scan fee')} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6, flex: '1 1 100px' }}>
              <label className="ktc-label" htmlFor="ch-qty">{t('Quantity')} *</label>
              <input id="ch-qty" className="ktc-input ktc-mono" inputMode="numeric" value={cQty} onChange={(e) => setCQty(e.target.value)} />
            </div>
            {cType === 'addon' && (
              <div style={{ display: 'grid', gap: 6, flex: '1 1 140px' }}>
                <label className="ktc-label" htmlFor="ch-rate">{t('Unit rate (₱, VAT-excl)')} *</label>
                <input id="ch-rate" className="ktc-input ktc-mono" inputMode="decimal" value={cRate} onChange={(e) => setCRate(e.target.value)} placeholder={t('e.g. 500')} />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={cVatable} onChange={(e) => setCVatable(e.target.checked)} />
            {t('VATable (12% VAT applies)')}
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
            <button type="button" className="ktc-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={addBusy} onClick={() => void submitAdd()}>
              {addBusy ? t('Adding…') : cType === 'addon' ? t('Propose charge') : t('Add charge')}
            </button>
            <button type="button" className="ktc-btn-secondary" style={{ width: 'auto', padding: '10px 16px' }} disabled={addBusy} onClick={() => setAddOpen(false)}>{t('Cancel')}</button>
          </div>
        </div>
      </Modal>

      {/* Cancel / reverse reason modal */}
      <Modal open={!!reasonFor} onClose={() => { if (!reasonBusy) setReasonFor(null) }}
        title={reasonFor?.kind === 'reverse' ? t('Reverse this charge?') : t('Cancel this charge?')} maxWidth={420}>
        {reasonFor && (
          <div style={{ display: 'grid', gap: 14 }}>
            {reasonError && <Notice tone="error">{reasonError}</Notice>}
            <p className="ktc-label" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
              {reasonFor.kind === 'reverse'
                ? t('A confirmed charge is reversed to a credit note — never silently deleted. The reason is recorded on the audit trail.')
                : t('This voids the unconfirmed charge {jo}. The reason is recorded on the audit trail.', { jo: reasonFor.charge.job_order?.jo_number ?? '' })}
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="ch-reason">{t('Reason')} *</label>
              <textarea id="ch-reason" className="ktc-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Why is this being cancelled / reversed?')} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="ktc-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={reasonBusy || !reason.trim()} onClick={() => void submitReason()}>
                {reasonBusy ? t('Saving…') : reasonFor.kind === 'reverse' ? t('Reverse charge') : t('Cancel charge')}
              </button>
              <button type="button" className="ktc-btn-secondary" style={{ width: 'auto', padding: '10px 16px' }} disabled={reasonBusy} onClick={() => setReasonFor(null)}>{t('Keep it')}</button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  )
}
