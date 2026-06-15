import { useEffect, useMemo, useState } from 'react'
import Shell from '../components/Shell'
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

export default function Vessels() {
  usePageTour('vessels-customer', vesselsCustomerSteps)
  const { t } = useT()
  const [rows, setRows] = useState<VesselRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<'table' | 'calendar'>('table')

  useEffect(() => {
    void supabase.from('vessel_schedule_v').select('*')
      .order('actual_arrival', { ascending: false, nullsFirst: true })
      .then(({ data }) => { setRows((data as VesselRow[]) ?? []); setLoading(false) })
  }, [])

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r) => r.is_current && !r.cancelled)),
    [rows, showAll],
  )

  return (
    <Shell>
      <div data-tour="vessels-intro">
        <h1 className="ktc-title">{t('Vessel Schedule')}</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>
          {t("Current vessel calls at KTC. Last free day is the last day of free storage (finish discharging + the line's free-days); after it, storage charges apply. Schedule is maintained by KTC operations — for reference only.")}
        </p>
      </div>

      <div data-tour="vessels-view" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{t('{count} {scope} call(s)', { count: visible.length, scope: t(showAll ? 'total' : 'current') })}</strong>
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
        <div className="ktc-glass" style={{ padding: 0, overflowX: 'auto' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                  <td style={{ padding: '8px 10px' }}>
                    {r.cancelled ? <Badge bg="var(--c-h0-70-95)" fg="var(--c-h0-65-45)">{t('cancelled')}</Badge>
                      : r.is_current ? <Badge bg="var(--c-h150-50-93)" fg="var(--c-h150-60-30)">{t('current')}</Badge>
                      : <Badge bg="var(--c-h220-16-92)" fg="var(--c-h220-10-45)">{t('past')}</Badge>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 18, textAlign: 'center', color: 'hsl(var(--ink-2))' }}>
                  {showAll ? t('No vessel calls right now.') : t('No current vessel calls right now.')}
                </td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </Shell>
  )
}
