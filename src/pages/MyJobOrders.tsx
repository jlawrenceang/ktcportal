import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import type { JobOrder } from '../lib/types'
import { chargeState } from '../lib/charges'
import { usePageTour } from '../components/TourProvider'
import { myJobOrdersSteps } from '../components/WelcomeTour'
import { useBroker } from '../lib/useBroker'
import JoTimeline from '../components/JoTimeline'
import EditJobOrderForm from '../components/EditJobOrderForm'
import JobOrderCharges from '../components/JobOrderCharges'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees } from '../lib/pickerSearches'
import { formatEntryNumberInput, isCompleteEntryNumber, normalizeEntryNumber } from '../lib/entryNumber'
import { useT } from '../lib/i18n'

// Post-cutover billing (ADR-0037): an order's pay state derives entirely from its
// `charges` rows — the retired payment_status / supplement columns are gone. We
// embed the minimal charge fields chargeState needs onto each row.
type ChargeLite = { bill_status: string; payment_status: string }
type JoRow = JobOrder & { charges?: ChargeLite[] | null }

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  processing: 'Approved · processing',
  on_hold: 'On hold · info needed',
  completed: 'Completed',
  rejected: 'Not approved · closed',
  cancelled: 'Cancelled',
}

// Per-status semantic tone, rendered with the shared .ktc-chip classes.
const STATUS_TONE: Record<string, string> = {
  submitted: 'info',
  processing: 'progress',
  on_hold: 'warning',
  completed: 'success',
  rejected: 'danger',
  cancelled: '',
}

// Field-targeted "needs info": the keys staff can flag for re-entry (mirrors 0154).
const FIELD_LABEL: Record<string, string> = {
  consignee: 'Consignee',
  entry: 'Entry Number',
  vessel: 'Vessel & Voyage',
  containers: 'Containers',
}

// Server-side views + pagination — a heavy filer's history stays fast to load
// even after years of orders.
const PAGE = 10
type Filter = 'active' | 'action' | 'completed' | 'closed' | 'all'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'action', label: 'Needs action' },
  { key: 'completed', label: 'Completed' },
  { key: 'closed', label: 'Rejected / cancelled' },
  { key: 'all', label: 'All' },
]
const EMPTY_HINT: Record<Filter, string> = {
  active: 'No active orders right now.',
  action: 'Nothing needs your action.',
  completed: 'No completed orders yet.',
  closed: 'No rejected or cancelled orders.',
  all: 'No job orders yet.',
}

type ViewMode = 'card' | 'list'
type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string }

// Dates render mm/dd/yyyy everywhere on this page.
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT()
  const tone = STATUS_TONE[status]
  return (
    <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>
      {STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status}
    </span>
  )
}

// Unified payment pill — ONE indicator for the whole order's balance, derived
// from every billed charge. Nothing renders before the order has a billed charge.
function PayPill({ o }: { o: JoRow }) {
  const { t } = useT()
  const s = chargeState(o.charges)
  if (s === 'balance') return <span className="ktc-chip ktc-chip--warning">{t('Balance to pay')}</span>
  if (s === 'paid') return <span className="ktc-chip ktc-chip--success">{t('Paid')}</span>
  return null
}

// Compact payment pill for the dense one-line list rows.
function PayPillMini({ o }: { o: JoRow }) {
  const { t } = useT()
  const s = chargeState(o.charges)
  if (s === 'balance') return <span className="ktc-chip ktc-chip--warning" style={{ fontSize: 10.5, padding: '1px 8px', flex: '0 0 auto' }}>{t('Balance')}</span>
  if (s === 'paid') return <span className="ktc-chip ktc-chip--success" style={{ fontSize: 10.5, padding: '1px 8px', flex: '0 0 auto' }}>{t('Paid')}</span>
  return null
}

