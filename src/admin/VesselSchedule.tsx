import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePageTour } from '../components/TourProvider'
import { vesselSteps } from './AdminTour'
import { MonthCalendar, Badge, fmt, fmtDT, type VesselRow } from '../components/VesselCalendar'
import { useT } from '../lib/i18n'

// ── Vessel schedule (operations) ──────────────────────────────────────────
// Reads vessel_schedule_v: last_free_day + is_current are computed server-side
// (finish_discharging + the line's import free-days; current = last_free_day ≥
// today). Operations add/edit calls one-by-one; bulk data flows in from the
// Google Sheet sync (the CSV import + template were removed — the Sheet is the
// single bulk driver now). Free-days per line are set by ADMIN in Settings.

const COLUMNS = ['shipping_line', 'vessel_name', 'voyage_number', 'actual_arrival', 'arrival_time', 'finish_discharging', 'discharge_time', 'departure', 'departure_time', 'berth', 'week', 'remarks'] as const
type Col = (typeof COLUMNS)[number]

const blankForm = (): Record<Col, string> => ({
  shipping_line: '', vessel_name: '', voyage_number: '', actual_arrival: '', arrival_time: '',
  finish_discharging: '', discharge_time: '', departure: '', departure_time: '', berth: '', week: '', remarks: '',
})

// vessel_visit is no longer entered — derive the stable key JOs link on from
// vessel name + voyage + a call discriminator (week, else arrival), mirroring the
// sync's deriveVisit so distinct weekly calls don't collide.
const deriveVisit = (name: string, voy: string, disc: string) => `${name} ${voy} ${disc}`.trim().toUpperCase().replace(/\s+/g, ' ')

// Accept YYYY-MM-DD or M/D/YYYY → normalize to YYYY-MM-DD (or '' if blank/bad).
function normDate(s: string): string | null | undefined {
  const t = (s ?? '').trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return undefined // unparseable
}

function friendly(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === '23505') return 'A call with that Vessel Visit code already exists.'
  return e?.message ?? 'Something went wrong.'
}

