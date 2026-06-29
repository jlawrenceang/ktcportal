import { useEffect, useMemo, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useT } from '../lib/i18n'
import Notice from '../components/Notice'
import { resolveNames, shortId, type ChargeAuditRow } from '../lib/charges'

// Charge audit trail (ADR-0037 Phase A · anti-fraud control 3 — accountability).
// Every charge create / approve / invoice / payment / reversal records WHO did it.
// With ~400 staff, a per-actor activity view is the accountability lever once
// fraud is discovered: filter to one person and read their whole charge history.

// Tone per action keyword (reversals / cancels are the ones to scrutinise).
function actionTone(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('revers') || a.includes('cancel') || a.includes('reject')) return 'ktc-chip--error'
  if (a.includes('confirm') || a.includes('approve') || a.includes('paid')) return 'ktc-chip--success'
  if (a.includes('invoice') || a.includes('bill')) return 'ktc-chip--info'
  return 'ktc-chip--accent'
}

function humanAction(action: string): string {
  return action.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export default function ChargeAuditView() {
  const { t } = useT()
  const { can, broker } = usePermissions()
  const allowed = !!broker?.is_admin || !!broker?.is_owner || can('complete_orders')

  const [rows, setRows] = useState<ChargeAuditRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actor, setActor] = useState<string>('all') // selected actor id, or 'all'

  async function load() {
    setLoadError(null)
    const { data, error } = await supabase
      .from('charge_audit')
      .select('charge_id, action, actor, detail, at')
      .order('at', { ascending: false })
      .limit(300)
    if (error) { setLoadError(error.message); setLoading(false); return }
    setLoadError(null)
    const list = (data ?? []) as ChargeAuditRow[]
    setRows(list)
    setNames(await resolveNames(list.map((r) => r.actor)))
    setLoading(false)
  }

  useEffect(() => {
    if (!allowed) { setLoading(false); return }
    void load()
  }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  const { refresh, cooling } = useAutoRefresh(load, { enabled: allowed })

  const nameOf = (id: string | null) => (id ? names.get(id) ?? shortId(id) : t('System'))

  // Distinct actors present in the loaded trail, for the per-staff filter.
  const actors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (r.actor) seen.set(r.actor, nameOf(r.actor))
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, names]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = actor === 'all' ? rows : rows.filter((r) => r.actor === actor)

  function Detail({ detail }: { detail: Record<string, unknown> | null }) {
    if (!detail || typeof detail !== 'object' || Object.keys(detail).length === 0) return null
    return (
      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(detail).map(([k, v]) => (
          <span key={k} className="ktc-chip" style={{ fontSize: 11.5 }}>
            <span className="ktc-label" style={{ fontSize: 11 }}>{k}:</span>{' '}
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Charge audit trail')}</h1>
          <p className="ktc-sub">{t('Who created, approved, invoiced, collected, or reversed each charge — most recent first. Filter by staff for a per-person activity view.')}</p>
        </div>
        {allowed && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>↻ {t('Refresh')}</button>}
      </div>

      {!allowed ? (
        <Notice tone="error" title={t('Not authorized')}>{t('You do not have access to the audit trail.')}</Notice>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <label className="ktc-label" htmlFor="audit-actor" style={{ fontSize: 12.5, fontWeight: 600 }}>{t('Staff member')}</label>
            <select id="audit-actor" className="ktc-input" value={actor} onChange={(e) => setActor(e.target.value)} style={{ width: 'auto', minWidth: 0, padding: '8px 12px', fontSize: 13 }}>
              <option value="all">{t('All staff')}</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {!loading && <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>{t('{n} entries', { n: shown.length })}</span>}
          </div>

          {loading ? (
            <div className="ktc-skeleton" style={{ height: 160, borderRadius: 14 }} />
          ) : loadError ? (
            <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>{loadError}</Notice>
          ) : shown.length === 0 ? (
            <div className="ktc-label" style={{ fontSize: 14 }}>{t('No audit entries for this view.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {shown.map((r, i) => (
                <div key={`${r.charge_id}-${r.at}-${i}`} style={{ padding: '11px 14px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`ktc-chip ${actionTone(r.action)}`}>{humanAction(r.action)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(r.actor)}</span>
                    <span className="ktc-label ktc-mono" style={{ fontSize: 11.5 }}>{t('charge')} {shortId(r.charge_id)}</span>
                    <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>{new Date(r.at).toLocaleString()}</span>
                  </div>
                  <Detail detail={r.detail} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminShell>
  )
}