// Small label/value pair for the detail modal's meta grid.
function Meta({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div style={{ gridColumn: span2 ? '1 / -1' : undefined }}>
      <div className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

// Field-targeted "needs info" resubmit. KTC flags exactly which fields the customer
// must re-enter (consignee / entry / vessel / containers); only those are editable
// here — everything else is locked (the server ignores unflagged fields too). Calls
// the resubmit_needs_info RPC (0154); customers have no UPDATE policy.
function NeedsInfoForm({ order, onDone, onError }: {
  order: JobOrder
  onDone: () => void
  onError: (msg: string) => void
}) {
  const { t } = useT()
  const fields = order.needs_fields ?? []
  const need = (k: string) => fields.includes(k)
  const [note, setNote] = useState('')
  const [consignee, setConsignee] = useState<PickerItem | null>(
    order.consignee_id && order.consignee
      ? { id: order.consignee_id, title: order.consignee.code, sub: order.consignee.name }
      : null,
  )
  const [entry, setEntry] = useState(formatEntryNumberInput(order.entry_number ?? ''))
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [vesselVisit, setVesselVisit] = useState(order.vessel_visit ?? '')
  const [lines, setLines] = useState<LineDraft[]>(
    order.lines?.length ? order.lines.map((l) => ({ container_number: l.container_number, service_request: l.service_request })) : [emptyLine()],
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!need('vessel')) return
    void supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number').eq('is_current', true).order('vessel_name')
      .then(({ data }) => setVessels((data ?? []) as VesselOpt[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    onError('')
    if (!note.trim()) { onError(t('Please describe what you updated or clarified.')); return }
    const payload: Record<string, unknown> = { p_id: order.id, p_note: note.trim() }
    if (need('consignee')) {
      if (!consignee) { onError(t('Select a consignee from the list.')); return }
      payload.p_consignee_id = consignee.id
    }
    if (need('entry')) {
      const normalizedEntry = normalizeEntryNumber(entry)
      if (!isCompleteEntryNumber(normalizedEntry)) { onError(t('Enter the Entry Number starting with C-.')); return }
      payload.p_entry_number = normalizedEntry
    }
    if (need('vessel')) {
      const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
      if (!sel) { onError(t('Select the vessel & voyage from the list.')); return }
      payload.p_vessel_visit = sel.vessel_visit; payload.p_vessel_name = sel.vessel_name.toUpperCase(); payload.p_voyage_number = sel.voyage_number.toUpperCase()
    }
    if (need('containers')) {
      const filled = lines.filter((l) => l.container_number.trim())
      if (!filled.length) { onError(t('Add at least one container.')); return }
      payload.p_lines = filled.map((l) => ({ container_number: l.container_number.trim().toUpperCase(), service_request: l.service_request }))
    }
    setBusy(true)
    const { error } = await supabase.rpc('resubmit_needs_info', payload)
    setBusy(false)
    if (error) { onError(error.message); return }
    onDone()
  }

  const lockedNote = fields.length > 0
    ? t('Only the fields KTC asked for are editable — the rest stay as filed.')
    : t('Reply to KTC below to resubmit this order.')

  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
      <div className="ktc-label" style={{ fontSize: 12 }}>{lockedNote}</div>

      {need('consignee') && (
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ni-consignee">{t('Consignee')} *</label>
          <SearchPicker inputId="ni-consignee" placeholder={t('Search consignee by code or name…')}
            selected={consignee} onSelect={setConsignee} search={searchConsignees} minChars={1} />
        </div>
      )}
      {need('entry') && (
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ni-entry">{t('Entry Number')} *</label>
          <input id="ni-entry" className="ktc-input" value={entry}
            onChange={(e) => setEntry(formatEntryNumberInput(e.target.value))}
            onBlur={() => setEntry((v) => normalizeEntryNumber(v))}
            style={{ textTransform: 'uppercase' }} placeholder={t('e.g. C-0000012345')} />
        </div>
      )}
      {need('vessel') && (
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ni-vessel">{t('Vessel & Voyage')} *</label>
          <select id="ni-vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
            <option value="">{t('Select a vessel…')}</option>
            {vessels.map((v) => (
              <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>
            ))}
          </select>
          <span className="ktc-label" style={{ fontSize: 11.5 }}>
            {t('If the vessel isn’t listed here, please call KTC customer service for updates.')}
          </span>
        </div>
      )}
      {need('containers') && <ContainerLinesEditor lines={lines} onChange={setLines} />}

      <div style={{ display: 'grid', gap: 6 }}>
        <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Your reply to KTC (what did you update or clarify?)')}</label>
        <textarea className="ktc-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Corrected the entry number — see above.')} />
      </div>

      <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submit()} style={{ justifySelf: 'start' }}>
        {busy ? t('Resubmitting…') : t('Resubmit to KTC')}
      </button>
    </div>
  )
}

export default function MyJobOrders() {
  const { t } = useT()
  usePageTour('job-orders', myJobOrdersSteps)
  const { broker } = useBroker()
  const [orders, setOrders] = useState<JoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<JoRow | null>(null) // order shown in the detail modal
  const [containersOpen, setContainersOpen] = useState(false)
  const timelineAnchorRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null) // list-load failure (separate from action errors)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // order being edited inline
  const [cancelId, setCancelId] = useState<string | null>(null) // order pending cancel confirmation
  const [busyId, setBusyId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('ktc_jo_view') as ViewMode) || 'card')
  // Initial view can be deep-linked from the dashboard tiles (?view=action, etc.).
  const [params] = useSearchParams()
  const requestedView = params.get('view')
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.key === requestedView) ? (requestedView as Filter) : 'active',
  )
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  function changeView(v: ViewMode) { setView(v); localStorage.setItem('ktc_jo_view', v) }

  async function cancelOrder(id: string) {
    setBusyId(id); setError(null)
    const { error: rpcErr } = await supabase.rpc('cancel_job_order', { p_id: id })
    setBusyId(null); setCancelId(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setSelected(null)
    await load()
  }

  async function load(f: Filter = filter, p: number = page) {
    let q = supabase
      .from('job_orders')
      .select(
        'id, jo_number, entry_number, consignee_id, vessel_visit, vessel_name, voyage_number, status, admin_note, customer_note, needs_fields, rps_status, completed_at, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), completions:service_completions(service_line, completed_at), charges(bill_status, payment_status)',
        { count: 'exact' },
      )
      .eq('is_rexray', false)   // re-X-ray child orders are internal KTC ops — hide from the customer
    if (f === 'active') q = q.in('status', ['submitted', 'processing', 'on_hold'])
    else if (f === 'action')
      // KTC asked for info. (Per-charge billing actions — a rejected proof or an
      // unpaid charge — now surface inline in JobOrderCharges, not as a list filter.)
      q = q.eq('status', 'on_hold')
    else if (f === 'completed') q = q.eq('status', 'completed')
    else if (f === 'closed') q = q.in('status', ['rejected', 'cancelled'])
    const { data, count, error: loadErr } = await q
      .order('created_at', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1)
    if (loadErr) { setLoadError(loadErr.message); setLoading(false); return }
    setLoadError(null)
    const rows = (data ?? []) as unknown as JoRow[]
    setOrders(rows)
    setTotal(count ?? rows.length)
    setLoading(false)
    setSelected((prev) => (prev ? rows.find((o) => o.id === prev.id) ?? null : null))
    const filedId = sessionStorage.getItem('ktc_jo_filed_id')
    if (filedId) {
      sessionStorage.removeItem('ktc_jo_filed_id')
      const filed = rows.find((o) => o.id === filedId)
      if (filed) setSelected(filed)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(f: Filter) {
    setFilter(f); setPage(0); setLoading(true)
    void load(f, 0)
  }
  function changePage(p: number) {
    setPage(p); setLoading(true)
    void load(filter, p)
  }

  // Statuses auto-refresh every 60s while the tab is visible; the manual
  // button is rate-limited to one pull per 10s.
  const { refresh, cooling } = useAutoRefresh(load)

  function openOrder(o: JoRow) { setSelected(o); setRespondingId(null); setCancelId(null); setContainersOpen(false); setError(null) }

  return (
    <Shell wide>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="ktc-title">{t('My Job Orders')}</h1>
            <p className="ktc-sub" style={{ marginBottom: 0 }}>
              {t('Tap a card to open its full details.')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling} title={cooling ? t('Just refreshed — try again in a few seconds') : t('Refresh statuses (auto-refreshes every minute)')}>
              ↻ {t('Refresh')}
            </button>
            <Link to="/job-order" className="ktc-btn" style={{ width: 'auto', padding: '9px 16px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              + {t('New Job Order')}
            </Link>
          </div>
        </div>

        {error && !selected && (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
            {error}
          </div>
        )}

        {/* Views — server-side filters, 10 per page; plus card/list toggle */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, marginTop: 14 }}>
          <span className="ktc-label" style={{ fontSize: 12.5, fontWeight: 600 }}>{t('Show')}</span>
          <select
            className="ktc-input"
            value={filter}
            onChange={(e) => changeFilter(e.target.value as Filter)}
            style={{ width: 'auto', minWidth: 0, padding: '8px 12px', fontSize: 13 }}
            aria-label={t('Filter job orders')}
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{t(f.label)}</option>
            ))}
          </select>

          <ViewToggle view={view} onChange={changeView} />

          {!loading && total > 0 && (
            <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {t('{total} order(s)', { total })}
            </span>
          )}
        </div>

        <div style={{ marginTop: 4 }}>
          {loading ? (
            <div style={{ display: 'grid', gap: 10 }} aria-label={t('Loading job orders')}>
              {[64, 64, 64].map((h, i) => (
                <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />
              ))}
            </div>
          ) : loadError ? (
            <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{loadError}</Notice>
          ) : orders.length === 0 ? (
            <div className="ktc-label" style={{ fontSize: 14 }}>
              {t(EMPTY_HINT[filter])}{' '}
              {filter === 'all' || filter === 'active' ? (
                <>{t('Create one on the')} <Link to="/job-order" className="ktc-link">{t('New Job Order')}</Link> {t('page.')}</>
              ) : (
                <button type="button" className="ktc-link" onClick={() => changeFilter('all')}>{t('Show all orders')}</button>
              )}
            </div>
          ) : view === 'card' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {orders.map((o) => {
                const count = o.lines?.length ?? 0
                return (
                  <button key={o.id} type="button" className="ktc-jo-zcard" onClick={() => openOrder(o)}>
                    <div className="ktc-jo-zcard-head" style={{ justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                        <b style={{ fontSize: 14, letterSpacing: 0 }}>{o.jo_number ?? o.entry_number ?? '—'}</b>
                        <StatusBadge status={o.status} />
                        <PayPill o={o} />
                      </span>
                      <span className="ktc-label" style={{ fontSize: 12.5, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{fmtDate(o.created_at)}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 3, marginTop: 9, fontSize: 13 }}>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.consignee ? o.consignee.name : t('No consignee')}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.vessel_name ? `${o.vessel_name}${o.voyage_number ? ' · ' + o.voyage_number : ''}` : '—'}</span>
                      <span className="ktc-label" style={{ fontSize: 12.5 }}>{t(count === 1 ? '{count} container van' : '{count} container vans', { count })}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {orders.map((o) => {
                const count = o.lines?.length ?? 0
                const vanLabel = t(count === 1 ? '{count} container van' : '{count} container vans', { count })
                return (
                  <button key={o.id} type="button" className="ktc-jo-litem" onClick={() => openOrder(o)} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 13, flex: '0 0 auto', letterSpacing: 0 }}>{o.entry_number ?? o.jo_number ?? '—'}</b>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.consignee ? o.consignee.name : t('No consignee')}</span>
                    <PayPillMini o={o} />
                    <span title={vanLabel} aria-label={vanLabel}
                      style={{ flex: '0 0 auto', minWidth: 24, height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: 'var(--c-w35)', border: '1px solid var(--glass-brd)', fontSize: 12, fontWeight: 700 }}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, justifyContent: 'center' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={page === 0} onClick={() => changePage(page - 1)}>← {t('Prev')}</button>
            <span className="ktc-label" style={{ fontSize: 12.5 }}>
              {t('{from}–{to} of {total}', { from: page * PAGE + 1, to: Math.min((page + 1) * PAGE, total), total })}
            </span>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={(page + 1) * PAGE >= total} onClick={() => changePage(page + 1)}>{t('Next')} →</button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (() => {
        const o = selected
        const count = o.lines?.length ?? 0
        const close = () => { setSelected(null); setRespondingId(null); setCancelId(null); setEditingId(null); setContainersOpen(false) }
        return (
          <div className="ktc-modal-backdrop" onClick={close}>
            <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                  <b style={{ fontSize: 16, letterSpacing: 0 }}>{o.jo_number ?? o.entry_number ?? '—'}</b>
                  <StatusBadge status={o.status} />
                  <PayPill o={o} />
                </div>
                <button type="button" aria-label={t('Close')} onClick={close}
                  style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
                {error && (
                  <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '9px 12px', borderRadius: 9, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
                    {error}
                  </div>
                )}

                {editingId === o.id ? (
                  <EditJobOrderForm order={o} onError={setError}
                    onCancel={() => { setEditingId(null); setError(null) }}
                    onDone={() => { setEditingId(null); setError(null); void load() }} />
                ) : (
                <>
                {/* Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px 16px', fontSize: 13 }}>
                  <Meta label={t('Consignee')} value={o.consignee ? o.consignee.name : '—'} span2 />
                  <Meta label={t('Entry Number')} value={o.entry_number ?? '—'} />
                  <Meta label={t('Vessel & Voyage')} value={o.vessel_name ? `${o.vessel_name}${o.voyage_number ? ' · ' + o.voyage_number : ''}` : '—'} />
                  <Meta label={t('Date filed')} value={fmtDate(o.created_at)} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setContainersOpen(true)}>
                    {t('Containers')} | {t(count === 1 ? '{count} container van' : '{count} container vans', { count })}
                  </button>
                  <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => timelineAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    {t('Documents submitted')}
                  </button>
                </div>

                {['submitted', 'processing', 'on_hold', 'completed'].includes(o.status) && (
                  <>
                    <div style={{ marginTop: 16 }}><JobOrderCharges jobOrderId={o.id} /></div>
                  </>
                )}

                <div style={{ marginTop: 16 }}>
                  {o.status === 'on_hold' && (
                    <>
                      {o.admin_note && (
                        <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'var(--c-h40-90-96)', border: '1px solid var(--c-h35-85-84)', color: 'var(--c-h30-60-32)' }}>
                          <b>{t('Information needed:')}</b> {o.admin_note}
                          {(o.needs_fields?.length ?? 0) > 0 && (
                            <div style={{ marginTop: 6, fontSize: 12 }}>
                              {t('Please re-enter:')} {o.needs_fields!.map((f) => t(FIELD_LABEL[f] ?? f)).join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                      {respondingId === o.id ? (
                        <NeedsInfoForm order={o} onError={setError}
                          onDone={() => { setRespondingId(null); setError(null); close(); void load() }} />
                      ) : (
                        <button type="button" className="ktc-btn ktc-btn--sm" style={{ display: 'inline-flex', marginBottom: 12 }}
                          onClick={() => { setRespondingId(o.id); setError(null) }}>
                          {t('Respond & resubmit')}
                        </button>
                      )}
                    </>
                  )}
                  {o.status === 'rejected' && (
                    <>
                      {o.admin_note && (
                        <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)', color: 'var(--c-h0-60-40)' }}>
                          <b>{t('Not approved:')}</b> {o.admin_note}
                        </div>
                      )}
                      <div className="ktc-label" style={{ fontSize: 12.5, marginBottom: 12 }}>
                        {t('This order is closed. If you still need it, please')} <Link to="/job-order" className="ktc-link">{t('file a new job order')}</Link>.
                      </div>
                    </>
                  )}
                  {o.customer_note && (o.status === 'submitted' || o.status === 'processing') && (
                    <div className="ktc-label" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      {t('Your note to KTC:')} “{o.customer_note}”
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {o.status === 'submitted' && (
                      <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ display: 'inline-flex' }}
                        onClick={() => { setEditingId(o.id); setError(null) }}>
                        {t('Edit order')}
                      </button>
                    )}
                    {!['rejected', 'cancelled'].includes(o.status) && (
                      <Link to={`/job-order/${o.id}/print`} target="_blank" className="ktc-btn ktc-btn--sm" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                        {t('Print slip')} ↗
                      </Link>
                    )}
                  </div>

                  {/* Containers */}
                  <div style={{ marginTop: 16 }}>
                    <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Containers')} · {t(count === 1 ? '{count} container van' : '{count} container vans', { count })}</span>
                    {count === 0 ? (
                      <div className="ktc-label" style={{ fontSize: 13, marginTop: 6 }}>{t('No containers on this order.')}</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                        {o.lines!.map((l, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                            <span className="ktc-mono" style={{ fontWeight: 600 }}>{l.container_number}</span>
                            <span className="ktc-label" style={{ fontSize: 12.5 }}>{t(l.service_request)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timeline: lifecycle + supporting docs + two-way comments. */}
                  <div ref={timelineAnchorRef}>
                    <JoTimeline
                      orderId={o.id}
                      userId={broker?.user_id ?? ''}
                      canComment
                      canAttach={['submitted', 'processing', 'on_hold'].includes(o.status)}
                    />
                  </div>

                  {/* Cancel — only before processing starts (submitted/on_hold). */}
                  {['submitted', 'on_hold'].includes(o.status) && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--glass-brd)' }}>
                      {cancelId === o.id ? (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: 'var(--acc-2)' }}>{t('Cancel this order? This can’t be undone.')}</span>
                          <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={busyId === o.id}
                            onClick={() => void cancelOrder(o.id)}>
                            {busyId === o.id ? t('Cancelling…') : t('Yes, cancel it')}
                          </button>
                          <button type="button" className="ktc-link" onClick={() => setCancelId(null)}>{t('Keep it')}</button>
                        </div>
                      ) : (
                        <button type="button" className="ktc-link" style={{ fontSize: 12.5, opacity: 0.85 }} onClick={() => setCancelId(o.id)}>
                          {t('Cancel this order')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                </>
                )}
              </div>
            </div>
            {containersOpen && (
              <div className="ktc-modal-backdrop" onClick={(e) => { e.stopPropagation(); setContainersOpen(false) }} style={{ zIndex: 2147482600 }}>
                <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', maxWidth: 430, maxHeight: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--glass-brd)' }}>
                    <b style={{ fontSize: 15 }}>{t('Containers')} | {t(count === 1 ? '{count} container van' : '{count} container vans', { count })}</b>
                    <button type="button" aria-label={t('Close')} onClick={() => setContainersOpen(false)}
                      style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>×</button>
                  </div>
                  <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gap: 8 }}>
                    {(o.lines ?? []).map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                        <span className="ktc-mono" style={{ fontWeight: 600 }}>{l.container_number}</span>
                        <span className="ktc-label" style={{ fontSize: 12.5 }}>{t(l.service_request)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </Shell>
  )
}

// Small segmented Cards/List toggle.
function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useT()
  const opt = (v: ViewMode, label: string) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={view === v}
      className={view === v ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'}
      style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}>
      {label}
    </button>
  )
  return (
    <span style={{ display: 'inline-flex', gap: 4 }} role="group" aria-label={t('View')}>
      {opt('card', t('Cards'))}
      {opt('list', t('List'))}
    </span>
  )
}
