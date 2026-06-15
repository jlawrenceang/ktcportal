import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { usePermissions } from '../lib/usePermissions'
import NowServing from '../components/NowServing'
import type { ServingNumber } from '../lib/types'
import { usePageTour } from '../components/TourProvider'
import { checkerSteps } from './AdminTour'
import { useT } from '../lib/i18n'

// X-ray checker station (tablet-first, big touch targets).
//  * Queue: open orders with an X-ray service line, oldest first.
//  * Lookup: search a container/van number or JO number → cleared or not.
//  * "Confirm X-ray done" stamps date/time and completes the order
//    (record_xray RPC — permission-gated server-side).

interface CheckerOrder {
  id: string
  jo_number: string | null
  status: string
  xray_performed_at: string | null
  service_invoice_no: string | null
  rps_status: string | null
  created_at: string
  broker?: { full_name: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: { container_number: string; service_request: string }[]
  serving?: ServingNumber[]
}

// This week's active X-ray line number (the queue sorts by it).
const xrayNo = (o: CheckerOrder) =>
  o.serving?.find((s) => s.service_line === 'xray' && !s.vacated_at)?.serving_no ?? null

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const SELECT =
  'id, jo_number, status, xray_performed_at, service_invoice_no, rps_status, created_at, broker:customers(full_name), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), serving:serving_numbers(service_line, serving_no, week_start, vacated_at)'

const isXray = (s: string) => s.toLowerCase().includes('x-ray')

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
  const { can } = usePermissions()
  usePageTour('checker', checkerSteps)
  const [queue, setQueue] = useState<CheckerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CheckerOrder[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // RPS assessment (operations / admin). Move types + rates come from move_rates.
  const [moveRates, setMoveRates] = useState<{ move_type: string; rate: number }[]>([])
  const [assessId, setAssessId] = useState<string | null>(null)
  const [moves, setMoves] = useState<Record<string, number>>({})
  const [rpsFile, setRpsFile] = useState<File | null>(null)
  const [assessBusy, setAssessBusy] = useState(false)
  useEffect(() => {
    void supabase.from('move_rates').select('move_type, rate').eq('active', true).order('sort_order')
      .then(({ data }) => setMoveRates(((data ?? []) as { move_type: string; rate: number }[]).map((m) => ({ ...m, rate: Number(m.rate) }))))
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
      .select(SELECT)
      .in('status', ['submitted', 'processing', 'on_hold'])
      .order('created_at', { ascending: true })
    const rows = ((data ?? []) as unknown as CheckerOrder[])
      .map((o) => ({ ...o, broker: one(o.broker), consignee: one(o.consignee) }))
      // X-ray still pending (a JO with other services can stay open after its
      // X-ray is done — it leaves this queue but remains findable via lookup)
      .filter((o) => (o.lines ?? []).some((l) => isXray(l.service_request)) && !o.xray_performed_at)
      .sort((a, b) => (xrayNo(a) ?? Infinity) - (xrayNo(b) ?? Infinity)) // serve in line order
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

  async function confirmXray(id: string) {
    setBusyId(id); setError(null)
    const { error: rpcErr } = await supabase.rpc('record_xray', { p_id: id })
    setBusyId(null); setConfirmId(null)
    if (rpcErr) { setError(rpcErr.message); return }
    setQuery(''); setResults(null)
    await load()
  }

  function OrderCard({ o, highlight }: { o: CheckerOrder; highlight?: boolean }) {
    const xrayLines = (o.lines ?? []).filter((l) => isXray(l.service_request))
    const confirmable = can('confirm_xray') && !o.xray_performed_at && ['submitted', 'processing', 'on_hold'].includes(o.status)
    return (
      <div style={{
        padding: '16px 18px', borderRadius: 16, background: 'var(--c-w60)',
        border: highlight ? '1px solid rgb(var(--acc-rgb) / 0.45)' : '1px solid var(--glass-brd)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {xrayNo(o) != null && (
            <span className="ktc-mono" style={{ fontSize: 21, fontWeight: 700, color: 'var(--acc-2)', letterSpacing: '-0.01em' }}>
              #{xrayNo(o)}
            </span>
          )}
          <b className="ktc-mono" style={{ fontSize: 17 }}>{o.jo_number ?? '—'}</b>
          <Clearance o={o} />
          <span className="ktc-label" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            {t('filed {date}', { date: new Date(o.created_at).toLocaleDateString() })}
          </span>
        </div>
        <div className="ktc-label" style={{ fontSize: 13.5, marginTop: 6 }}>
          {o.broker?.full_name || t('Unknown customer')} · {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('no consignee')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {(xrayLines.length ? xrayLines : o.lines ?? []).map((l, i) => (
            <span key={i} className="ktc-mono" style={{ fontSize: 13.5, fontWeight: 600, padding: '6px 12px', borderRadius: 9, background: 'var(--c-w70)', border: '1px solid var(--glass-brd)' }}>
              {l.container_number}
              <span className="ktc-label" style={{ fontSize: 11, marginLeft: 8, fontFamily: 'var(--font-sans)' }}>{l.service_request}</span>
            </span>
          ))}
        </div>
        {confirmable && (
          <div style={{ marginTop: 14 }}>
            {confirmId === o.id ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Confirm X-ray done now ({time})?', { time: new Date().toLocaleTimeString() })}</span>
                <button className="ktc-btn" style={{ width: 'auto', padding: '12px 22px', fontSize: 15 }} disabled={busyId === o.id}
                  onClick={() => void confirmXray(o.id)}>
                  {busyId === o.id ? t('Saving…') : t('✓ Yes — X-ray done')}
                </button>
                <button className="ktc-btn-secondary" style={{ padding: '12px 18px' }} onClick={() => setConfirmId(null)}>{t('Back')}</button>
              </div>
            ) : (
              <button className="ktc-btn" style={{ width: 'auto', padding: '13px 26px', fontSize: 15 }} onClick={() => setConfirmId(o.id)}>
                {t('✓ Confirm X-ray done')}
              </button>
            )}
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
                      {t(m.move_type)} <span style={{ fontSize: 10, opacity: 0.7 }}>{t('₱{rate}/move', { rate: m.rate.toFixed(2) })}</span>
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

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('X-ray Checker')}</h1>
          <p className="ktc-sub">{t("Confirm completed X-rays · look up a van's clearance before release.")}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--acc-2)', padding: '11px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>
          {error}
        </div>
      )}

      <NowServing only={['xray']} />

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

      {/* Pending X-ray queue */}
      <div className="ktc-glass" style={{ padding: 22 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>
          {t('X-ray line — {count} waiting', { count: loading ? '…' : queue.length })}
        </h2>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {loading ? (
            [72, 72].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 16 }} />)
          ) : queue.length === 0 ? (
            <span className="ktc-label" style={{ fontSize: 14 }}>{t('Queue is clear. 🎉')}</span>
          ) : (
            queue.map((o) => <OrderCard key={o.id} o={o} />)
          )}
        </div>
      </div>
    </AdminShell>
  )
}
