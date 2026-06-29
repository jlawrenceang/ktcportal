import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useT } from '../lib/i18n'
import { peso } from '../lib/pricing'
import Notice from '../components/Notice'

// Monthly X-ray reconciliation (ADR-0037 Phase A · anti-fraud control 4).
// The owner's fraud-detection panel: containers X-rayed × rate ≈ the cash that
// should have been collected. A persistent "to reconcile vs bank" gap (billed −
// collected) is the signal that bills aren't turning into deposits.

interface ReconRow {
  month: string
  job_orders: number
  containers: number
  billed_total: number
  collected_total: number
}

// month comes back as a date / timestamp ('2026-06-01') or a 'YYYY-MM' label —
// render it as "Month YYYY" without assuming a time component.
function monthLabel(m: string): string {
  const d = new Date(/^\d{4}-\d{2}$/.test(m) ? `${m}-01T00:00:00` : m)
  if (Number.isNaN(d.getTime())) return m
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export default function Reconciliation() {
  const { t } = useT()
  const { can, broker } = usePermissions()
  const allowed = !!broker?.is_admin || !!broker?.is_owner || can('complete_orders')

  const [rows, setRows] = useState<ReconRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    setLoadError(null)
    const { data, error } = await supabase.rpc('get_xray_monthly_reconciliation')
    if (error) { setLoadError(error.message); setLoading(false); return }
    setLoadError(null)
    setRows((data ?? []) as ReconRow[])
    setLoading(false)
  }

  useEffect(() => {
    if (!allowed) { setLoading(false); return }
    void load()
  }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  const { refresh, cooling } = useAutoRefresh(load, { enabled: allowed })

  const num = (n: number) => (n ?? 0).toLocaleString('en-PH')

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Monthly reconciliation')}</h1>
          <p className="ktc-sub">{t('Containers X-rayed × rate ≈ cash that should have been collected. A persistent gap vs the bank is the fraud signal to investigate.')}</p>
        </div>
        {allowed && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>↻ {t('Refresh')}</button>}
      </div>

      {!allowed ? (
        <Notice tone="error" title={t('Not authorized')}>{t('You do not have access to the reconciliation panel.')}</Notice>
      ) : loading ? (
        <div className="ktc-skeleton" style={{ height: 200, borderRadius: 14 }} />
      ) : loadError ? (
        <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>{loadError}</Notice>
      ) : rows.length === 0 ? (
        <div className="ktc-label" style={{ fontSize: 14 }}>{t('No billed X-ray activity yet.')}</div>
      ) : (
        <div className="ktc-glass ktc-glass--flat" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-brd)' }}>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>{t('Month')}</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>{t('Job orders')}</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>{t('Containers')}</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>{t('Billed total')}</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>{t('Collected total')}</th>
                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>{t('To reconcile vs bank')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gap = (r.billed_total ?? 0) - (r.collected_total ?? 0)
                return (
                  <tr key={r.month} style={{ borderBottom: '1px solid var(--glass-brd)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{monthLabel(r.month)}</td>
                    <td className="ktc-mono" style={{ padding: '11px 14px', textAlign: 'right' }}>{num(r.job_orders)}</td>
                    <td className="ktc-mono" style={{ padding: '11px 14px', textAlign: 'right' }}>{num(r.containers)}</td>
                    <td className="ktc-mono" style={{ padding: '11px 14px', textAlign: 'right' }}>{peso(r.billed_total ?? 0)}</td>
                    <td className="ktc-mono" style={{ padding: '11px 14px', textAlign: 'right' }}>{peso(r.collected_total ?? 0)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <span className={`ktc-chip ${Math.abs(gap) < 0.005 ? 'ktc-chip--success' : 'ktc-chip--warning'}`}>{peso(gap)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {allowed && !loading && !loadError && rows.length > 0 && (
        <p className="ktc-label" style={{ fontSize: 12, marginTop: 12 }}>
          {t('“To reconcile vs bank” = billed − collected. Zero means every billed peso was collected; a gap means charges did not convert to deposits — reconcile against the bank statement.')}
        </p>
      )}
    </AdminShell>
  )
}
