import { useState, type ReactNode } from 'react'

// Shared vessel-schedule presentation — used by both the admin/operations
// editor (src/admin/VesselSchedule.tsx) and the read-only customer view
// (src/pages/Vessels.tsx). Lives in a shared chunk so neither bundle pulls
// in the other.

export interface VesselRow {
  id: string
  vessel_visit: string
  vessel_name: string
  voyage_number: string
  shipping_line: string | null
  actual_arrival: string | null
  arrival_time: string | null
  finish_discharging: string | null
  discharge_time: string | null
  departure: string | null
  departure_time: string | null
  berth: string | null
  week: number | null
  cancelled: boolean
  remarks: string | null
  free_days_import: number | null
  last_free_day: string | null
  line_internal: boolean
  is_current: boolean
}

export function fmt(d: string | null): string {
  if (!d) return '—'
  // date-only string ("YYYY-MM-DD"); guard against a full timestamp sneaking in.
  const dt = new Date(d.slice(0, 10) + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Date + the ops military clock-time combined for display, e.g. "Jun 15, 2026 · 1653H".
export function fmtDT(d: string | null, time: string | null): string {
  const date = fmt(d)
  if (date === '—') return '—'
  return time ? `${date} · ${time}` : date
}

export function Badge({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

// Month calendar of vessel arrivals (by actual_arrival).
export function MonthCalendar({ rows }: { rows: VesselRow[] }) {
  const [offset, setOffset] = useState(0)
  const base = new Date()
  base.setDate(1)
  base.setMonth(base.getMonth() + offset)
  const year = base.getFullYear(), month = base.getMonth()
  const startDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month

  const byDay = new Map<number, VesselRow[]>()
  for (const r of rows) {
    if (!r.actual_arrival) continue
    const d = new Date(r.actual_arrival + 'T00:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const k = d.getDate()
      const arr = byDay.get(k)
      if (arr) arr.push(r); else byDay.set(k, [r])
    }
  }
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const monthName = base.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  return (
    <div className="ktc-glass" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" onClick={() => setOffset((o) => o - 1)}>‹</button>
        <strong style={{ fontSize: 15, minWidth: 150, textAlign: 'center' }}>{monthName}</strong>
        <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" onClick={() => setOffset((o) => o + 1)}>›</button>
        {offset !== 0 && <button className="ktc-link" type="button" onClick={() => setOffset(0)}>Today</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, minWidth: 460 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="ktc-label" style={{ fontSize: 11, textAlign: 'center', fontWeight: 600 }}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} style={{
            minHeight: 78, borderRadius: 8, padding: 4, fontSize: 11,
            border: '1px solid var(--glass-brd)',
            background: day && isThisMonth && day === today.getDate() ? 'rgb(var(--acc-rgb) / 0.10)' : day ? 'var(--c-w45)' : 'transparent',
          }}>
            {day && (
              <>
                <div style={{ fontWeight: 600, color: 'hsl(var(--ink-2))', marginBottom: 2 }}>{day}</div>
                {(byDay.get(day) ?? []).map((r) => (
                  <div key={r.id} title={`${r.vessel_name} ${r.voyage_number} · berth ${r.berth ?? '—'}`}
                    style={{ background: 'linear-gradient(135deg, var(--acc), var(--acc-2))', color: '#fff', borderRadius: 5, padding: '2px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {r.vessel_name}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      </div>
      <p className="ktc-label" style={{ fontSize: 11.5, marginTop: 8 }}>Vessels shown on their actual arrival date.</p>
    </div>
  )
}