export default function VesselSchedule() {
  const { t } = useT()
  usePageTour('vessels', vesselSteps)
  const [rows, setRows] = useState<VesselRow[]>([])
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'table' | 'calendar'>('table')
  const [form, setForm] = useState<Record<Col, string>>(blankForm())
  const [editing, setEditing] = useState<string | null>(null) // row id being edited
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Pending vessel requests (unlisted vessels customers/admins filed against).
  type VesselReq = { id: string; vessel_name: string; voyage_number: string; waiting_count: number; created_at: string }
  const [reqs, setReqs] = useState<VesselReq[]>([])
  const [reqLink, setReqLink] = useState<Record<string, string>>({}) // request id → chosen vessel_visit
  const [reqBusy, setReqBusy] = useState<string | null>(null)

  async function loadReqs() {
    const { data } = await supabase.rpc('pending_vessel_requests')
    setReqs((data as VesselReq[]) ?? [])
  }

  async function load() {
    setLoading(true)
    const [{ data: v }, { data: sl }] = await Promise.all([
      supabase.from('vessel_schedule_v').select('*').order('actual_arrival', { ascending: false, nullsFirst: true }),
      supabase.from('shipping_lines').select('name').order('name'),
    ])
    setRows((v as VesselRow[]) ?? [])
    setLines((sl ?? []).map((r: { name: string }) => r.name))
    setLoading(false)
    void loadReqs()
  }
  useEffect(() => { void load() }, [])

  // Manual "Sync now" — fire the same Edge Function the hourly cron runs: pulls
  // the Google Sheet's edits in + pushes the Last Free Day mirror back out. The
  // secret stays server-side (trigger_vessel_sync RPC, gated on permission);
  // pg_net is async, so we reload after a short beat.
  async function syncNow() {
    setErr(null); setMsg(null); setSyncing(true)
    const { data, error } = await supabase.rpc('trigger_vessel_sync')
    if (error) { setSyncing(false); setErr(friendly(error)); return }
    if (data === 'not_configured') { setSyncing(false); setErr(t('Vessel sync isn’t configured yet — contact the owner.')); return }
    setMsg(t('Syncing from the Google Sheet… the list refreshes in a few seconds.'))
    window.setTimeout(() => { setSyncing(false); void load() }, 6000)
  }

  async function approveReq(r: VesselReq) {
    const visit = (reqLink[r.id] ?? '').trim()
    if (!visit) { setErr(t('Pick the scheduled call to link “{name}” to (add it above first if needed).', { name: r.vessel_name })); return }
    setReqBusy(r.id); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('review_vessel_request', { p_id: r.id, p_action: 'approve', p_vessel_visit: visit })
    setReqBusy(null)
    if (error) { setErr(friendly(error)); return }
    setMsg(t('Vessel approved — {n} job order(s) linked.', { n: r.waiting_count }))
    void load()
  }

  async function rejectReq(r: VesselReq) {
    const note = window.prompt(t('Reject “{name}” — reason (optional, shown to ops only):', { name: r.vessel_name }), '')
    if (note === null) return // cancelled
    setReqBusy(r.id); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('review_vessel_request', { p_id: r.id, p_action: 'reject', p_note: note.trim() || null })
    setReqBusy(null)
    if (error) { setErr(friendly(error)); return }
    setMsg(t('Vessel request rejected.'))
    void loadReqs()
  }

  const visible = useMemo(() => (showAll ? rows : rows.filter((r) => r.is_current)), [rows, showAll])

  function startEdit(r: VesselRow) {
    setEditing(r.id)
    setForm({
      shipping_line: r.shipping_line ?? '', vessel_name: r.vessel_name, voyage_number: r.voyage_number,
      actual_arrival: r.actual_arrival ?? '', arrival_time: r.arrival_time ?? '',
      finish_discharging: r.finish_discharging ?? '', discharge_time: r.discharge_time ?? '',
      departure: r.departure ?? '', departure_time: r.departure_time ?? '',
      berth: r.berth ?? '', week: r.week != null ? String(r.week) : '', remarks: r.remarks ?? '',
    })
    setErr(null); setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function resetForm() { setEditing(null); setForm(blankForm()); setErr(null) }

  async function save(e: FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (!form.vessel_name.trim() || !form.voyage_number.trim()) {
      setErr(t('Vessel Name and Voyage Number are required.')); return
    }
    const aa = normDate(form.actual_arrival), fd = normDate(form.finish_discharging), dp = normDate(form.departure)
    if (aa === undefined || fd === undefined || dp === undefined) { setErr(t('Dates must be YYYY-MM-DD or M/D/YYYY.')); return }
    const wkRaw = form.week.trim(); const wk = wkRaw ? parseInt(wkRaw, 10) : null
    setSaving(true)
    // vessel_visit is set ONLY on insert (immutable thereafter) so a later
    // name/voyage correction can't re-derive the key and orphan linked JOs.
    const payload = {
      vessel_name: form.vessel_name.trim(), voyage_number: form.voyage_number.trim(),
      shipping_line: form.shipping_line.trim() || null,
      actual_arrival: aa, arrival_time: form.arrival_time.trim() || null,
      finish_discharging: fd, discharge_time: form.discharge_time.trim() || null,
      departure: dp, departure_time: form.departure_time.trim() || null,
      berth: form.berth.trim() || null, week: wk != null && Number.isFinite(wk) ? wk : null,
      remarks: form.remarks.trim() || null,
    }
    const disc = wk != null && Number.isFinite(wk) ? `W${wk}` : (aa || '')
    const { error } = editing
      ? await supabase.from('vessel_schedule').update(payload).eq('id', editing)
      : await supabase.from('vessel_schedule').upsert(
          { ...payload, vessel_visit: deriveVisit(form.vessel_name, form.voyage_number, disc) },
          { onConflict: 'vessel_visit' })
    setSaving(false)
    if (error) { setErr(friendly(error)); return }
    setMsg(editing ? t('Call updated.') : t('Call added.'))
    resetForm(); void load()
  }

  async function toggleCancel(r: VesselRow) {
    const { error } = await supabase.from('vessel_schedule').update({ cancelled: !r.cancelled }).eq('id', r.id)
    if (error) setErr(friendly(error)); else void load()
  }

  // Snapshot of the active vessels as a branded PNG — for Viber group updates.
  function buildSnapshot(): HTMLCanvasElement {
    const active = rows.filter((r) => r.is_current && !r.cancelled)
      .sort((a, b) => (a.actual_arrival ?? '').localeCompare(b.actual_arrival ?? ''))
    const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
    const cols: [string, number][] = [['LINE', 20], ['VESSEL', 140], ['VOYAGE', 360], ['ARRIVAL', 450], ['LAST FREE DAY', 575], ['BERTH', 770]]
    const W = 840, headerH = 64, rowH = 30
    const H = headerH + 44 + active.length * rowH + 30
    const scale = 2
    const cv = document.createElement('canvas')
    cv.width = W * scale; cv.height = H * scale
    const ctx = cv.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#F26A21'; ctx.fillRect(0, 0, W, headerH)
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'
    ctx.fillText(t('KTC — Active Vessels'), 20, 30)
    ctx.font = '13px sans-serif'
    const today = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    ctx.fillText(t('As of {date} · {count} vessel(s)', { date: today, count: active.length }), 20, 50)
    let yTop = headerH + 24
    ctx.fillStyle = '#888888'; ctx.font = 'bold 11px sans-serif'
    cols.forEach(([label, x]) => ctx.fillText(t(label), x, yTop))
    yTop += 12
    active.forEach((r, i) => {
      if (i % 2 === 1) { ctx.fillStyle = '#f4f5f7'; ctx.fillRect(0, yTop, W, rowH) }
      const base = yTop + 20
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#1a1a1a'
      ctx.fillText(trunc(r.shipping_line ?? '—', 16), 20, base)
      ctx.fillText(trunc(r.vessel_name, 26), 140, base)
      ctx.fillText(r.voyage_number, 360, base)
      ctx.fillText(fmt(r.actual_arrival), 450, base)
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#D6321E'
      ctx.fillText(r.last_free_day ? fmt(r.last_free_day) : '—', 575, base)
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#1a1a1a'
      ctx.fillText(r.berth ?? '—', 770, base)
      yTop += rowH
    })
    return cv
  }

  async function snapshot() {
    setErr(null); setMsg(null)
    const blob = await new Promise<Blob | null>((res) => buildSnapshot().toBlob(res, 'image/png'))
    if (!blob) { setErr(t('Could not generate the snapshot.')); return }
    const file = new File([blob], 'ktc-active-vessels.png', { type: 'image/png' })
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>
    }
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: t('KTC Active Vessels') }) } catch { /* user cancelled */ }
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg(t('Snapshot downloaded — attach it in your Viber group.'))
  }

  return (
    <AdminShell>
      <h1 className="ktc-title">{t('Vessel Schedule')}</h1>
      <p className="ktc-sub" style={{ marginTop: 4, marginBottom: 16 }}>
        {t('Calls available for customers to file against.')} <strong>{t('Last free day')}</strong> {t("is computed (finish discharging + the line's import free-days); a call drops off once its last free day passes. Free-days per line are set by admin in Settings.")}
      </p>

      {/* Add / edit */}
      <form onSubmit={save} className="ktc-glass ktc-glass--flat" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label className="ktc-label">{t('Shipping Line')}
            <input className="ktc-input" list="ktc-lines" value={form.shipping_line} onChange={(e) => setForm({ ...form, shipping_line: e.target.value })} placeholder="SITC" />
            <datalist id="ktc-lines">{lines.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="ktc-label">{t('Vessel Name*')}
            <input className="ktc-input" value={form.vessel_name} onChange={(e) => setForm({ ...form, vessel_name: e.target.value })} placeholder="SITC HUSHENG" />
          </label>
          <label className="ktc-label">{t('Voyage Number*')}
            <input className="ktc-input" value={form.voyage_number} onChange={(e) => setForm({ ...form, voyage_number: e.target.value })} placeholder="2606S" />
          </label>
          <label className="ktc-label">{t('Arrival')}
            <input className="ktc-input" type="date" value={form.actual_arrival} onChange={(e) => setForm({ ...form, actual_arrival: e.target.value })} />
          </label>
          <label className="ktc-label">{t('Arrival Time')}
            <input className="ktc-input" value={form.arrival_time} onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} placeholder="1653H" />
          </label>
          <label className="ktc-label">{t('Last Discharge')}
            <input className="ktc-input" type="date" value={form.finish_discharging} onChange={(e) => setForm({ ...form, finish_discharging: e.target.value })} />
          </label>
          <label className="ktc-label">{t('Discharge Time')}
            <input className="ktc-input" value={form.discharge_time} onChange={(e) => setForm({ ...form, discharge_time: e.target.value })} placeholder="1800H" />
          </label>
          <label className="ktc-label">{t('Departure')}
            <input className="ktc-input" type="date" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} />
          </label>
          <label className="ktc-label">{t('Departure Time')}
            <input className="ktc-input" value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })} placeholder="0823H" />
          </label>
          <label className="ktc-label">{t('Berth')}
            <input className="ktc-input" value={form.berth} onChange={(e) => setForm({ ...form, berth: e.target.value })} placeholder="4" />
          </label>
          <label className="ktc-label">{t('Week')}
            <input className="ktc-input" type="number" min="1" max="53" value={form.week} onChange={(e) => setForm({ ...form, week: e.target.value })} placeholder="23" />
          </label>
          <label className="ktc-label">{t('Remarks')}
            <input className="ktc-input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder={t('e.g. IA8')} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="ktc-btn" type="submit" disabled={saving}>{editing ? t('Update call') : t('Add call')}</button>
          {editing && <button className="ktc-btn ktc-btn-ghost" type="button" onClick={resetForm}>{t('Cancel edit')}</button>}
        </div>
        {err && <p className="ktc-error" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{err}</p>}
        {msg && <p style={{ color: 'var(--c-h150-60-30)', marginTop: 10, fontSize: 13 }}>{msg}</p>}
      </form>

      {/* Pending vessel requests — unlisted vessels customers filed against. */}
      {reqs.length > 0 && (
        <div className="ktc-glass" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--c-h40-85-78)', background: 'var(--c-h40-95-97)' }}>
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
            {t('⚠ Vessel requests — {n} awaiting review', { n: reqs.length })}
          </strong>
          <p className="ktc-label" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
            {t('Customers filed Job Orders against these vessels, which aren’t on the schedule. Add the call above (if needed), then link it here to approve — every waiting order adopts the scheduled vessel. Or reject if it doesn’t belong.')}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {reqs.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px solid var(--glass-brd)' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.vessel_name} <span style={{ color: 'hsl(var(--ink-2))', fontWeight: 400 }}>· {r.voyage_number || '—'}</span></div>
                  <div className="ktc-label" style={{ fontSize: 12 }}>{t('{n} job order(s) waiting', { n: r.waiting_count })}</div>
                </div>
                <select
                  className="ktc-input"
                  style={{ flex: '1 1 200px', minWidth: 160 }}
                  value={reqLink[r.id] ?? ''}
                  onChange={(e) => setReqLink((m) => ({ ...m, [r.id]: e.target.value }))}
                >
                  <option value="">{t('Link to scheduled call…')}</option>
                  {rows.filter((v) => !v.cancelled).map((v) => (
                    <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_visit} — {v.vessel_name} · {v.voyage_number}</option>
                  ))}
                </select>
                <button className="ktc-btn ktc-btn--sm" type="button" disabled={reqBusy === r.id} onClick={() => void approveReq(r)}>
                  {reqBusy === r.id ? t('Working…') : t('Approve & link')}
                </button>
                <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" disabled={reqBusy === r.id} onClick={() => void rejectReq(r)}>
                  {t('Reject')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{showAll ? t('{count} total call(s)', { count: visible.length }) : t('{count} current call(s)', { count: visible.length })}</strong>
        <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" onClick={() => void snapshot()} title={t('Share a snapshot of active vessels to your Viber group')}>{t('📸 Snapshot')}</button>
        <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" disabled={syncing} onClick={() => void syncNow()} title={t('Pull the latest edits from the Google Sheet now and refresh the Last Free Day mirror')}>{syncing ? t('Syncing…') : t('🔄 Sync sheet')}</button>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button className={`ktc-btn ktc-btn--sm ${view === 'table' ? '' : 'ktc-btn-ghost'}`} type="button" onClick={() => setView('table')}>{t('Table')}</button>
          <button className={`ktc-btn ktc-btn--sm ${view === 'calendar' ? '' : 'ktc-btn-ghost'}`} type="button" onClick={() => setView('calendar')}>{t('Calendar')}</button>
        </div>
        <span style={{ flex: 1 }} />
        {view === 'table' && (
          <label className="ktc-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('Show past/cancelled')}
          </label>
        )}
      </div>

      {loading ? <p className="ktc-label">{t('Loading…')}</p> : view === 'calendar' ? <MonthCalendar rows={rows.filter((r) => !r.cancelled)} /> : (
        <div className="ktc-glass ktc-glass--flat" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'hsl(var(--ink-2))' }}>
                {['Line', 'Vessel', 'Voyage', 'Arrival', 'Last Disch.', 'Last Free Day', 'Departure', 'Berth', 'Wk', '', ''].map((h, i) => (
                  <th key={i} style={{ padding: '9px 10px', borderBottom: '1px solid var(--glass-brd)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h ? t(h) : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} style={{ opacity: r.cancelled ? 0.5 : 1 }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.shipping_line ?? '—'}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.vessel_name}</td>
                  <td style={{ padding: '8px 10px' }}>{r.voyage_number}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDT(r.actual_arrival, r.arrival_time)}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDT(r.finish_discharging, r.discharge_time)}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {r.last_free_day ? fmt(r.last_free_day) : <span style={{ color: 'hsl(var(--ink-2))', fontWeight: 400 }}>{t('set line')}</span>}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDT(r.departure, r.departure_time)}</td>
                  <td style={{ padding: '8px 10px' }}>{r.berth ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.week ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {r.cancelled ? <Badge bg="var(--c-h0-70-95)" fg="var(--c-h0-65-45)">{t('cancelled')}</Badge>
                      : r.is_current ? <Badge bg="var(--c-h150-50-93)" fg="var(--c-h150-60-30)">{t('current')}</Badge>
                      : <Badge bg="var(--c-h220-16-92)" fg="var(--c-h220-10-45)">{t('past')}</Badge>}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="ktc-link" onClick={() => startEdit(r)}>{t('Edit')}</button>{' · '}
                    <button className="ktc-link" onClick={() => void toggleCancel(r)}>{r.cancelled ? t('Restore') : t('Cancel')}</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 18, textAlign: 'center', color: 'hsl(var(--ink-2))' }}>
                  {showAll ? t('No calls. Add one above or sync from the Google Sheet.') : t('No current calls. Add one above or sync from the Google Sheet.')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  )
}

