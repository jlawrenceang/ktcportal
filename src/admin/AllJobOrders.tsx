import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useFileViewer } from '../components/FileViewerModal'
import JoTimeline from '../components/JoTimeline'
import { SERVICE_LINE_LABEL, serviceLineOf, type JobOrder, type ServiceLine, type ServingNumber } from '../lib/types'
import { isCreditInvoice } from '../lib/eventLabels'
import { usePageTour } from '../components/TourProvider'
import { operationsSteps } from './AdminTour'
import { peso } from '../lib/pricing'
import { useT } from '../lib/i18n'
import { ArchiveIcon, PencilIcon, ClockIcon, ChatIcon, GridIcon } from '../components/icons'
import ReleaseTracks from '../components/ReleaseTracks'
import { batchLabel, formatAge, ageHours } from '../lib/batch'
import { joPaymentState, hasPaymentToReview } from '../lib/joPayment'

interface AdminJobOrder extends JobOrder {
  broker?: { full_name: string | null; email: string | null; contact_number: string | null } | null
}

interface ChargeType {
  id: string
  label: string
  default_amount: number | null
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

// ── Small inline glyphs (kept local so icons.tsx is untouched) ──
const ListGlyph = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)
const DotsGlyph = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
)

const SELECT =
  'id, jo_number, entry_number, consignee_id, vessel_name, voyage_number, vessel_visit, status, priority_status, is_rexray, rexray_status, rexray_billable, parent_job_order_id, admin_note, customer_note, rejected_recoverable, xray_performed_at, service_invoice_no, invoice_pad_no, payment_status, payment_proof_path, payment_submitted_at, rps_status, rps_payment_status, rps_payment_proof_path, rps_payment_submitted_at, completed_at, archived_at, created_at, last_customer_edit_at, broker:customers(full_name, email, contact_number), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), serving:serving_numbers(service_line, serving_no, week_start, vacated_at), completions:service_completions(service_line, completed_at), supplements:jo_supplements(id, suffix, label, amount, bill_status, payment_status, payment_proof_path, payment_submitted_at, payment_note, created_at)'

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

// Card / dense-list dual view, persisted per browser.
type View = 'card' | 'list'
const VIEW_KEY = 'ktc_jo_view'

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

