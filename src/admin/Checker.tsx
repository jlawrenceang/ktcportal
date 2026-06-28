import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePermissions } from '../lib/usePermissions'
import { batchLabel, formatAge } from '../lib/batch'
import XrayQueueTable, { type QueueRow } from '../components/XrayQueueTable'
import { servingKey, servingTag } from '../lib/serving'
import NowServing from '../components/NowServing'
import { usePageTour } from '../components/TourProvider'
import { checkerSteps } from './AdminTour'
import { useT } from '../lib/i18n'

// X-ray checker station (tablet-first, big touch targets).
//  * Queue: open orders with an X-ray service line, oldest first.
//  * Lookup: search a container/van number or JO number → cleared or not.
//  * "Confirm X-ray done" stamps date/time and completes the order
//    (record_van_xray RPC — permission-gated server-side).

interface CheckerOrder {
  id: string
  jo_number: string | null
  status: string
  is_rexray?: boolean | null
  rexray_status?: string | null
  xray_performed_at: string | null
  service_invoice_no: string | null
  rps_status: string | null
  created_at: string
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: { id: string; container_number: string; service_request: string; xray_done_at: string | null; xray_done_by_name: string | null }[]
  serving?: { service_line: string; serving_no: number; vacated_at: string | null }[]
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const SELECT =
  'id, jo_number, status, is_rexray, rexray_status, xray_performed_at, service_invoice_no, rps_status, created_at, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(id, container_number, service_request, xray_done_at, xray_done_by_name), serving:serving_numbers(service_line, serving_no, vacated_at)'

const isXray = (s: string) => s.toLowerCase().includes('x-ray')
// Priority lane is served ahead of the regular queue, then re-X-ray — shared with
// the app checker + queue table via lib/serving so all three agree.

function Clearance({ o }: { o: CheckerOrder }) {
  const { t } = useT()
  if (o.xray_performed_at) {
    return (
      <span className="ktc-chip ktc-chip--success">
        {t('CLEARED')} · {new Date(o.xray_performed_at).toLocaleString()}
      </span>
    )
  }
  if (['submitted', 'processing', 'on_hold'].includes(o.status)) {
    return <span className="ktc-chip ktc-chip--danger">{t('NOT CLEARED · X-ray pending')}</span>
  }
  return <span className="ktc-chip">{t(o.status)}</span>
}

export default function Checker() {
  const { t } = useT()
  const { can, loading: permLoading } = usePermissions()
  usePageTour('checker', checkerSteps)
  const [queue, setQueue] = useState<CheckerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CheckerOrder[] | null>(null)
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; container: string; jo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'cards'>('table')

  // RPS assessment (operations / admin). Move types + rates come from move_rates.
  // rate may be null (not configured yet) — render "—", never null.toFixed().
  const [moveRates, setMoveRates] = useState<{ move_type: string; rate: number | null }[]>([])
  const [assessId, setAssessId] = useState<string | null>(null)
  const [moves, setMoves] = useState<Record<string, number>>({})
  const [rpsFile, setRpsFile] = useState<File | null>(null)
  const [assessBusy, setAssessBusy] = useState(false)
  useEffect(() => {
    void supabase.from('move_rates').select('move_type, rate').eq('active', true).order('sort_order')
      .then(({ data }) => setMoveRates(((data ?? []) as { move_type: string; rate: number | null }[]).map((m) => ({ ...m, rate: m.rate == null ? null : Number(m.rate) }))))
  }, [])

  async function saveAssessment(jo: string, needed: boolean) {
    setAssessBusy(true); setError(null)
    let path: string | null = null
    if (needed && rpsFile) {
      const name = `${jo}/${Date.now()}-${rpsFile.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('rps-docs').upload(name, rpsFile, { upsert: true })
      if (upErr) { setAssessBusy(false); setError(upErr.message); return }
      path = name
    }
    const movesObj = needed ? Object.fromEntries(Object.entries(moves).filter(([, v]) => v > 0)) : {}
    const { error: rpcErr } = await supabase.rpc('record_rps_assessment', { p_jo: jo, p_needed: needed, p_path: path, p_moves: movesObj })
    setAssessBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setAssessId(null); setMoves({}); setRpsFile(null)
    await load()
  }

  async function load() {
    const { data } = await supabase
      .from('job_orders')
      // KTC-16: only ACCEPTED orders (processing/on_hold) — a still-submitted
      // order hasn't cleared the ops accept gate, so it isn't the checker's yet.
      .select(SELECT)
      .in('status', ['processing', 'on_hold'])
      .order('created_at', { ascending: true })
    const rows = ((data ?? []) as unknown as CheckerOrder[])
      .map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) }))
      // X-ray still pending (a JO with other services can stay open after its
      // X-ray is done — it leaves this queue but remains findable via lookup)
      .filter((o) => (o.lines ?? []).some((l) => isXray(l.service_request) && !l.xray_done_at))
      // KTC-26: an unapproved re-X-ray child can't be acted on — keep it out of the queue.
      .filter((o) => !(o.is_rexray && o.rexray_status !== 'approved'))
      // Serve the priority lane first, then the regular queue by serving number (not raw filing order).
      .sort((a, b) => servingKey(a.serving) - servingKey(b.serving))
    setQueue(rows)
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { refresh, cooling } = useAutoRefresh(load)

  // Container / JO lookup — answers "is this van cleared for release?"
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setResults(null); return }
    const handle = setTimeout(async () => {
      const byJo = supabase.from('job_orders').select(SELECT).ilike('jo_number', `%${q}%`).limit(10)
      const byContainer = supabase
        .from('job_order_lines')
        .select('job_order:job_orders(' + SELECT + ')')
        .ilike('container_number', `%${q}%`)
        .limit(20)
      const [j, c] = await Promise.all([byJo, byContainer])
      const found = new Map<string, CheckerOrder>()
      for (const row of (j.data ?? []) as unknown as CheckerOrder[]) found.set(row.id, row)
      for (const row of (c.data ?? []) as unknown as { job_order: CheckerOrder | CheckerOrder[] | null }[]) {
        const jo = one(row.job_order)
        if (jo) found.set(jo.id, jo)
      }
      setResults(Array.from(found.values()).map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) })))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  async function confirmVan(lineId: string) {
    setBusyLine(lineId); setError(null)
    const { error: rpcErr } = await supabase.rpc('record_van_xray', { p_line_id: lineId })
    setBusyLine(null); setConfirmTarget(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setQuery(''); setResults(null)
    await load()
  }

  // Re-X-ray: request on a COMPLETED order (found via lookup) → admin approves → child JO.
  // Mirrors AllJobOrders; the checker holds request_rexray but otherwise has no station for it.
  const [rexrayBusy, setRexrayBusy] = useState<string | null>(null)
  async function requestRexray(id: string) {
    if (!window.confirm(t('Request a re-X-ray for this completed order? It creates a suffixed child order (e.g. JO-000001A) for admin approval.'))) return
    setRexrayBusy(id); setError(null)
    const { error: rpcErr } = await supabase.rpc('request_rexray', { p_parent: id })
    setRexrayBusy(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setQuery(''); setResults(null)
    await load()
  }

  function OrderCard({ o, highlight }: { o: CheckerOrder; highlight?: boolean }) {
    const xrayLines = (o.lines ?? []).filter((l) => isXray(l.service_request))
    const open = ['submitted', 'processing', 'on_hold'].includes(o.status)
    const lane = servingTag(o.serving)
    // A re-X-ray child not yet approved can't be confirmed (record_van_xray rejects it).
    // The queue already excludes these; this guards the lookup path (T2-20).
    const rexrayPending = !!o.is_rexray && o.rexray_status !== 'approved'
    return (
      <div style={{
        padding: '16px 18px', borderRadius: 16, background: 'var(--c-w60)',
        border: highlight ? '1px solid rgb(var(--acc-rgb) / 0.45)' : '1px solid var(--glass-brd)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {lane && <span className="ktc-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--acc-2)' }}>{lane}</span>}
          <b className="ktc-mono" style={{ fontSize: 17 }}>{o.jo_number ?? '—'}</b>
          <Clearance o={o} />
          <span className="ktc-chip" style={{ fontSize: 11 }}>{t('Batch')}: {batchLabel(o.created_at, t)}</span>
          <span className="ktc-label" style={{ fontSize: 12.5, marginLeft: 'auto' }} title={t('X-ray working hours (9 AM–7 PM) since filed')}>
            {t('Open {age}', { age: formatAge(o.created_at) })}
          </span>
        </div>
        <div className="ktc-label" style={{ fontSize: 13.5, marginTop: 6 }}>
          {o.broker?.full_name || t('Unknown customer')} · {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
        </div>
        {/* Per-van X-ray — tap a van to mark ITS X-ray done (logs date/time). */}
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {xrayLines.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 11, background: 'var(--c-w70)', border: '1px solid var(--glass-brd)' }}>
              <span className="ktc-mono" style={{ fontSize: 15, fontWeight: 600 }}>{l.container_number}</span>
              <span className="ktc-label" style={{ fontSize: 11.5 }}>{l.service_request}</span>
              {l.xray_done_at ? (
                <span className="ktc-chip ktc-chip--success" style={{ marginLeft: 'auto' }}>
                  ✓ {t('X-ray confirmed')} · {new Date(l.xray_done_at).toLocaleString()}{l.xray_done_by_name ? ` · ${t('by {name}', { name: l.xray_done_by_name })}` : ''}
                </span>
              ) : !open ? (
                <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t(o.status)}</span>
              ) : rexrayPending ? (
                <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t('Re-X-ray — awaiting admin approval')}</span>
              ) : o.status === 'submitted' ? (
                <span className="ktc-chip" style={{ marginLeft: 'auto' }}>{t('Awaiting ops acceptance')}</span>
              ) : can('confirm_xray') ? (
                <button className="ktc-btn ktc-btn--sm" style={{ marginLeft: 'auto' }}
                  onClick={() => setConfirmTarget({ id: l.id, container: l.container_number, jo: o.jo_number ?? '—' })}>
                  ✓ {t('Confirm X-ray')}
                </button>
              ) : (
                <span className="ktc-chip ktc-chip--danger" style={{ marginLeft: 'auto' }}>{t('X-ray pending')}</span>
              )}
            </div>
          ))}
        </div>
        {can('request_rexray') && o.status === 'completed' && !o.is_rexray && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--glass-brd)' }}>
            <button className="ktc-btn-secondary ktc-btn--sm" disabled={rexrayBusy === o.id} onClick={() => void requestRexray(o.id)}>
              {rexrayBusy === o.id ? t('Requesting…') : t('Request re-X-ray')}
            </button>
          </div>
        )}
        {can('assess_rps') && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--glass-brd)' }}>
            {assessId === o.id ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('RPS / port-services moves for this JO')}</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {moveRates.map((m) => (
                    <label key={m.move_type} className="ktc-label" style={{ fontSize: 12, display: 'grid', gap: 3 }}>
                      {t(m.move_type)} <span style={{ fontSize: 10, opacity: 0.7 }}>{m.rate == null ? t('rate not set') : t('₱{rate}/move', { rate: m.rate.toFixed(2) })}</span>
                      <input className="ktc-input" type="number" min="0" value={moves[m.move_type] ?? ''}
                        onChange={(e) => setMoves({ ...moves, [m.move_type]: Number(e.target.value) })} style={{ width: 84, padding: '6px 8px' }} />
                    </label>
                  ))}
                </div>
                <label className="ktc-label" style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                  {t('RPS document (optional)')}
                  <input className="ktc-input" type="file" accept="image/*,.pdf" onChange={(e) => setRpsFile(e.target.files?.[0] ?? null)} style={{ padding: '8px 10px' }} />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="ktc-btn ktc-btn--sm" disabled={assessBusy} onClick={() => void saveAssessment(o.id, true)}>{t('Save — needs RPS')}</button>
                  <button className="ktc-btn-secondary ktc-btn--sm" disabled={assessBusy} onClick={() => void saveAssessment(o.id, false)}>{t('No RPS needed')}</button>
                  <button className="ktc-link" onClick={() => { setAssessId(null); setMoves({}); setRpsFile(null) }}>{t('Cancel')}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {o.rps_status === 'needed' && <span className="ktc-chip ktc-chip--danger">{t('RPS needed')}</span>}
                {o.rps_status === 'not_needed' && <span className="ktc-chip ktc-chip--success">{t('No RPS')}</span>}
                <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setAssessId(o.id); setMoves({}); setRpsFile(null) }}>
                  {o.rps_status && o.rps_status !== 'not_assessed' ? t('Re-assess RPS') : t('Assess RPS')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Flat list of containers (vans) still needing X-ray — the working log. Carry
  // the order's serving lane onto each row so the table can show + sort by lane.
  const vanRows: QueueRow[] = queue.flatMap((o) =>
    (o.lines ?? []).filter((l) => isXray(l.service_request) && !l.xray_done_at)
      .map((l) => ({ lineId: l.id, container: l.container_number, jo_number: o.jo_number, consignee: o.consignee ?? null, created_at: o.created_at, lane: servingTag(o.serving), laneRank: servingKey(o.serving) })))

  if (!permLoading && !can('view_xray_queue')) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 24 }}>
          <p className="ktc-label" style={{ fontSize: 14 }}>{t('No access to the X-ray queue.')}</p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <NowServing />
      <div style={{ margin: '14px 4px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('X-ray Queue')}</h1>
          <p className="ktc-sub">{t('Plan the X-ray line by JO order and age; the checker confirms each van.')}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>
          {error}
        </div>
      )}

      {/* Lookup */}
      <div className="ktc-glass" style={{ padding: 22, marginBottom: 18 }}>
        <label className="ktc-label" htmlFor="lookup" style={{ fontWeight: 600 }}>{t('Check a container / van or JO number')}</label>
        <input
          id="lookup"
          className="ktc-input ktc-mono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('e.g. TCLU1234567 or JO-000123')}
          autoComplete="off"
          style={{ marginTop: 8, fontSize: 17, padding: '14px 16px' }}
        />
        {results && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {results.length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 14 }}>{t('No job order found for “{query}”. No X-ray request on file.', { query: query.trim() })}</span>
            ) : (
              results.map((o) => <OrderCard key={o.id} o={o} highlight />)
            )}
          </div>
        )}
      </div>

      {/* Pending X-ray — container table (sort by JO no. = true log order, or by age) */}
      <div className="ktc-glass" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>
            {t('To X-ray — {count} container(s)', { count: loading ? '…' : vanRows.length })}
          </h2>
          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
            <button type="button" className={`ktc-btn ktc-btn--sm ${view === 'table' ? '' : 'ktc-btn-ghost'}`} aria-pressed={view === 'table'} onClick={() => setView('table')}>{t('Table')}</button>
            <button type="button" className={`ktc-btn ktc-btn--sm ${view === 'cards' ? '' : 'ktc-btn-ghost'}`} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>{t('Cards')}</button>
          </div>
        </div>
        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>{[60, 60].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)}</div>
        ) : vanRows.length === 0 ? (
          <span className="ktc-label" style={{ fontSize: 14 }}>{t('Queue is clear.')}</span>
        ) : view === 'cards' ? (
          <div style={{ display: 'grid', gap: 10 }}>{queue.map((o) => <OrderCard key={o.id} o={o} />)}</div>
        ) : (
          <XrayQueueTable rows={vanRows} canConfirm={can('confirm_xray')}
            onConfirm={(r) => setConfirmTarget({ id: r.lineId, container: r.container, jo: r.jo_number ?? '—' })} />
        )}
      </div>
      {confirmTarget && (
        <div className="ktc-modal-backdrop" onClick={() => { if (!busyLine) setConfirmTarget(null) }}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{t('Confirm X-ray?')}</h3>
            <p className="ktc-label" style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 16px' }}>
              {t('Confirm that container {c} ({jo}) has entered the X-ray division for BOC X-ray. This records your e-signature with the date and time.', { c: confirmTarget.container, jo: confirmTarget.jo })}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="ktc-btn" style={{ width: 'auto', padding: '11px 22px' }} disabled={!!busyLine}
                onClick={() => void confirmVan(confirmTarget.id)}>{busyLine ? t('Saving…') : t('✓ Yes, confirm')}</button>
              <button className="ktc-btn-secondary" style={{ padding: '11px 18px' }} disabled={!!busyLine} onClick={() => setConfirmTarget(null)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
