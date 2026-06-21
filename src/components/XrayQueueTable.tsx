import { useState, type CSSProperties } from 'react'
import { useT } from '../lib/i18n'
import { batchLabel, formatAge, ageHours } from '../lib/batch'

// Reusable container worklist table — one row per item, ordered by JO number
// (the true sequential intake/log order) or by working-hours age. Built for the
// X-ray queue; the same shape can drive future cashier / document-verification
// queues. Presentational: the parent owns the data + the action.
export interface QueueRow {
  lineId: string
  container: string
  jo_number: string | null
  consignee: { code: string; name: string } | null
  created_at: string
}

const thStyle: CSSProperties = { padding: '8px 10px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', textAlign: 'left' }
const tdStyle: CSSProperties = { padding: '9px 10px', verticalAlign: 'middle' }

function SortTh({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th style={{ padding: 0 }}>
      <button type="button" onClick={onClick} style={{ ...thStyle, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: active ? 'var(--acc-2)' : 'hsl(var(--ink-2))' }}>
        {label}{active ? ' ↓' : ''}
      </button>
    </th>
  )
}

export default function XrayQueueTable({ rows, canConfirm, onConfirm, actionLabel }: {
  rows: QueueRow[]
  canConfirm: boolean
  onConfirm: (row: QueueRow) => void
  actionLabel?: string
}) {
  const { t } = useT()
  const [sortBy, setSortBy] = useState<'jo' | 'age'>('jo')
  const sorted = [...rows].sort((a, b) =>
    sortBy === 'age'
      ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : (a.jo_number ?? '').localeCompare(b.jo_number ?? ''))

  return (
    <>
      <p className="ktc-label" style={{ fontSize: 11.5, marginTop: -6, marginBottom: 12 }}>
        {t('Age counts X-ray working hours (9 AM–7 PM) only — it pauses overnight.')}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-brd)' }}>
              <SortTh label={t('JO no.')} active={sortBy === 'jo'} onClick={() => setSortBy('jo')} />
              <th style={thStyle}>{t('Container')}</th>
              <th style={thStyle}>{t('Consignee')}</th>
              <th style={thStyle}>{t('Batch')}</th>
              <SortTh label={t('Age · work hrs')} active={sortBy === 'age'} onClick={() => setSortBy('age')} />
              <th style={thStyle} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const h = ageHours(r.created_at)
              return (
                <tr key={r.lineId} style={{ borderTop: '1px solid var(--glass-brd)' }}>
                  <td style={tdStyle}><b className="ktc-mono">{r.jo_number ?? '—'}</b></td>
                  <td style={tdStyle}><span className="ktc-mono">{r.container}</span></td>
                  <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : t('no consignee')}</td>
                  <td style={tdStyle}>{batchLabel(r.created_at, t)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: h >= 20 ? 'var(--c-h0-60-40)' : h >= 10 ? 'var(--c-h30-60-32)' : 'inherit' }} title={t('X-ray working hours (9 AM–7 PM) since filed')}>{formatAge(r.created_at)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {canConfirm
                      ? <button className="ktc-btn ktc-btn--sm" onClick={() => onConfirm(r)}>{actionLabel ?? t('Confirm')}</button>
                      : <span className="ktc-chip ktc-chip--danger">{t('pending')}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
