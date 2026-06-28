import { useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { useT } from '../lib/i18n'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { joEventLabel, SECURITY_EVENT_LABEL, securityEventSummary } from '../lib/eventLabels'
import type { JobOrderEvent } from '../lib/types'

// Activity Log (/admin/logs): one place for every recorded event —
// job-order audit trail, security events (owner-only via RLS), client
// errors, and outgoing calls. Paginated 25/page, newest first; RLS does the
// real gating (this page just renders what the caller may read).

const PAGE = 25
type Cat = 'orders' | 'security' | 'errors' | 'outbound'
const CATS: { key: Cat; label: string }[] = [
  { key: 'orders', label: 'Job orders' },
  { key: 'security', label: 'Security' },
  { key: 'errors', label: 'Client errors' },
  { key: 'outbound', label: 'Emails & sync' },
]

interface Row {
  id: string
  at: string
  actor: string | null // auth user id to resolve
  title: string
  sub?: string
  tone?: 'danger' | 'info'
  // Client-error rows carry the captured stack + user-agent (write-only until
  // T3-19) so the entry can expand into a read-only detail block.
  stack?: string | null
  ua?: string | null
}

export default function Logs() {
  const { t } = useT()
  const { broker } = useBroker()
  const isOwner = !!broker?.is_owner
  const [cat, setCat] = useState<Cat>('orders')
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  async function load(c: Cat = cat, p: number = page) {
    const range: [number, number] = [p * PAGE, p * PAGE + PAGE - 1]
    let out: Row[] = []
    let count = 0

    if (c === 'orders') {
      const { data, count: n } = await supabase
        .from('job_order_events')
        .select('id, event, detail, actor, created_at, job_order:job_orders(jo_number)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range)
      count = n ?? 0
      out = ((data ?? []) as unknown as (JobOrderEvent & { job_order: { jo_number: string | null } | { jo_number: string | null }[] | null })[]).map((e) => {
        const jo = Array.isArray(e.job_order) ? e.job_order[0] : e.job_order
        return {
          id: e.id, at: e.created_at, actor: e.actor,
          title: joEventLabel(e),
          sub: jo?.jo_number ?? undefined,
        }
      })
    } else if (c === 'security') {
      const { data, count: n } = await supabase
        .from('security_events')
        .select('id, kind, actor, detail, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range)
      count = n ?? 0
      out = ((data ?? []) as { id: string; kind: string; actor: string | null; detail: Record<string, unknown>; created_at: string }[]).map((e) => ({
        id: e.id, at: e.created_at, actor: e.actor,
        title: t(SECURITY_EVENT_LABEL[e.kind] ?? e.kind),
        sub: securityEventSummary(e.kind, e.detail) ?? JSON.stringify(e.detail),
        tone: e.kind === 'protected_field_attempt' ? 'danger' : undefined,
      }))
    } else if (c === 'errors') {
      const { data, count: n } = await supabase
        .from('app_errors')
        .select('id, message, path, user_id, stack, user_agent, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range)
      count = n ?? 0
      out = ((data ?? []) as { id: string; message: string; path: string | null; user_id: string | null; stack: string | null; user_agent: string | null; created_at: string }[]).map((e) => ({
        id: e.id, at: e.created_at, actor: e.user_id,
        title: e.message, sub: e.path ?? undefined, tone: 'danger',
        stack: e.stack, ua: e.user_agent,
      }))
    } else {
      const { data, count: n } = await supabase
        .from('outbound_requests')
        .select('id, kind, label, status_code, error_msg, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range)
      count = n ?? 0
      out = ((data ?? []) as { id: number; kind: string; label: string | null; status_code: number | null; error_msg: string | null; created_at: string }[]).map((e) => ({
        id: String(e.id), at: e.created_at, actor: null,
        title: e.label ?? e.kind,
        sub: e.error_msg ?? (e.status_code ? `HTTP ${e.status_code}` : t('pending')),
        tone: e.error_msg || (e.status_code ?? 0) >= 400 ? 'danger' : undefined,
      }))
    }

    // Resolve actor display names in one query.
    const ids = Array.from(new Set(out.map((r) => r.actor).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: people } = await supabase
        .from('customers').select('user_id, full_name, email').in('user_id', ids)
      setNames(new Map((people ?? []).map((p) => [p.user_id as string, (p.full_name || p.email || '?') as string])))
    } else {
      setNames(new Map())
    }
    setRows(out)
    setTotal(count)
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { refresh, cooling } = useAutoRefresh(load)

  function changeCat(c: Cat) {
    setCat(c); setPage(0); setLoading(true); setExpanded(new Set())
    void load(c, 0)
  }
  function changePage(p: number) {
    setPage(p); setLoading(true); setExpanded(new Set())
    void load(cat, p)
  }

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ktc-title">{t('Activity Log')}</h1>
          <p className="ktc-sub">{t('Everything the portal records — who did what, and when.')}</p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling}>{t('↻ Refresh')}</button>
      </div>

      <div className="ktc-glass" style={{ padding: 22 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {CATS.filter((c) => c.key !== 'security' || isOwner).map((c) => (
            <button key={c.key} type="button"
              className={`ktc-nav-link${cat === c.key ? ' is-active' : ''}`}
              onClick={() => changeCat(c.key)} style={{ fontSize: 12.5 }}>
              {t(c.label)}
            </button>
          ))}
          {!loading && <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto', alignSelf: 'center' }}>{t('{n} event(s)', { n: total })}</span>}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {[44, 44, 44, 44].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
          </div>
        ) : rows.length === 0 ? (
          <span className="ktc-label" style={{ fontSize: 14 }}>
            {cat === 'security' ? t('No security events.') : cat === 'errors' ? t('No client errors recorded.') : t('Nothing here yet.')}
          </span>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {rows.map((r) => {
              const canExpand = !!(r.stack || r.ua)
              const isOpen = expanded.has(r.id)
              return (
                <div key={r.id} style={{
                  fontSize: 13, padding: '9px 13px', borderRadius: 10,
                  background: r.tone === 'danger' ? 'var(--c-h0-75-97)' : 'var(--c-w55)',
                  border: r.tone === 'danger' ? '1px solid var(--c-h0-70-88)' : '1px solid var(--glass-brd)',
                }}>
                  <div
                    onClick={canExpand ? () => toggle(r.id) : undefined}
                    style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', cursor: canExpand ? 'pointer' : undefined }}
                    title={canExpand ? t('Click to show details') : undefined}
                  >
                    {canExpand && <span aria-hidden style={{ fontSize: 10, color: 'hsl(var(--ink-2))', alignSelf: 'center' }}>{isOpen ? '▾' : '▸'}</span>}
                    <span style={{ fontWeight: 550, minWidth: 0, overflowWrap: 'anywhere' }}>{r.title}</span>
                    {r.sub && <span className="ktc-mono ktc-label" style={{ fontSize: 11.5, minWidth: 0, overflowWrap: 'anywhere' }}>{r.sub}</span>}
                    <span className="ktc-label" style={{ fontSize: 11.5, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      {r.actor ? `${names.get(r.actor) ?? r.actor.slice(0, 8) + '…'} · ` : ''}
                      {new Date(r.at).toLocaleString()}
                    </span>
                  </div>
                  {canExpand && isOpen && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {r.stack && (
                        <pre className="ktc-mono" style={{ margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto', padding: '8px 10px', borderRadius: 8, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>{r.stack}</pre>
                      )}
                      {r.ua && (
                        <div className="ktc-label" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{t('User agent')}: {r.ua}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {total > PAGE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, justifyContent: 'center' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={page === 0} onClick={() => changePage(page - 1)}>{t('← Prev')}</button>
            <span className="ktc-label" style={{ fontSize: 12.5 }}>{t('{from}–{to} of {total}', { from: page * PAGE + 1, to: Math.min((page + 1) * PAGE, total), total })}</span>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={(page + 1) * PAGE >= total} onClick={() => changePage(page + 1)}>{t('Next →')}</button>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
