import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useT } from '../lib/i18n'
import { SERVICE_LINE_LABEL, type ServiceLine } from '../lib/types'

// Floor-staff "now serving" board (checker + operations) — NOT customer-facing
// (customers have no serving number to wait on). Reads now_serving() — one row
// per active serving lane this week — and shows, per lane, the lowest still-active
// number (what's being served now; "—" when the lane is idle) plus the highest
// number issued. The weekly Monday reset is handled server-side.
type NowServingRow = { service_line: string; now_serving: number | null; last_issued: number }

// Fixed display order: the priority lane is served ahead of the regular queue,
// then the per-service lines, with re-X-ray last (mirrors the checker's serve
// order). Unknown lanes fall to the end. Labels reuse SERVICE_LINE_LABEL — the
// same map the serving UI uses; never invent new ones.
const LANE_ORDER: ServiceLine[] = ['priority', 'queue', 'xray', 'dea', 'oog', 'rexray', 'other']
const laneRank = (line: string) => {
  const i = LANE_ORDER.indexOf(line as ServiceLine)
  return i === -1 ? LANE_ORDER.length : i
}

export default function NowServing() {
  const { t } = useT()
  const [rows, setRows] = useState<NowServingRow[]>([])
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const { data } = await supabase.rpc('now_serving')
    const list = ((data ?? []) as NowServingRow[]).slice().sort((a, b) => laneRank(a.service_line) - laneRank(b.service_line))
    setRows(list)
    setLoaded(true)
  }
  useEffect(() => { void load() }, [])
  // Light cadence — the board moves with the line but isn't urgent; refreshes
  // only on a visible tab, plus a manual ↻.
  const { refresh, cooling } = useAutoRefresh(load, { intervalMs: 25_000 })

  return (
    <div className="ktc-glass" style={{ padding: '11px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <span className="ktc-label" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>{t('Now serving')}</span>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}
          aria-label={t('Refresh now serving')} title={t('Refresh')} style={{ padding: '4px 9px' }}>↻</button>
      </div>
      {loaded && rows.length === 0 ? (
        <span className="ktc-label" style={{ fontSize: 12.5, opacity: 0.7 }}>{t('No lines drawn yet this week.')}</span>
      ) : (
        <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
          {rows.map((r) => (
            <div key={r.service_line} style={{ flex: '0 0 auto', minWidth: 112, padding: '7px 12px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
              <div className="ktc-label" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>
                {t(SERVICE_LINE_LABEL[r.service_line as ServiceLine] ?? r.service_line)}
              </div>
              <div className="ktc-mono" style={{ fontSize: 21, fontWeight: 700, color: 'var(--acc-2)', lineHeight: 1.15, marginTop: 1 }}>
                {r.now_serving == null ? '—' : `#${r.now_serving}`}
              </div>
              <div className="ktc-label" style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>
                {t('last issued #{n}', { n: r.last_issued })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