// A self-closing dropdown wrapper for the per-order "⋯ Actions" menu. Closes on
// outside click / Escape; shared by both card + list views.
// The menu is PORTALED to <body> with fixed positioning so it can't be clipped by a
// scrollable/overflow ancestor (the detail modal body is overflowY:auto) — that was
// cutting the menu off on mobile. It's clamped to the viewport (left + maxWidth),
// flips above the button when there's no room below, scrolls if the list is long,
// and closes on scroll/resize so it never floats detached.
function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const W = 230
    const left = Math.max(12, Math.min(r.right - W, window.innerWidth - W - 12))
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    if (below >= 240 || below >= above) setPos({ left, top: r.bottom + 6, maxH: below })
    else setPos({ left, bottom: window.innerHeight - r.top + 6, maxH: above })
  }
  function toggle() { if (open) { setOpen(false); return } place(); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (btnRef.current?.contains(n) || menuRef.current?.contains(n)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  return (
    <div style={{ display: 'inline-flex' }}>
      <button ref={btnRef} type="button" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={toggle}>
        <DotsGlyph size={15} /> {label}
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} onClick={() => setOpen(false)} style={{
          position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 1000,
          minWidth: 210, maxWidth: 'calc(100vw - 24px)', maxHeight: Math.max(160, pos.maxH), overflowY: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 8,
          borderRadius: 12, background: 'var(--c-w70, var(--c-w60))', border: '1px solid var(--glass-brd)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.16)', backdropFilter: 'blur(14px)',
        }}>
          {children}
        </div>,
        document.body,
      )}
    </div>
  )
}

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
  // Hold: which fields the customer must re-enter (empty = general hold).
  const [holdFields, setHoldFields] = useState<string[]>([])
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
  const [chargeTypeId, setChargeTypeId] = useState('') // selected additional_charge_types.id, or 'other'
  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([])
  // Staff edit of the operational header (entry / vessel / voyage).
  const [editId, setEditId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState({ entry: '', vessel: '', voyage: '' })
  // Card / list view toggle (persisted).
  const [view, setView] = useState<View>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null
    return v === 'list' ? 'list' : 'card'
  })
  // The order whose full detail/actions modal is open (tracked by id so it stays
  // in sync across reloads; mirrors MyJobOrders' `selected`).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? orders.find((o) => o.id === selectedId) ?? null : null

  function setViewPersist(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage unavailable */ }
  }

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
        // Keep an open detail modal in sync; close it if the order dropped out of
        // the current filter/page (mirrors MyJobOrders' `selected` handling).
        setSelectedId((prev) => (prev && rows.some((o) => o.id === prev) ? prev : null))
      })
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Charge-type catalogue for the add-charge dropdown (active, by sort).
  useEffect(() => {
    void supabase
      .from('additional_charge_types')
      .select('id,label,default_amount,active,sort')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => setChargeTypes(((data ?? []) as ChargeType[])))
  }, [])

  // Escape closes the detail modal (matches backdrop / ✕). Only while one is open
  // and no nested prompt (note / charge / message) is showing — those own Escape.
  useEffect(() => {
    if (!selectedId || modal || charge || msgOrder) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, modal, charge, msgOrder])

  function changeFilter(f: Filter) {
    setFilter(f); setPage(0); setLoading(true); setArchiveMsg(null); setSelectedId(null)
    void load(f, 0)
  }
  function changePage(p: number) {
    setPage(p); setLoading(true); setSelectedId(null)
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

  async function apply(id: string, status: string, adminNote?: string | null) {
    setBusyId(id)
    // Permission-checked, stage-gated transition (0086). Completion is two-gated
    // (all services done + payment confirmed) server-side. Reject is terminal —
    // staff_transition_order forces rejected_recoverable=false (0154).
    const { error } = await supabase.rpc('staff_transition_order', {
      p_id: id, p_status: status, p_note: adminNote ?? null,
    })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }

  // Priority lane (ADR-0035 phase 4): CS/ops request, admin approves → priority numbering.
  async function requestPriority(id: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('request_priority', { p_id: id })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }
  async function reviewPriority(id: string, approve: boolean) {
    setBusyId(id)
    const { error } = await supabase.rpc('review_priority', { p_id: id, p_approve: approve })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }

  // Re-X-ray (ADR-0035 phase 5): request on a completed order, admin approves → child JO.
  async function requestRexray(id: string) {
    if (!window.confirm(t('Request a re-X-ray for this completed order? It creates a suffixed child order (e.g. JO-000001A) for admin approval.'))) return
    setBusyId(id)
    const { error } = await supabase.rpc('request_rexray', { p_parent: id })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }
  async function reviewRexray(id: string, approve: boolean) {
    setBusyId(id)
    const { error } = await supabase.rpc('review_rexray', { p_id: id, p_approve: approve })
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }

  function openNote(o: AdminJobOrder, target: 'on_hold' | 'rejected') {
    setModal({ id: o.id, jo: o.jo_number ?? '—', target })
    setNote(o.admin_note ?? '')
    setHoldFields([])
  }

  async function confirmNote() {
    if (!modal) return
    if (!note.trim()) { alert(t('Please add a note for the customer.')); return }
    const id = modal.id, target = modal.target
    if (target === 'on_hold') {
      // Field-targeted "needs info" hold (0154). Empty fields = general hold.
      setBusyId(id)
      const { error } = await supabase.rpc('hold_job_order', {
        p_id: id, p_note: note.trim(), p_fields: holdFields.length ? holdFields : null,
      })
      setBusyId(null)
      setModal(null); setNote(''); setHoldFields([])
      if (error) { alert(error.message); return }
      await load()
      return
    }
    // Reject is terminal — no recoverable choice anymore.
    setModal(null)
    await apply(id, 'rejected', note.trim())
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
    const canBill = can('bill_supplement')   // cashier/admin bill directly; ops only requests
    if (canBill && !(Number(chargeAmount) > 0)) return
    setBusyId(charge.id)
    const { error } = canBill
      ? await supabase.rpc('add_supplement', { p_jo: charge.id, p_label: chargeLabel.trim(), p_amount: Number(chargeAmount) })
      : await supabase.rpc('request_supplement', { p_jo: charge.id, p_label: chargeLabel.trim() })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setCharge(null); setChargeLabel(''); setChargeAmount(''); setChargeTypeId('')
    await load()
  }

  // Bill a requested charge (cashier): set its amount → it becomes a payable.
  async function billSupplement(s: { id: string; label: string }, joId: string) {
    const a = window.prompt(t('Amount (₱) to bill — {label}', { label: s.label }), '')
    if (a === null) return
    const amount = Number(a)
    if (!(amount > 0)) { alert(t('Enter an amount greater than zero.')); return }
    setBusyId(joId)
    const { error } = await supabase.rpc('bill_supplement', { p_id: s.id, p_amount: amount })
    setBusyId(null)
    if (error) { alert(error.message); return }
    await load()
  }

  // Add-charge dropdown: picking a type pre-fills the (editable) amount + label;
  // "other" reveals a free-text label input.
  function pickChargeType(id: string) {
    setChargeTypeId(id)
    if (id === 'other') { setChargeLabel(''); return }
    const ct = chargeTypes.find((c) => c.id === id)
    if (ct) {
      setChargeLabel(ct.label)
      if (ct.default_amount != null) setChargeAmount(String(ct.default_amount))
    }
  }

  function openCharge(o: AdminJobOrder) {
    setCharge({ id: o.id, jo: o.jo_number ?? '—' }); setChargeLabel(''); setChargeAmount(''); setChargeTypeId('')
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

  // ── Per-order chips (secondary cues, grouped) ──
  // The ONE customer-balance pill (replaces the scattered base/RPS/supplement/
  // unpaid-aging chips). Staff-actionable cues ("proof to review", BILLED, aging)
  // stay separate below.
  function PaymentPill({ o }: { o: AdminJobOrder }) {
    const state = joPaymentState(o)
    if (state === 'balance') return <span className="ktc-chip ktc-chip--warning">{t('Balance to pay')}</span>
    if (state === 'paid') return <span className="ktc-chip ktc-chip--success">{t('Paid')}</span>
    return null
  }

  // The ERP Service-Invoice / BILLED chip (kept — it's not the customer balance).
  function InvoiceChip({ o }: { o: AdminJobOrder }) {
    if (!o.service_invoice_no) return null
    const credit = isCreditInvoice(o.service_invoice_no)
    return (
      <span
        className={`ktc-chip ${credit ? 'ktc-chip--info' : 'ktc-chip--success'}`}
        title={`${t('ERP')} ${o.service_invoice_no}${o.invoice_pad_no ? ` · ${t('printed invoice no.')} ${o.invoice_pad_no}` : ''}${credit ? ` — ${t('billed on credit')}` : ''}`}
      >
        {credit ? t('BILLED') : t('PAID')} · {o.service_invoice_no}{o.invoice_pad_no ? ` · #${o.invoice_pad_no}` : ''}
      </span>
    )
  }

  // Secondary / aging / progress chips, grouped (NOT the customer balance —
  // that's PaymentPill). Includes the staff-actionable "proof to review" cue.
  function SecondaryChips({ o }: { o: AdminJobOrder }) {
    const isOpen = ['submitted', 'processing', 'on_hold'].includes(o.status)
    const ageH = ageHours(o.created_at, o.status === 'completed' ? o.completed_at : null)
    return (
      <>
        {o.priority_status === 'granted' && <span className="ktc-chip ktc-chip--accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>★ {t('Priority')}</span>}
        {o.priority_status === 'requested' && <span className="ktc-chip ktc-chip--warning">{t('Priority requested')}</span>}
        {o.is_rexray && <span className="ktc-chip ktc-chip--info">{o.rexray_status === 'requested' ? t('Re-X-ray requested') : t('Re-X-ray')}</span>}
        <span className="ktc-chip" title={t('Filed {date}', { date: new Date(o.created_at).toLocaleString() })}>{t('Batch')}: {batchLabel(o.created_at, t)}</span>
        {isOpen && (
          <span className="ktc-chip" title={t('X-ray working hours (9 AM–7 PM) since filed')}
            style={ageH >= 20 ? { background: 'var(--c-h0-75-97)', color: 'var(--c-h0-60-40)' } : ageH >= 10 ? { background: 'var(--c-h40-90-96)', color: 'var(--c-h30-60-32)' } : undefined}>
            {t('Open {age}', { age: formatAge(o.created_at) })}
          </span>
        )}
        {o.status === 'completed' && o.completed_at && (
          <span className="ktc-chip ktc-chip--success" title={t('Filing to completion')}>{t('Done in {age}', { age: formatAge(o.created_at, o.completed_at) })}</span>
        )}
        {o.last_customer_edit_at && ['submitted', 'processing', 'on_hold'].includes(o.status) && (
          <span className="ktc-chip ktc-chip--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title={t('The customer changed this order after filing — please re-check it.') + ' · ' + new Date(o.last_customer_edit_at).toLocaleString()}>
            <PencilIcon size={13} /> {t('Edited after filing')}
          </span>
        )}
        {hasPaymentToReview(o) && (
          <span className="ktc-chip ktc-chip--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title={t('A payment proof is waiting for the cashier to review.')}>
            <ClockIcon size={13} /> {t('Payment proof to review')}
          </span>
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
      </>
    )
  }

  // A FEW key secondary chips for the compact tile face (Batch + aging +
  // edited-after-filing + proof-to-review). The full set lives in SecondaryChips
  // inside the detail modal. Container count is rendered separately by the tile.
  function CompactChips({ o }: { o: AdminJobOrder }) {
    const isOpen = ['submitted', 'processing', 'on_hold'].includes(o.status)
    const ageH = ageHours(o.created_at, o.status === 'completed' ? o.completed_at : null)
    return (
      <>
        {o.priority_status === 'granted' && <span className="ktc-chip ktc-chip--accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>★ {t('Priority')}</span>}
        {o.priority_status === 'requested' && <span className="ktc-chip ktc-chip--warning">{t('Priority requested')}</span>}
        {o.is_rexray && <span className="ktc-chip ktc-chip--info">{o.rexray_status === 'requested' ? t('Re-X-ray requested') : t('Re-X-ray')}</span>}
        <span className="ktc-chip" title={t('Filed {date}', { date: new Date(o.created_at).toLocaleString() })}>{t('Batch')}: {batchLabel(o.created_at, t)}</span>
        {isOpen && (
          <span className="ktc-chip" title={t('X-ray working hours (9 AM–7 PM) since filed')}
            style={ageH >= 20 ? { background: 'var(--c-h0-75-97)', color: 'var(--c-h0-60-40)' } : ageH >= 10 ? { background: 'var(--c-h40-90-96)', color: 'var(--c-h30-60-32)' } : undefined}>
            {t('Open {age}', { age: formatAge(o.created_at) })}
          </span>
        )}
        {o.last_customer_edit_at && isOpen && (
          <span className="ktc-chip ktc-chip--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title={t('The customer changed this order after filing — please re-check it.') + ' · ' + new Date(o.last_customer_edit_at).toLocaleString()}>
            <PencilIcon size={13} /> {t('Edited after filing')}
          </span>
        )}
        {hasPaymentToReview(o) && (
          <span className="ktc-chip ktc-chip--warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title={t('A payment proof is waiting for the cashier to review.')}>
            <ClockIcon size={13} /> {t('Payment proof to review')}
          </span>
        )}
      </>
    )
  }

  // ── Inline forms (kept exactly; reused inside the actions area) ──
  function EditForm() {
    return (
      <div style={{ marginTop: 10, display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Edit operational details')}</span>
        <input className="ktc-input" value={editFields.entry} placeholder={t('Entry number')}
          onChange={(e) => setEditFields((f) => ({ ...f, entry: e.target.value.toUpperCase() }))} style={{ textTransform: 'uppercase', fontSize: 13 }} />
        <input className="ktc-input" value={editFields.vessel} placeholder={t('Vessel name')}
          onChange={(e) => setEditFields((f) => ({ ...f, vessel: e.target.value }))} style={{ fontSize: 13 }} />
        <input className="ktc-input" value={editFields.voyage} placeholder={t('Voyage number')}
          onChange={(e) => setEditFields((f) => ({ ...f, voyage: e.target.value }))} style={{ fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('solid')} disabled={!!busyId} onClick={() => void saveEdit()}>{t('Save details')}</button>
          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => setEditId(null)}>{t('Cancel')}</button>
        </div>
      </div>
    )
  }

  // The full action set for one order. Split into "primary" (1–2 direct buttons
  // surfaced on the face) + "menu" (the rest, inside the ⋯ dropdown). Both card +
  // list views render this. Every action / gate is preserved verbatim.
  function OrderActions({ o }: { o: AdminJobOrder }) {
    const isBusy = busyId === o.id
    const printable = o.status === 'processing' || o.status === 'completed'

    // Primary direct buttons (the 1–2 most important contextual actions).
    const primary: ReactNode[] = []
    if (can('accept_orders') && (o.status === 'submitted' || o.status === 'on_hold')) {
      primary.push(
        <button key="accept" style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'processing', null)}>{t('Approve & process')}</button>
      )
    }
    if (can('review_payments') && o.payment_status === 'submitted' && !(payReject?.id === o.id && payRejectKind === 'base')) {
      primary.push(
        <button key="rev-base" style={btn('solid')} disabled={isBusy} onClick={() => void reviewPayment(o.id, true, undefined, 'base')}>{t('Confirm X-ray payment')}</button>
      )
    }

    // The remaining actions, grouped into the dropdown.
    const menu: ReactNode[] = []

    if (can('process_job_orders')) {
      restorable(o).forEach((r) => menu.push(
        <button key={`restore-${r.line}`} style={btn('ghost')} disabled={isBusy}
          title={t('This order was resubmitted and went to the back of the line — restore its original number')}
          onClick={() => void restoreNumber(o.id, r.line)}>
          ↩ {t('Restore {line} #{no}', { line: t(SERVICE_LINE_LABEL[r.line]), no: r.no })}
        </button>
      ))
    }

    if (can('process_job_orders') && ['submitted', 'processing', 'on_hold'].includes(o.status) && serviceProgress(o).length > 1) {
      serviceProgress(o).filter((p) => !p.done).forEach((p) => menu.push(
        <button key={`svc-${p.line}`} style={btn('solid')} disabled={isBusy}
          title={t('Marks the {line} service done — the order completes when every service is done', { line: t(SERVICE_LINE_LABEL[p.line]) })}
          onClick={() => void markServiceDone(o.id, p.line)}>
          ✓ {t('{line} done', { line: t(SERVICE_LINE_LABEL[p.line]) })}
        </button>
      ))
    }

    // Complete is two-gated: every service done AND payment confirmed.
    if (can('complete_orders') && o.status === 'processing' && o.payment_status === 'confirmed' && (o.rps_status !== 'needed' || o.rps_payment_status === 'confirmed') && serviceProgress(o).every((p) => p.done)) {
      menu.push(<button key="complete" style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'completed')}>{t('Mark completed')}</button>)
    }

    if (can('hold_reject_orders') && (o.status === 'submitted' || o.status === 'processing')) {
      menu.push(<button key="hold" style={btn('ghost')} disabled={isBusy} onClick={() => openNote(o, 'on_hold')}>{t('Hold for info')}</button>)
    }
    if (can('hold_reject_orders') && (o.status === 'submitted' || o.status === 'processing' || o.status === 'on_hold')) {
      menu.push(<button key="reject" style={btn('danger')} disabled={isBusy} onClick={() => openNote(o, 'rejected')}>{t('Reject')}</button>)
    }

    // Priority lane: request (CS/ops) → approve (admin). Granted = served ahead.
    if (can('request_priority') && ['submitted', 'processing', 'on_hold'].includes(o.status) && !o.priority_status) {
      menu.push(<button key="req-prio" style={btn('ghost')} disabled={isBusy} onClick={() => void requestPriority(o.id)}>{t('Request priority')}</button>)
    }
    if (can('approve_priority') && o.priority_status === 'requested') {
      menu.push(<button key="grant-prio" style={btn('solid')} disabled={isBusy} onClick={() => void reviewPriority(o.id, true)}>{t('Approve priority')}</button>)
      menu.push(<button key="deny-prio" style={btn('ghost')} disabled={isBusy} onClick={() => void reviewPriority(o.id, false)}>{t('Deny priority')}</button>)
    }

    // Re-X-ray: request on a completed (non-re-X-ray) order; admin approves the request.
    if (can('request_rexray') && o.status === 'completed' && !o.is_rexray) {
      menu.push(<button key="req-rexray" style={btn('ghost')} disabled={isBusy} onClick={() => void requestRexray(o.id)}>{t('Request re-X-ray')}</button>)
    }
    if (can('approve_rexray') && o.is_rexray && o.rexray_status === 'requested') {
      menu.push(<button key="grant-rexray" style={btn('solid')} disabled={isBusy} onClick={() => void reviewRexray(o.id, true)}>{t('Approve re-X-ray')}</button>)
      menu.push(<button key="deny-rexray" style={btn('ghost')} disabled={isBusy} onClick={() => void reviewRexray(o.id, false)}>{t('Deny re-X-ray')}</button>)
    }

    // Base payment review (proof view / reject inline form).
    if (can('review_payments') && o.payment_status === 'submitted') {
      if (payReject?.id === o.id && payRejectKind === 'base') {
        menu.push(
          <span key="payrej-base" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="ktc-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
            <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void reviewPayment(o.id, false, payNote.trim(), 'base')}>{t('Reject proof')}</button>
            <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayReject(null); setPayNote('') }}>{t('Cancel')}</button>
          </span>
        )
      } else {
        menu.push(
          <button key="pay-view-base" style={btn('ghost')} onClick={() => void openFromStorage('payment-slips', o.payment_proof_path, `${t('X-ray payment slip')} — ${o.jo_number ?? ''} (${o.broker?.full_name ?? ''})`)}>
            {t('View X-ray payment')}
          </button>
        )
        menu.push(
          <button key="pay-reject-base" style={btn('danger')} disabled={isBusy} onClick={() => { setPayReject(o); setPayRejectKind('base'); setPayNote('') }}>{t('Reject')}</button>
        )
      }
    }

    // RPS payment review.
    if (can('review_payments') && o.rps_payment_status === 'submitted') {
      if (payReject?.id === o.id && payRejectKind === 'rps') {
        menu.push(
          <span key="payrej-rps" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="ktc-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder={t('Why? (shown to the customer)')} autoFocus style={{ maxWidth: 230, width: '100%', padding: '7px 11px', fontSize: 13 }} />
            <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void reviewPayment(o.id, false, payNote.trim(), 'rps')}>{t('Reject proof')}</button>
            <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayReject(null); setPayNote('') }}>{t('Cancel')}</button>
          </span>
        )
      } else {
        menu.push(
          <button key="pay-view-rps" style={btn('ghost')} onClick={() => void openFromStorage('payment-slips', o.rps_payment_proof_path, `${t('RPS payment slip')} — ${o.jo_number ?? ''} (${o.broker?.full_name ?? ''})`)}>
            {t('View RPS payment')}
          </button>
        )
        menu.push(
          <button key="pay-confirm-rps" style={btn('solid')} disabled={isBusy} onClick={() => void reviewPayment(o.id, true, undefined, 'rps')}>{t('Confirm RPS payment')}</button>
        )
        menu.push(
          <button key="pay-reject-rps" style={btn('danger')} disabled={isBusy} onClick={() => { setPayReject(o); setPayRejectKind('rps'); setPayNote('') }}>{t('Reject')}</button>
        )
      }
    }

    // ERP Service-Invoice recording.
    if (can('record_invoice') && !['cancelled', 'rejected', 'held'].includes(o.status) && !o.service_invoice_no) {
      if (invoiceId === o.id) {
        menu.push(
          <span key="inv-form" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
        )
      } else {
        menu.push(
          <button key="inv-open" style={btn('ghost')} onClick={() => { setInvoiceId(o.id); setInvoiceNo(''); setInvoicePad('') }} title={t('Record BOTH numbers: the ERP control no. (OR-INV-… cash / BI-INV-… credit) and the printed invoice serial — an invoice on file releases the order')}>
            {t('Record invoice #')}
          </button>
        )
      }
    }

    if ((can('request_supplement') || can('bill_supplement')) && !['cancelled', 'rejected', 'held'].includes(o.status)) {
      menu.push(
        <button key="add-charge" style={btn('ghost')} disabled={isBusy} onClick={() => openCharge(o)}
          title={t('Tag an additional charge (JO-…-A/B/C) — the customer settles it before the order can complete')}>
          ＋ {can('bill_supplement') ? t('Add charge') : t('Request charge')}
        </button>
      )
    }

    if ((can('process_job_orders') || can('review_payments') || can('manage_support')) && !['cancelled', 'rejected', 'held'].includes(o.status) && editId !== o.id) {
      menu.push(
        <button key="edit" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={isBusy} onClick={() => openEdit(o)} title={t('Correct the entry / vessel / voyage')}>
          <PencilIcon size={14} /> {t('Edit details')}
        </button>
      )
    }

    if (printable) {
      menu.push(
        <Link key="print" to={`/job-order/${o.id}/print`} target="_blank" style={{ ...btn('ghost'), textDecoration: 'none', textAlign: 'center' }}>{t('Print slip ↗')}</Link>
      )
    }

    menu.push(
      <button key="message" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setMsgOrder(o); setCopied(false) }} title={t('Compose a status message for Viber / SMS / Messenger')}>
        <ChatIcon size={14} /> {t('Message')}
      </button>
    )
    menu.push(
      <button key="timeline" style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => toggleHistory(o.id)} title={t('Timeline, documents & comments')}>
        <ClockIcon size={14} /> {t('Timeline')}
      </button>
    )

    // If an inline form for THIS order is open, render the menu items inline
    // (the dropdown can't host an autoFocus'd inline form well) so the form is
    // visible without re-opening the menu.
    const inlineFormOpen =
      (payReject?.id === o.id) || (invoiceId === o.id)

    return (
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {primary}
        {inlineFormOpen
          ? menu
          : menu.length > 0 && <ActionsMenu label={t('Actions')}>{menu}</ActionsMenu>}
      </div>
    )
  }

  // Shared body (notes, lines, supplements, edit form, release tracks, timeline).
  function OrderBody({ o }: { o: AdminJobOrder }) {
    return (
      <>
        {o.lines && o.lines.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {o.lines.map((l, i) => (<li key={i}>{l.container_number} — {l.service_request}</li>))}
          </ul>
        )}
        {o.supplements && o.supplements.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {o.supplements.map((s) => {
              const requested = s.bill_status === 'requested'
              const tone = requested ? '' : s.payment_status === 'confirmed' ? 'ktc-chip--success'
                : s.payment_status === 'submitted' ? 'ktc-chip--warning'
                : s.payment_status === 'rejected' ? 'ktc-chip--danger' : ''
              const label = requested ? t('requested') : s.payment_status === 'confirmed' ? t('paid')
                : s.payment_status === 'submitted' ? t('proof to review')
                : s.payment_status === 'rejected' ? t('rejected') : t('unpaid')
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 10px', borderRadius: 9, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                  <b className="ktc-mono">{o.jo_number ?? '—'}-{s.suffix}</b>
                  <span>{s.label}</span>
                  <span className="ktc-mono" style={{ fontWeight: 600 }}>{requested ? '—' : peso(s.amount)}</span>
                  <span className={`ktc-chip ${tone}`} style={{ marginLeft: 'auto' }}>{label}</span>
                  {requested && can('bill_supplement') && <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void billSupplement(s, o.id)}>{t('Bill')}</button>}
                </div>
              )
            })}
          </div>
        )}
        {editId === o.id && <EditForm />}
        {o.admin_note && (o.status === 'on_hold' || o.status === 'rejected') && (
          <div style={{ marginTop: 10, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-h40-90-96)', border: '1px solid var(--c-h35-85-84)', color: 'var(--c-h30-60-32)' }}>
            <b>{t('Note to customer:')}</b> {o.admin_note}
            {o.status === 'rejected' && <> · <b>{t('terminal')}</b> {t('(customer can’t resubmit)')}</>}
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

        <OrderActions o={o} />

        {historyId === o.id && (
          <JoTimeline orderId={o.id} userId="" canComment canAttach={false} staff />
        )}
      </>
    )
  }

  // ── Card view (compact, click-to-open) ──
  // Only a scannable summary on the face; the FULL detail + every action lives in
  // the detail modal (opened on click). No body/actions render here.
  function OrderCard({ o }: { o: AdminJobOrder }) {
    const sp = STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled
    const containers = (o.lines ?? []).length
    return (
      <button type="button" onClick={() => setSelectedId(o.id)}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
        {/* (a) Header row: JO# · status · balance pill · invoice chip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b className="ktc-mono" style={{ fontSize: 14.5 }}>{o.jo_number ?? '—'}</b>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              {t(STATUS_LABEL[o.status] ?? o.status)}
            </span>
            <PaymentPill o={o} />
            <InvoiceChip o={o} />
          </span>
          <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()}</span>
        </div>

        {/* (b) Meta line: customer · consignee · entry · container count */}
        <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
          {o.broker?.full_name || o.broker?.email || t('Unknown customer')}
          {' · '}{o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
          {o.entry_number ? ` · ${t('Entry')} ${o.entry_number}` : ''}
          {' · '}{t('{n} cntr', { n: containers })}
        </div>

        {/* (c) A few key secondary chips (Batch + aging + cues) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
          <CompactChips o={o} />
        </div>
      </button>
    )
  }

  // ── List view (compact one-row-per-order; click to open the detail modal) ──
  function OrderRow({ o }: { o: AdminJobOrder }) {
    const sp = STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled
    const containers = (o.lines ?? []).length
    return (
      <button type="button" onClick={() => setSelectedId(o.id)}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,auto) auto 1fr auto', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 12, border: '1px solid var(--glass-brd)', background: 'var(--c-w55)', padding: '10px 14px' }}>
        <b className="ktc-mono" style={{ fontSize: 13.5 }}>{o.jo_number ?? '—'}</b>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: sp.bg, color: sp.ink, whiteSpace: 'nowrap' }}>
          {t(STATUS_LABEL[o.status] ?? o.status)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.broker?.full_name || o.broker?.email || t('Unknown customer')}
          </span>
          <span className="ktc-label" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
            {' · '}{t('{n} cntr', { n: containers })}
            {' · '}{t('Batch')}: {batchLabel(o.created_at, t)}
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <PaymentPill o={o} />
          <InvoiceChip o={o} />
          <span aria-hidden style={{ display: 'inline-flex', color: 'hsl(var(--ink-2))' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
          </span>
        </span>
      </button>
    )
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
          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Card / list segmented toggle (persisted) */}
            <span role="group" aria-label={t('View')} style={{ display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--glass-brd)' }}>
              <button type="button" aria-pressed={view === 'card'} title={t('Cards')}
                onClick={() => setViewPersist('card')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: view === 'card' ? 'var(--c-w70, var(--c-w60))' : 'transparent', color: view === 'card' ? 'hsl(var(--ink))' : 'hsl(var(--ink-2))' }}>
                <GridIcon size={14} /> {t('Cards')}
              </button>
              <button type="button" aria-pressed={view === 'list'} title={t('List')}
                onClick={() => setViewPersist('list')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', border: 0, borderLeft: '1px solid var(--glass-brd)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: view === 'list' ? 'var(--c-w70, var(--c-w60))' : 'transparent', color: view === 'list' ? 'hsl(var(--ink))' : 'hsl(var(--ink-2))' }}>
                <ListGlyph size={14} /> {t('List')}
              </button>
            </span>
            {can('process_job_orders') && (filter === 'completed' || filter === 'all') && (
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} disabled={archiving}
                title={t('Archives every completed order that has a Service Invoice number (= paid). Also runs automatically every Monday.')}
                onClick={() => void archiveDone()}>
                {archiving ? t('Archiving…') : <><ArchiveIcon size={15} /> {t('Archive paid & completed')}</>}
              </button>
            )}
          </div>
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
        ) : view === 'list' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {orders.map((o) => <OrderRow key={o.id} o={o} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => <OrderCard key={o.id} o={o} />)}
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

      {/* Detail modal — the FULL order detail + every action. The tiles are just a
          compact summary; clicking one opens this. Mirrors MyJobOrders' pattern. */}
      {selected && (() => {
        const o = selected
        const sp = STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled
        const close = () => setSelectedId(null)
        return (
          <div className="ktc-modal-backdrop" onClick={close}>
            <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              {/* Header: JO# · status · payment pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                  <b className="ktc-mono" style={{ fontSize: 15 }}>{o.jo_number ?? '—'}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                    {t(STATUS_LABEL[o.status] ?? o.status)}
                  </span>
                  <PaymentPill o={o} />
                </div>
                <button type="button" aria-label={t('Close')} onClick={close}
                  style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
                {/* Meta line: customer · consignee · entry */}
                <div className="ktc-label" style={{ fontSize: 13 }}>
                  {o.broker?.full_name || o.broker?.email || t('Unknown customer')}
                  {' · '}{o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
                  {o.entry_number ? ` · ${t('Entry')} ${o.entry_number}` : ''}
                </div>

                {/* Full secondary / aging / progress chips + ERP invoice chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                  <InvoiceChip o={o} />
                  <SecondaryChips o={o} />
                </div>

                {/* Containers, supplements, notes, release tracks, actions, timeline */}
                <OrderBody o={o} />
              </div>
            </div>
          </div>
        )
      })()}

      {charge && (
        <div className="ktc-modal-backdrop" onClick={() => { if (!busyId) setCharge(null) }}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430, width: '100%', padding: 24, maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>{t('Add a charge')} · <span className="ktc-mono">{charge.jo}</span></h2>
            <p className="ktc-label" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
              {t('Tags an additional charge onto this order. The customer pays it separately; the order can’t complete until it’s settled.')}
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <select className="ktc-input" value={chargeTypeId} onChange={(e) => pickChargeType(e.target.value)} style={{ fontSize: 13.5 }}>
                <option value="">{t('Select a charge type…')}</option>
                {chargeTypes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}{c.default_amount != null ? ` · ${peso(c.default_amount)}` : ''}</option>
                ))}
                <option value="other">{t('Other…')}</option>
              </select>
              {chargeTypeId === 'other' && (
                <input className="ktc-input" value={chargeLabel} autoFocus placeholder={t('What is the charge for? (e.g. Extra X-ray container)')}
                  onChange={(e) => setChargeLabel(e.target.value)} style={{ fontSize: 13.5 }} />
              )}
              {can('bill_supplement') && (
                <input className="ktc-input ktc-mono" value={chargeAmount} inputMode="decimal" placeholder={t('Amount (₱)')}
                  onChange={(e) => setChargeAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ fontSize: 13.5 }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={btn('solid')} disabled={!!busyId || !chargeLabel.trim() || (can('bill_supplement') && !(Number(chargeAmount) > 0))} onClick={() => void addCharge()}>{busyId ? t('Saving…') : can('bill_supplement') ? t('Add charge') : t('Request charge')}</button>
              <button type="button" className="ktc-link" onClick={() => setCharge(null)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="ktc-modal-backdrop" onClick={() => setModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass ktc-modal-panel" style={{ maxWidth: 460, width: '100%', padding: 26, maxHeight: '88vh', overflowY: 'auto' }}>
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
            {modal.target === 'on_hold' && (
              <div style={{ marginTop: 12 }}>
                <span className="ktc-label" style={{ fontSize: 12.5, fontWeight: 600 }}>{t('Which fields should the customer re-enter? (optional)')}</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  {([['consignee', 'Consignee'], ['entry', 'Entry number'], ['vessel', 'Vessel / voyage'], ['containers', 'Containers']] as const).map(([key, lbl]) => (
                    <label key={key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={holdFields.includes(key)}
                        onChange={(e) => setHoldFields((f) => e.target.checked ? [...f, key] : f.filter((x) => x !== key))} />
                      <span className="ktc-label" style={{ fontSize: 13 }}>{t(lbl)}</span>
                    </label>
                  ))}
                </div>
                <p className="ktc-label" style={{ fontSize: 11.5, opacity: 0.8, marginTop: 6, lineHeight: 1.5 }}>
                  {t('Leave all unticked for a general hold (note only). Ticked fields are the only ones the customer can change on resubmit.')}
                </p>
              </div>
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
          <div className="ktc-glass-thick ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: 24, maxHeight: '88vh', overflowY: 'auto' }}>
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
