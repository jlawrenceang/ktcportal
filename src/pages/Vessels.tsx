import { useEffect, useMemo, useState } from 'react'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import ProtectedDoc from '../components/ProtectedDoc'
import { supabase } from '../lib/supabase'
import { MonthCalendar, Badge, fmt, type VesselRow } from '../components/VesselCalendar'
import { usePageTour } from '../components/TourProvider'
import { vesselsCustomerSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'

// Read-only vessel schedule for customers. Same data the operations team
// maintains (vessel_schedule_v) — customers can only look, not edit. Useful
// for picking the right vessel/voyage when filing a job order and for watching
// the computed last free day. RLS already allows authenticated SELECT (the New
// Job Order page reads the same view); writes stay gated to operations/admin.

function statusBadge(r: VesselRow, t: (s: string) => string) {
  if (r.cancelled) return <Badge bg="var(--c-h0-70-95)" fg="var(--c-h0-65-45)">{t('cancelled')}</Badge>
  if (r.is_current) return <Badge bg="var(--c-h150-50-93)" fg="var(--c-h150-60-30)">{t('current')}</Badge>
  return <Badge bg="var(--c-h220-16-92)" fg="var(--c-h220-10-45)">{t('past')}</Badge>
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="ktc-label" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: accent ? 700 : 500, color: accent ? 'var(--acc-2)' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

const CUSTOMER_HISTORY_DAYS = 7

function dateOnly(raw: string | null): Date | null {
  if (!raw) return null
  const d = new Date(raw.slice(0, 10) + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

// Card-based browse: each vessel call is a scannable card with the Last Free Day
// as the hero fact, grouped under date headers (arrival date, or "not yet
// arrived"). Mobile-first — cards stack, no horizontal scroll like the Table view.
function VesselCards({ rows }: { rows: VesselRow[] }) {
  const { t } = useT()
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; pending: boolean; label: string; sort: number; rows: VesselRow[] }>()
    for (const r of rows) {
      // Parse date-only the same way fmt() does (local 'T00:00:00') so the group
      // header agrees with each card's Arrival fact for west-of-UTC viewers. Key
      // off the raw date-only string to keep grouping timezone-independent.
      const d = r.actual_arrival ? new Date(r.actual_arrival.slice(0, 10) + 'T00:00:00') : null
      const key = r.actual_arrival ? r.actual_arrival.slice(0, 10) : 'pending'
      if (!map.has(key)) {
        map.set(key, {
          key,
          pending: !d,
          label: d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
          sort: d ? d.getTime() : Infinity, // not-yet-arrived calls float to the top
          rows: [],
        })
      }
      map.get(key)!.rows.push(r)
    }
    return [...map.values()].sort((a, b) => b.sort - a.sort)
  }, [rows])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="ktc-label" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            {g.pending ? t('Not yet arrived') : g.label}
            <span style={{ opacity: 0.5, fontWeight: 500 }}> · {g.rows.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
            {g.rows.map((r) => (
              <div key={r.id} style={{ padding: '13px 15px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', opacity: r.cancelled ? 0.55 : 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.vessel_name} <span className="ktc-mono" style={{ fontWeight: 500, fontSize: 13, color: 'hsl(var(--ink-2))' }}>{r.voyage_number}</span>
                    </div>
                    <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.shipping_line ?? '—'} · <span className="ktc-mono">{r.vessel_visit}</span>
                    </div>
                  </div>
                  {statusBadge(r, t)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px' }}>
                  <Fact label={t('Arrival')} value={fmt(r.actual_arrival)} />
                  <Fact label={t('Finish Disch.')} value={fmt(r.finish_discharging)} />
                  <Fact label={t('Last Free Day')} value={r.last_free_day ? fmt(r.last_free_day) : '—'} accent />
                  <Fact label={t('Berth')} value={r.berth ?? '—'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Vessels() {
  usePageTour('vessels-customer', vesselsCustomerSteps)
  const { t } = useT()
  const [rows, setRows] = useState<VesselRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'cards' | 'table' | 'calendar'>('cards')

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase.from('vessel_schedule_v').select('*')
      .order('actual_arrival', { ascending: false, nullsFirst: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setRows((data as VesselRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - CUSTOMER_HISTORY_DAYS)
    const withinCustomerWindow = rows.filter((r) => {
      if (r.is_current) return true
      const d = dateOnly(r.actual_arrival) ?? dateOnly(r.finish_discharging) ?? dateOnly(r.last_free_day)
      return !d || d >= cutoff
    })
    return showAll ? withinCustomerWindow : withinCustomerWindow.filter((r) => r.is_current && !r.cancelled)
  }, [rows, showAll])

  const emptyMsg = showAll ? t('No vessel calls right now.') : t('No current vessel calls right now.')

  return (
    <Shell>
      <div data-tour="vessels-intro">
        <h1 className="ktc-title">{t('Vessel Schedule')}</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>
          {t("Current vessel calls at KTC. Last free day is the last day of free storage (finish discharging + the line's free-days); after it, storage charges apply. Schedule is maintained by KTC operations — for reference only.")}
        </p>
      </div>

      <div data-tour="vessels-view" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{t('{count} {scope} call(s)', { count: visible.length, scope: t(showAll ? 'total' : 'current') })}</strong>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button className={`ktc-btn ktc-btn--sm ${view === 'cards' ? '' : 'ktc-btn-ghost'}`} type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>{t('Cards')}</button>
          <button className={`ktc-btn ktc-btn--sm ${view === 'table' ? '' : 'ktc-btn-ghost'}`} type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>{t('Table')}</button>
          <button className={`ktc-btn ktc-btn--sm ${view === 'calendar' ? '' : 'ktc-btn-ghost'}`} type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>{t('Calendar')}</button>
        </div>
        <span style={{ flex: 1, minWidth: 8 }} />
        <label className="ktc-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('Show past/cancelled')}
        </label>
      </div>

      {loading ? <p className="ktc-label">{t('Loading…')}</p>
        : loadError ? (
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{loadError}</Notice>
        ) : (
          <ProtectedDoc>
            {view === 'calendar' ? (
              visible.length === 0
                ? <div className="ktc-glass ktc-glass--flat" style={{ padding: 18, textAlign: 'center', color: 'hsl(var(--ink-2))' }}>{emptyMsg}</div>
                : <MonthCalendar rows={visible} />
            )
              : view === 'cards' ? (
                visible.length === 0
                  ? <div className="ktc-glass ktc-glass--flat" style={{ padding: 18, textAlign: 'center', color: 'hsl(var(--ink-2))' }}>{emptyMsg}</div>
                  : <VesselCards rows={visible} />
              ) : (
                <div className="ktc-glass ktc-glass--flat" style={{ padding: 8 }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'hsl(var(--ink-2))' }}>
                          {['Visit', 'Vessel', 'Voyage', 'Line', 'Arrival', 'Finish Disch.', 'Last Free Day', 'Berth', ''].map((h, i) => (
                            <th key={i} style={{ padding: '9px 10px', borderBottom: '1px solid var(--glass-brd)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h ? t(h) : ''}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.id} style={{ opacity: r.cancelled ? 0.5 : 1 }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.vessel_visit}</td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.vessel_name}</td>
                            <td style={{ padding: '8px 10px' }}>{r.voyage_number}</td>
                            <td style={{ padding: '8px 10px' }}>{r.shipping_line ?? '—'}</td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmt(r.actual_arrival)}</td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmt(r.finish_discharging)}</td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                              {r.last_free_day ? fmt(r.last_free_day) : <span style={{ color: 'hsl(var(--ink-2))', fontWeight: 400 }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 10px' }}>{r.berth ?? '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{statusBadge(r, t)}</td>
                          </tr>
                        ))}
                        {visible.length === 0 && (
                          <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'hsl(var(--ink-2))' }}>{emptyMsg}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </ProtectedDoc>
        )}
    </Shell>
  )
}
