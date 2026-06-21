import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useFileViewer } from '../components/FileViewerModal'
import JoTimeline from '../components/JoTimeline'
import { SERVICE_LINE_LABEL, serviceLineOf, hasOutstandingSupplements, type JobOrder, type ServiceLine, type ServingNumber } from '../lib/types'
import { isCreditInvoice } from '../lib/eventLabels'
import { usePageTour } from '../components/TourProvider'
import { operationsSteps } from './AdminTour'
import { peso } from '../lib/pricing'
import { useT } from '../lib/i18n'
import { ArchiveIcon, PencilIcon, ClockIcon, ChatIcon } from '../components/icons'
import ReleaseTracks from '../components/ReleaseTracks'

interface AdminJobOrder extends JobOrder {
  broker?: { full_name: string | null; email: string | null; contact_number: string | null } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  processing: 'Approved · processing',
  on_hold: 'On hold · info needed',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}
const STATUS_STYLE: Record<string, { bg: string; ink: string }> = {
  submitted: { bg: 'var(--c-h210-60-90)', ink: 'var(--c-h210-55-36)' },
  processing: { bg: 'var(--c-h265-55-91)', ink: 'var(--c-h265-45-42)' },
  on_hold: { bg: 'var(--c-h40-90-86)', ink: 'var(--c-h30-75-32)' },
  completed: { bg: 'var(--c-h150-50-88)', ink: 'var(--c-h150-55-26)' },
  rejected: { bg: 'var(--c-h0-75-92)', ink: 'var(--c-h0-65-42)' },
  cancelled: { bg: 'var(--c-h220-12-88)', ink: 'var(--c-h220-8-40)' },
}

const SELECT =
  'id, jo_number, entry_number, consignee_id, vessel_name, voyage_number, vessel_visit, status, admin_note, customer_note, rejected_recoverable, xray_performed_at, service_invoice_no, invoice_pad_no, payment_status, payment_proof_path, payment_submitted_at, rps_status, rps_payment_status, rps_payment_proof_path, rps_payment_submitted_at, completed_at, archived_at, created_at, last_customer_edit_at, broker:customers(full_name, email, contact_number), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), serving:serving_numbers(service_line, serving_no, week_start, vacated_at), completions:service_completions(service_line, completed_at), supplements:jo_supplements(id, suffix, label, amount, payment_status, payment_proof_path, payment_submitted_at, payment_note, created_at)'

// Lines this order needs, with their per-service completion state (G1).
function serviceProgress(o: JobOrder): { line: ServiceLine; done: boolean }[] {
  const needed = new Set<ServiceLine>((o.lines ?? []).map((l) => serviceLineOf(l.service_request)))
  const done = new Set((o.completions ?? []).map((c) => c.service_line))
  return Array.from(needed).map((line) => ({ line, done: done.has(line) }))
}

const PAGE = 20

// Queue views (G4/G5): server-side filters + pagination. 'unpaid' is the EOD
// audit — completed but no Service Invoice on file, with aging.
type Filter = 'open' | 'unpaid' | 'completed' | 'closed' | 'archived' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'unpaid', label: 'Unpaid · completed' },
  { key: 'completed', label: 'Completed' },
  { key: 'closed', label: 'Rejected / cancelled' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const agingDays = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000) : null

// A resubmitted order went to the back of the line; the admin can restore its
// original (lower, same-week) number. Returns the restorable options.
function restorable(o: JobOrder): { line: ServingNumber['service_line']; no: number }[] {
  const out: { line: ServingNumber['service_line']; no: number }[] = []
  if (!['submitted', 'processing', 'on_hold'].includes(o.status)) return out
  const byLine = new Map<string, ServingNumber[]>()
  for (const s of o.serving ?? []) {
    if (!byLine.has(s.service_line)) byLine.set(s.service_line, [])
    byLine.get(s.service_line)!.push(s)
  }
  for (const [line, rows] of byLine) {
    const active = rows.find((r) => !r.vacated_at)
    const week = active?.week_start
    const oldBest = rows
      .filter((r) => r.vacated_at && (!week || r.week_start === week))
      .sort((a, b) => a.serving_no - b.serving_no)[0]
    if (oldBest && active && oldBest.serving_no < active.serving_no) {
      out.push({ line: line as ServingNumber['service_line'], no: oldBest.serving_no })
    }
  }
  return out
}

