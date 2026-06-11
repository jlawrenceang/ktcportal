import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SERVICE_LINE_LABEL, type ServiceLine } from '../lib/types'

interface Row { service_line: ServiceLine; now_serving: number | null; last_issued: number | null }

// "Now serving" strip — per service line this week: the number currently being
// served and the last number issued. Data via the now_serving() definer RPC,
// so customers see the line position without seeing other orders.
export default function NowServing({ only }: { only?: ServiceLine[] }) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    void supabase.rpc('now_serving').then(({ data }) => setRows((data ?? []) as Row[]))
  }, [])

  const shown = rows.filter((r) => (only ? only.includes(r.service_line) : r.service_line !== 'other'))
  if (shown.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      {shown.map((r) => (
        <div key={r.service_line} className="ktc-glass-thin" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 14px', borderRadius: 12 }}>
          <span className="ktc-label" style={{ fontSize: 12, fontWeight: 650 }}>{SERVICE_LINE_LABEL[r.service_line]} line</span>
          <span style={{ fontSize: 13.5 }}>
            now serving <b className="ktc-mono" style={{ fontSize: 15, color: 'var(--acc-2)' }}>#{r.now_serving ?? '—'}</b>
          </span>
          <span className="ktc-label" style={{ fontSize: 11.5 }}>of #{r.last_issued ?? '—'} this week</span>
        </div>
      ))}
    </div>
  )
}