// Plain-text status message for chat apps (Viber / SMS / Messenger). Composed
// per order; staff send it from their own device via the share buttons.
function chatMessage(o: AdminJobOrder): string {
  const name = (o.broker?.full_name || '').split(' ')[0] || 'there'
  const jo = o.jo_number ?? 'your job order'
  const status = STATUS_LABEL[o.status] ?? o.status
  const lines = [
    `Hi ${name}! This is KTC Container Terminal regarding job order ${jo}.`,
    `Status: ${status}.`,
  ]
  if (o.admin_note && (o.status === 'on_hold' || o.status === 'rejected')) lines.push(`Note from KTC: ${o.admin_note}`)
  if (o.status === 'on_hold') lines.push('Please open the portal to update the order and resubmit it.')
  if (o.status === 'rejected' && o.rejected_recoverable !== false) lines.push('You can fix and resubmit the same order from the portal.')
  if (o.status === 'completed') lines.push('Your order is complete — you can print the slip from the portal.')
  lines.push('Track it here: https://portal.ktcterminal.com/job-orders')
  lines.push('Thank you!')
  return lines.join('\n')
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
  background: variant === 'solid' ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : variant === 'danger' ? 'var(--c-h0-75-96)' : 'var(--c-w60)',
})

export default function AllJobOrders({ app = false }: { app?: boolean }) {
  const { t } = useT()
  usePageTour('operations', operationsSteps)
  const { can } = usePermissions()
  const [orders, setOrders] = useState<AdminJobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // ERP Service Invoice recording (cashier): JO id being recorded + the number.
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [invoiceNo, setInvoiceNo] = useState('')   // ERP control no. (OR-INV-… / BI-INV-…)
  const [invoicePad, setInvoicePad] = useState('') // printed OR / Billing Invoice pad serial
  // Note prompt for hold / reject (the note is shown to the customer).
  const [modal, setModal] = useState<{ id: string; jo: string; target: 'on_hold' | 'rejected' } | null>(null)
  const [note, setNote] = useState('')
  const [recoverable, setRecoverable] = useState(true) // reject: allow fix & resubmit
  // Chat status-message generator (Viber / SMS / copy-paste).
  const [msgOrder, setMsgOrder] = useState<AdminJobOrder | null>(null)
  const [copied, setCopied] = useState(false)
  // Payment-proof review (permission: review_payments).
  const [payReject, setPayReject] = useState<AdminJobOrder | null>(null)
  const [payRejectKind, setPayRejectKind] = useState<'base' | 'rps'>('base')
  const [payNote, setPayNote] = useState('')
  const { openFromStorage, viewerModal } = useFileViewer((m) => alert(m))
  const [filter, setFilter] = useState<Filter>('open')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [archiving, setArchiving] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null)
  // Timeline (events + docs + comments) expander — the JO whose timeline is open.
  const [historyId, setHistoryId] = useState<string | null>(null)
  // Add-charge (supplement) prompt — the JO being charged + the new line.
  const [charge, setCharge] = useState<{ id: string; jo: string } | null>(null)
  const [chargeLabel, setChargeLabel] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  // Staff edit of the operational header (entry / vessel / voyage).
  const [editId, setEditId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState({ entry: '', vessel: '', voyage: '' })

  function load(f: Filter = filter, p: number = page) {
    let q = supabase
      .from('job_orders')
      .select(SELECT, { count: 'exact' })
      .neq('status', 'held') // held = not-yet-verified customers; kept out of the queue
    if (f === 'open') q = q.in('status', ['submitted', 'processing', 'on_hold']).is('archived_at', null)
    else if (f === 'unpaid') q = q.eq('status', 'completed').is('service_invoice_no', null).is('archived_at', null)
    else if (f === 'completed') q = q.eq('status', 'completed').is('archived_at', null)
    else if (f === 'closed') q = q.in('status', ['rejected', 'cancelled']).is('archived_at', null)
    else if (f === 'archived') q = q.not('archived_at', 'is', null)
    return q
      .order('created_at', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1)
      .then(({ data, count }) => {
        const rows = ((data ?? []) as unknown as AdminJobOrder[]).map((o) => ({
          ...o,
          broker: one(o.broker),
          consignee: one(o.consignee),
        }))
        setOrders(rows)
        setTotal(count ?? 0)
        setLoading(false)
      })
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(f: Filter) {
    setFilter(f); setPage(0); setLoading(true); setArchiveMsg(null)
    void load(f, 0)
  }
  function changePage(p: number) {
    setPage(p); setLoading(true)
    void load(filter, p)
  }

  async function archiveDone() {
    setArchiving(true); setArchiveMsg(null)
    const { data, error } = await supabase.rpc('archive_done_orders')
    setArchiving(false)
    if (error) { setArchiveMsg(error.message); return }
    setArchiveMsg(t('✓ Archived {n} paid & completed order(s).', { n: data ?? 0 }))
    await load()
  }

  async function apply(id: string, status: string, adminNote?: string | null, rejectedRecoverable?: boolean) {
    setBusyId(id)
    // Permission-checked, stage-gated transition (0086). Completion is two-gated
    // (all services done + payment confirmed) server-side.
    const { error } = await supabase.rpc('staff_transition_order', {
      p_id: id, p_status: status, p_note: adminNote ?? null, p_recoverable: rejectedRecoverable ?? null,
    })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }

  function openNote(o: AdminJobOrder, target: 'on_hold' | 'rejected') {
    setModal({ id: o.id, jo: o.jo_number ?? '—', target })
    setNote(o.admin_note ?? '')
    setRecoverable(true)
  }

  async function confirmNote() {
    if (!modal) return
    if (!note.trim()) { alert(t('Please add a note for the customer.')); return }
    const id = modal.id, target = modal.target
    setModal(null)
    await apply(id, target, note.trim(), target === 'rejected' ? recoverable : undefined)
    setNote('')
  }

  function toggleHistory(id: string) {
    setHistoryId(historyId === id ? null : id)
  }

  async function markServiceDone(id: string, line: ServiceLine) {
    setBusyId(id)
    const { error } = await supabase.rpc('record_service_done', { p_id: id, p_line: line })
    setBusyId(null)
    if (error) { alert(error.message); return }
    await load()
  }

  async function restoreNumber(id: string, line: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('restore_serving_number', { p_jo: id, p_line: line })
    setBusyId(null)
    if (error) { alert(error.message); return }
    await load()
  }

  async function reviewPayment(id: string, confirm: boolean, note?: string, kind: 'base' | 'rps' = 'base') {
    setBusyId(id)
    const { error } = await supabase.rpc('review_payment', { p_id: id, p_confirm: confirm, p_note: note ?? null, p_kind: kind })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setPayReject(null); setPayNote('')
    await load()
  }

  async function recordInvoice() {
    if (!invoiceId || !invoiceNo.trim() || !invoicePad.trim()) return
    setBusyId(invoiceId)
    const { error } = await supabase.rpc('record_service_invoice', {
      p_id: invoiceId, p_invoice_no: invoiceNo.trim(), p_pad_no: invoicePad.trim(),
    })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setInvoiceId(null); setInvoiceNo(''); setInvoicePad('')
    await load()
  }

  async function addCharge() {
    if (!charge || !chargeLabel.trim()) return
    setBusyId(charge.id)
    const { error } = await supabase.rpc('add_supplement', {
      p_jo: charge.id, p_label: chargeLabel.trim(), p_amount: Number(chargeAmount) || 0,
    })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setCharge(null); setChargeLabel(''); setChargeAmount('')
    await load()
  }

  function openEdit(o: AdminJobOrder) {
    setEditId(o.id)
    setEditFields({ entry: o.entry_number ?? '', vessel: o.vessel_name ?? '', voyage: o.voyage_number ?? '' })
  }
  async function saveEdit() {
    if (!editId) return
    setBusyId(editId)
    const { error } = await supabase.rpc('staff_edit_job_order', {
      p_id: editId,
      p_entry: editFields.entry.trim() || null,
      p_vessel_name: editFields.vessel.trim() || null,
      p_voyage: editFields.voyage.trim() || null,
    })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setEditId(null)
    await load()
  }

  async function copyMessage() {
    if (!msgOrder) return
    try {
      await navigator.clipboard.writeText(chatMessage(msgOrder))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard unavailable — text is selectable in the box */ }
  }

  return (
    <RoleShell app={app} title="Job Orders">
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Job Orders')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Review and process job orders from verified customers.')}</p>

        {/* Views + archive */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ktc-nav-link${filter === f.key ? ' is-active' : ''}`}
              onClick={() => changeFilter(f.key)}
            >
              {t(f.label)}
            </button>
          ))}
          {can('process_job_orders') && (filter === 'completed' || filter === 'all') && (
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={archiving}
              title={t('Archives every completed order that has a Service Invoice number (= paid). Also runs automatically every Monday.')}
              onClick={() => void archiveDone()}>
              {archiving ? t('Archiving…') : <><ArchiveIcon size={15} /> {t('Archive paid & completed')}</>}
            </button>
          )}
        </div>
        {archiveMsg && <p className="ktc-label" style={{ fontSize: 13, fontWeight: 600, marginTop: -8, marginBottom: 14 }}>{archiveMsg}</p>}

        {loading ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {[72, 72, 72].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 14 }} />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>
            {filter === 'unpaid' ? t('Nothing waiting for payment — every completed order has an invoice.') : t('No job orders in this view.')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => {
              const sp = STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled
              const printable = o.status === 'processing' || o.status === 'completed'
              const isBusy = busyId === o.id
              return (
                <div key={o.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <b className="ktc-mono" style={{ fontSize: 14.5 }}>{o.jo_number ?? '—'}</b>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                        {t(STATUS_LABEL[o.status] ?? o.status)}
                      </span>
                      {o.service_invoice_no && (
                        <span
                          className={`ktc-chip ${isCreditInvoice(o.service_invoice_no) ? 'ktc-chip--info' : 'ktc-chip--success'}`}
                          title={`${t('ERP')} ${o.service_invoice_no}${o.invoice_pad_no ? ` · ${t('printed invoice no.')} ${o.invoice_pad_no}` : ''}${isCreditInvoice(o.service_invoice_no) ? ` — ${t('billed on credit')}` : ''}`}
                        >
                          {isCreditInvoice(o.service_invoice_no) ? t('BILLED') : t('PAID')} · {o.service_invoice_no}{o.invoice_pad_no ? ` · #${o.invoice_pad_no}` : ''}
                        </span>
                      )}
                      {(o.serving ?? []).filter((s) => !s.vacated_at).map((s) => (
                        <span key={s.service_line} className="ktc-chip ktc-chip--accent" title={t("This week's {line} line number", { line: t(SERVICE_LINE_LABEL[s.service_line]) })}>
                          {t(SERVICE_LINE_LABEL[s.service_line])} #{s.serving_no}
                        </span>
                      ))}
                      {o.last_customer_edit_at && ['submitted', 'processing', 'on_hold'].includes(o.status) && (
                        <span className="ktc-chip ktc-chip--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          title={t('The customer changed this order after filing — please re-check it.') + ' · ' + new Date(o.last_customer_edit_at).toLocaleString()}>
                          <PencilIcon size={13} /> {t('Edited after filing')}
                        </span>
                      )}
                      {hasOutstandingSupplements(o) && (
                        <span className="ktc-chip ktc-chip--warning" title={t('An additional charge is still unpaid — the order can’t complete until it’s settled.')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <ClockIcon size={13} /> {t('Under review · additional charge')}
                        </span>
                      )}
                      {!o.service_invoice_no && o.payment_status === 'submitted' && (
                        <span className="ktc-chip ktc-chip--warning">{t('X-ray payment to review')}</span>
                      )}
                      {!o.service_invoice_no && o.payment_status === 'confirmed' && (
                        <span className="ktc-chip ktc-chip--success">{t('X-ray payment confirmed')}</span>
                      )}
                      {o.rps_payment_status === 'submitted' && (
                        <span className="ktc-chip ktc-chip--warning">{t('RPS payment to review')}</span>
                      )}
                      {o.status === 'completed' && !o.service_invoice_no && agingDays(o.completed_at) != null && (
                        <span className={`ktc-chip ${agingDays(o.completed_at)! >= 3 ? 'ktc-chip--danger' : 'ktc-chip--warning'}`}
                          title={t('Days since completion without a Service Invoice on file')}>
                          {t('unpaid {d}d', { d: agingDays(o.completed_at) ?? 0 })}
                        </span>
                      )}
                      {o.archived_at && <span className="ktc-chip" title={new Date(o.archived_at).toLocaleString()}>{t('Archived')}</span>}
                      {['submitted', 'processing', 'on_hold'].includes(o.status) && serviceProgress(o).length > 1 &&
                        serviceProgress(o).map((p) => (
                          <span key={p.line} className={`ktc-chip ${p.done ? 'ktc-chip--success' : ''}`}>
                            {t(SERVICE_LINE_LABEL[p.line])} {p.done ? '✓' : t('pending')}
                          </span>
                        ))}
                      {o.xray_performed_at && !o.service_invoice_no && (
                        <span className="ktc-chip ktc-chip--info" title={new Date(o.xray_performed_at).toLocaleString()}>
                          {t('X-ray done')}
                        </span>
                      )}
                    </span>
                    <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()}</span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                    {o.broker?.full_name || o.broker?.email || t('Unknown customer')}
                    {' · '}{o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
                    {o.entry_number ? ` · ${t('Entry')} ${o.entry_number}` : ''}
                  </div>
                  {o.lines && o.lines.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {o.lines.map((l, i) => (<li key={i}>{l.container_number} — {l.service_request}</li>))}
                    </ul>
                  )}
                  {o.supplements && o.supplements.length > 0 && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                      {o.supplements.map((s) => {
                        const tone = s.payment_status === 'confirmed' ? 'ktc-chip--success'
                          : s.payment_status === 'submitted' ? 'ktc-chip--warning'
                          : s.payment_status === 'rejected' ? 'ktc-chip--danger' : ''
                        const label = s.payment_status === 'confirmed' ? t('paid')
                          : s.payment_status === 'submitted' ? t('proof to review')
                          : s.payment_status === 'rejected' ? t('rejected') : t('unpaid')
                        return (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 10px', borderRadius: 9, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                            <b className="ktc-mono">{o.jo_number ?? '—'}-{s.suffix}</b>
                            <span>{s.label}</span>
                            <span className="ktc-mono" style={{ fontWeight: 600 }}>{peso(s.amount)}</span>
                            <span className={`ktc-chip ${tone}`} style={{ marginLeft: 'auto' }}>{label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {editId === o.id && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                      <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Edit operational details')}</span>
                      <input className="ktc-input" value={editFields.entry} placeholder={t('Entry number')}
                        onChange={(e) => setEditFields((f) => ({ ...f, entry: e.target.value.toUpperCase() }))} style={{ textTransform: 'uppercase', fontSize: 13 }} />
                      <input className="ktc-input" value={editFields.vessel} placeholder={t('Vessel name')}
                        onChange={(e) => setEditFields((f) => ({ ...f, vessel: e.target.value }))} style={{ fontSize: 13 }} />
                      <input className="ktc-input" value={editFields.voyage} placeholder={t('Voyage number')}
                        onChange={(e) => setEditFields((f) => ({ ...f, voyage: e.target.value }))} style={{ fontSize: 13 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btn('solid')} disabled={isBusy} onClick={() => void saveEdit()}>{t('Save details')}</button>
                        <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => setEditId(null)}>{t('Cancel')}</button>
                      </div>
                    </div>
                  )}
                  {o.admin_note && (o.status === 'on_hold' || o.status === 'rejected') && (
                    <div style={{ marginTop: 10, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-h40-90-96)', border: '1px solid var(--c-h35-85-84)', color: 'var(--c-h30-60-32)' }}>
                      <b>{t('Note to customer:')}</b> {o.admin_note}
                      {o.status === 'rejected' && o.rejected_recoverable === false && <> · <b>{t('terminal')}</b> {t('(customer can’t resubmit)')}</>}
                    </div>
                  )}
                  {o.customer_note && (
                    <div style={{ marginTop: 8, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-h210-60-96)', border: '1px solid var(--c-h210-55-86)', color: 'var(--c-h210-55-32)' }}>
                      <b>{t('Customer reply:')}</b> {o.customer_note}
                    </div>
                  )}

                  {/* Two-gate release status: payment + X-ray → cleared for release */}
                  {['submitted', 'processing', 'on_hold', 'completed'].includes(o.status) && (
                    <div style={{ marginTop: 12 }}><ReleaseTracks o={o} /></div>
                  )}

                  {/* Actions — gated by the owner-tweakable role permissions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {can('process_job_orders') && restorable(o).map((r) => (
                      <button key={r.line} style={btn('ghost')} disabled={isBusy}
                        title={t('This order was resubmitted and went to the back of the line — restore its original number')}
                        onClick={() => void restoreNumber(o.id, r.line)}>
                        ↩ {t('Restore {line} #{no}', { line: t(SERVICE_LINE_LABEL[r.line]), no: r.no })}
                      </button>
                    ))}
                    {can('accept_orders') && (o.status === 'submitted' || o.status === 'on_hold') && (
                      <button style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'processing', null)}>{t('Approve & process')}</button>
                    )}
                    {can('process_job_orders') && ['submitted', 'processing', 'on_hold'].includes(o.status) && serviceProgress(o).length > 1 &&
                      serviceProgress(o).filter((p) => !p.done).map((p) => (
                        <button key={p.line} style={btn('solid')} disabled={isBusy}
                          title={t('Marks the {line} service done — the order completes when every service is done', { line: t(SERVICE_LINE_LABEL[p.line]) })}
                          onClick={() => void markServiceDone(o.id, p.line)}>
                          ✓ {t('{line} done', { line: t(SERVICE_LINE_LABEL[p.line]) })}
                        </button>
                      ))}
                    {/* Complete is two-gated: every service done AND payment confirmed. */}
                    {can('complete_orders') && o.status === 'processing' && o.payment_status === 'confirmed' && (o.rps_status !== 'needed' || o.rps_payment_status === 'confirmed') && serviceProgress(o).every((p) => p.done) && (
                      <button style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'completed')}>{t('Mark completed')}</button>
                    )}
                    {can('hold_reject_orders') && (o.status === 'submitted' || o.status === 'processing') && (
                      <button style={btn('ghost')} disabled={isBusy} onClick={() => openNote(o, 'on_hold')}>{t('Hold for info')}</button>
                    )}
                    {can('hold_reject_orders') && (o.status === 'submitted' || o.status === 'processing' || o.status === 'on_hold') && (
                      <button style={btn('danger')} disabled={isBusy} onClick={() => openNote(o, 'rejected')}>{t('Reject')}</button>
                    )}
                    {can('review_payments') && o.payment_status === 'submitted' && (
                      payReject?.id === o.id && payRejectKind === 'base' ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void reviewPayment(o.id, false, payNote.trim(), 'base')}>{t('Reject proof')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayReject(null); setPayNote('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <>
                          <button style={btn('ghost')} onClick={() => void openFromStorage('payment-slips', o.payment_proof_path, `${t('X-ray payment slip')} — ${o.jo_number ?? ''} (${o.broker?.full_name ?? ''})`)}>
                            {t('View X-ray payment')}
                          </button>
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void reviewPayment(o.id, true, undefined, 'base')}>{t('Confirm X-ray payment')}</button>
                          <button style={btn('danger')} disabled={isBusy} onClick={() => { setPayReject(o); setPayRejectKind('base'); setPayNote('') }}>{t('Reject')}</button>
                        </>
                      )
                    )}
                    {can('review_payments') && o.rps_payment_status === 'submitted' && (
                      payReject?.id === o.id && payRejectKind === 'rps' ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input className="ktc-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
                          <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void reviewPayment(o.id, false, payNote.trim(), 'rps')}>{t('Reject proof')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayReject(null); setPayNote('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <>
                          <button style={btn('ghost')} onClick={() => void openFromStorage('payment-slips', o.rps_payment_proof_path, `${t('RPS payment slip')} — ${o.jo_number ?? ''} (${o.broker?.full_name ?? ''})`)}>
                            {t('View RPS payment')}
                          </button>
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void reviewPayment(o.id, true, undefined, 'rps')}>{t('Confirm RPS payment')}</button>
                          <button style={btn('danger')} disabled={isBusy} onClick={() => { setPayReject(o); setPayRejectKind('rps'); setPayNote('') }}>{t('Reject')}</button>
                        </>
                      )
                    )}
                    {can('record_invoice') && o.status === 'completed' && !o.service_invoice_no && (
                      invoiceId === o.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="ktc-input ktc-mono"
                            value={invoiceNo}
                            onChange={(e) => setInvoiceNo(e.target.value)}
                            placeholder={t('ERP control no. (OR-INV / BI-INV)')}
                            title={t('The ERP record ID — OR-INV-… for cash, BI-INV-… for credit')}
                            autoFocus
                            style={{ maxWidth: 215, width: '100%', padding: '7px 11px', fontSize: 13 }}
                          />
                          <input
                            className="ktc-input ktc-mono"
                            value={invoicePad}
                            onChange={(e) => setInvoicePad(e.target.value)}
                            placeholder={t('Invoice no. (e.g. 001323)')}
                            title={t('The printed OR / Billing Invoice serial from the pad')}
                            style={{ maxWidth: 170, width: '100%', padding: '7px 11px', fontSize: 13 }}
                          />
                          <button style={btn('solid')} disabled={isBusy || !invoiceNo.trim() || !invoicePad.trim()} onClick={() => void recordInvoice()}>{t('Save invoice')}</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setInvoiceId(null); setInvoiceNo(''); setInvoicePad('') }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <button style={btn('ghost')} onClick={() => { setInvoiceId(o.id); setInvoiceNo(''); setInvoicePad('') }} title={t('Record BOTH numbers: the ERP control no. (OR-INV-… cash / BI-INV-… credit) and the printed invoice serial — an invoice on file releases the order')}>
                          {t('Record invoice #')}
                        </button>
                      )
                    )}
                    {can('process_job_orders') && !['cancelled', 'rejected', 'held'].includes(o.status) && (
                      <button style={btn('ghost')} disabled={isBusy} onClick={() => { setCharge({ id: o.id, jo: o.jo_number ?? '—' }); setChargeLabel(''); setChargeAmount('') }}
                        title={t('Tag an additional charge (JO-…-A/B/C) — the customer settles it before the order can complete')}>
                        ＋ {t('Add charge')}
                      </button>
                    )}
                    {(can('process_job_orders') || can('review_payments') || can('manage_support')) && !['cancelled', 'rejected', 'held'].includes(o.status) && editId !== o.id && (
                      <button style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={isBusy} onClick={() => openEdit(o)} title={t('Correct the entry / vessel / voyage')}>
                        <PencilIcon size={14} /> {t('Edit details')}
                      </button>
                    )}
                    {printable && (
                      <Link to={`/job-order/${o.id}/print`} target="_blank" style={{ ...btn('ghost'), textDecoration: 'none' }}>{t('Print slip ↗')}</Link>
                    )}
                    <button style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setMsgOrder(o); setCopied(false) }} title={t('Compose a status message for Viber / SMS / Messenger')}>
                      <ChatIcon size={14} /> {t('Message')}
                    </button>
                    <button style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => toggleHistory(o.id)} title={t('Timeline, documents & comments')}>
                      <ClockIcon size={14} /> {t('Timeline')}
                    </button>
                  </div>

                  {historyId === o.id && (
                    <JoTimeline orderId={o.id} userId="" canComment canAttach={false} staff />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, justifyContent: 'center' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={page === 0} onClick={() => changePage(page - 1)}>{t('← Prev')}</button>
            <span className="ktc-label" style={{ fontSize: 12.5 }}>
              {t('{from}–{to} of {total}', { from: page * PAGE + 1, to: Math.min((page + 1) * PAGE, total), total })}
            </span>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={(page + 1) * PAGE >= total} onClick={() => changePage(page + 1)}>{t('Next →')}</button>
          </div>
        )}
      </div>

      {viewerModal}

      {charge && (
        <div className="ktc-modal-backdrop" onClick={() => { if (!busyId) setCharge(null) }}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430, width: '100%', padding: 24 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>{t('Add a charge')} · <span className="ktc-mono">{charge.jo}</span></h2>
            <p className="ktc-label" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
              {t('Tags an additional charge onto this order. The customer pays it separately; the order can’t complete until it’s settled.')}
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <input className="ktc-input" value={chargeLabel} autoFocus placeholder={t('What is the charge for? (e.g. Extra X-ray container)')}
                onChange={(e) => setChargeLabel(e.target.value)} style={{ fontSize: 13.5 }} />
              <input className="ktc-input ktc-mono" value={chargeAmount} inputMode="decimal" placeholder={t('Amount (₱)')}
                onChange={(e) => setChargeAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ fontSize: 13.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={btn('solid')} disabled={!!busyId || !chargeLabel.trim()} onClick={() => void addCharge()}>{busyId ? t('Adding…') : t('Add charge')}</button>
              <button type="button" className="ktc-link" onClick={() => setCharge(null)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass" style={{ maxWidth: 460, width: '100%', padding: 26 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              {modal.target === 'on_hold' ? t('Hold for information') : t('Reject job order')} · {modal.jo}
            </h2>
            <p className="ktc-label" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
              {modal.target === 'on_hold'
                ? t('Tell the customer what information or update you need. They’ll see this note on the order.')
                : t('Tell the customer why this order is being rejected. They’ll see this note on the order.')}
            </p>
            <textarea
              className="ktc-input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={modal.target === 'on_hold' ? t('e.g. Please confirm the entry number — it doesn’t match the consignee.') : t('e.g. Duplicate of JO-000123.')}
              style={{ marginTop: 12, resize: 'vertical', minHeight: 90 }}
            />
            {modal.target === 'rejected' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} style={{ marginTop: 2 }} />
                <span className="ktc-label" style={{ fontSize: 13 }}>
                  {t('Allow the customer to')} <b>{t('fix & resubmit')}</b> {t('this order (untick to close it permanently — they’d have to file a new one)')}
                </span>
              </label>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={btn(modal.target === 'rejected' ? 'danger' : 'solid')} onClick={() => void confirmNote()}>
                {modal.target === 'on_hold' ? t('Put on hold') : t('Reject order')}
              </button>
              <button type="button" className="ktc-link" onClick={() => setModal(null)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat status-message generator: composes the message; staff send it via
          their own Viber/SMS. Messenger has no prefill — use Copy, then paste. */}
      {msgOrder && (
        <div className="ktc-modal-backdrop" onClick={() => setMsgOrder(null)}>
          <div className="ktc-glass-thick ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: 24 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>
              {t('Status message')} · <span className="ktc-mono">{msgOrder.jo_number ?? '—'}</span>
            </h2>
            <p className="ktc-label" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
              {t('To')} {msgOrder.broker?.full_name || msgOrder.broker?.email || t('customer')}
              {msgOrder.broker?.contact_number ? <> · <span className="ktc-mono">{msgOrder.broker.contact_number}</span></> : ` · ${t('no contact number on file')}`}
            </p>
            <textarea
              className="ktc-input"
              readOnly
              value={chatMessage(msgOrder)}
              rows={8}
              onFocus={(e) => e.currentTarget.select()}
              style={{ marginTop: 10, resize: 'vertical', fontSize: 13, lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="ktc-btn ktc-btn--sm" type="button" onClick={() => void copyMessage()}>
                {copied ? t('✓ Copied') : t('Copy message')}
              </button>
              <a
                className="ktc-btn-secondary ktc-btn--sm"
                href={`viber://forward?text=${encodeURIComponent(chatMessage(msgOrder))}`}
                onClick={() => void copyMessage()} // also copy, so paste works if the prefill doesn't carry over
                style={{ textDecoration: 'none' }}
                title={t("Copies the message and opens Viber's forward screen — pick the customer's chat (paste if the text doesn't carry over)")}
              >
                {t('Send via Viber')}
              </a>
              {msgOrder.broker?.contact_number && (
                <a
                  className="ktc-btn-secondary ktc-btn--sm"
                  href={`sms:${msgOrder.broker.contact_number.replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(chatMessage(msgOrder))}`}
                  style={{ textDecoration: 'none' }}
                  title={t('Opens your SMS app with the message pre-filled (mobile)')}
                >
                  {t('SMS')}
                </a>
              )}
              <button type="button" className="ktc-link" onClick={() => setMsgOrder(null)} style={{ marginLeft: 'auto' }}>{t('Close')}</button>
            </div>
            <p className="ktc-label" style={{ marginTop: 10, fontSize: 11.5, opacity: 0.8, lineHeight: 1.5 }}>
              {t('Messenger doesn’t allow pre-filled messages — use Copy, then paste into the chat. Viber/SMS buttons work on devices with those apps installed.')}
            </p>
          </div>
        </div>
      )}
    </RoleShell>
  )
}
