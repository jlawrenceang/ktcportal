import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { idDeletable, RELEASE_STATUS_LABEL, type Broker, type JobOrder } from '../lib/types'
import { BrokerReview } from './BrokerReview'
import { useFileViewer } from '../components/FileViewerModal'
import Notice from '../components/Notice'
import { peso } from '../lib/pricing'
import { useT } from '../lib/i18n'

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'var(--c-h40-90-94)', fg: 'var(--c-h35-80-38)' },
  approved: { bg: 'var(--c-h150-50-93)', fg: 'var(--c-h150-60-30)' },
  rejected: { bg: 'var(--c-h0-70-95)', fg: 'var(--c-h0-65-45)' },
  suspended: { bg: 'var(--c-h28-85-93)', fg: 'var(--c-h24-80-40)' },
}
const JO_STATUS: Record<string, string> = {
  held: 'Pending approval (held)', submitted: 'Submitted', processing: 'Processing',
  on_hold: 'On hold', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
}
const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Open', closed: 'Closed' }
const TICKET_CATEGORY_LABEL: Record<string, string> = {
  account: 'Account', accreditation: 'Accreditation', job_order: 'Job order', payment: 'Payment',
  app_system: 'App / System', customer_service: 'Customer service', operations: 'Operations', other: 'Other',
}

type ReleaseRow = { id: string; release_number: string | null; bl_number: string; status: string; amount: number | null; created_at: string }
type TicketRow = { id: string; subject: string; category: string; status: string; last_message_at: string; created_at: string }

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function CustomerDetail() {
  const { t } = useT()
  const { id } = useParams()
  const [cust, setCust] = useState<Broker | null>(null)
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [releases, setReleases] = useState<ReleaseRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Per-section load errors (orders / releases / tickets) so a failed/RLS-denied
  // fetch shows a retry instead of a misleading "none yet" success empty-state.
  const [ordersErr, setOrdersErr] = useState<string | null>(null)
  const [releasesErr, setReleasesErr] = useState<string | null>(null)
  const [ticketsErr, setTicketsErr] = useState<string | null>(null)
  // Admin password-reset: mint a one-time set-password link to hand the customer
  // directly (spam-proof). No email is sent from here.
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generateResetLink() {
    if (!cust) return
    setResetBusy(true); setError(null); setResetLink(null); setCopied(false)
    const { data, error: fErr } = await supabase.functions.invoke('admin-reset-link', {
      body: { customer_id: cust.id, redirect_to: `${window.location.origin}/reset-password` },
    })
    setResetBusy(false)
    if (fErr || (data as { error?: string })?.error) {
      setError((data as { error?: string })?.error ?? fErr?.message ?? t('Could not generate the link.'))
      return
    }
    setResetLink((data as { link: string }).link)
  }

  async function copyResetLink() {
    if (!resetLink) return
    try { await navigator.clipboard.writeText(resetLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked — user can select manually */ }
  }

  const load = useCallback(async () => {
    if (!id) return
    const [c, o, rel, tk] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('job_orders')
        .select('id, jo_number, entry_number, status, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)')
        .eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('release_orders')
        .select('id, release_number, bl_number, status, amount, created_at')
        .eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('support_tickets')
        .select('id, subject, category, status, last_message_at, created_at')
        .eq('customer_id', id).order('last_message_at', { ascending: false }),
    ])
    setError(c.error ? c.error.message : null) // clear a stale error when a Retry succeeds
    setOrdersErr(o.error ? o.error.message : null)
    setReleasesErr(rel.error ? rel.error.message : null)
    setTicketsErr(tk.error ? tk.error.message : null)
    setCust((c.data as Broker) ?? null)
    setOrders(((o.data ?? []) as unknown as JobOrder[]).map((r) => ({ ...r, consignee: one(r.consignee) })))
    setReleases((rel.data ?? []) as ReleaseRow[])
    setTickets((tk.data ?? []) as TicketRow[])
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  const { openFromStorage, viewerModal } = useFileViewer(setError)

  if (loading) return <AdminShell><span className="ktc-label">{t('Loading…')}</span></AdminShell>
  if (!cust) return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        {error ? (
          // A failed customer load must show the error + Retry, not a misleading
          // "not found" (which swallows the error before the banner can render).
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{error}</Notice>
        ) : (
          <p className="ktc-label">{t('Customer not found.')} <Link to="/admin/customers" className="ktc-link">{t('Back to Customers')}</Link></p>
        )}
      </div>
    </AdminShell>
  )

  const ss = STATUS_STYLE[cust.status] ?? STATUS_STYLE.pending
  return (
    <AdminShell crumb={cust.full_name || cust.email || t('Customer')}>
      {error && <div className="ktc-glass" style={{ padding: 14, marginBottom: 16, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {cust.customer_code && <span className="ktc-mono" style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--ink-2))' }}>{cust.customer_code}</span>}
          <h1 className="ktc-title">{cust.full_name || cust.email || t('Customer')}</h1>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: ss.bg, color: ss.fg }}>{t(cust.status)}</span>
        </div>
        <div className="ktc-label" style={{ marginTop: 10, fontSize: 14, display: 'grid', gap: 4 }}>
          <div>{t('Email:')} {cust.email}</div>
          <div>{t('Contact:')} {cust.contact_number || '—'}</div>
          {cust.valid_id_path && <div>{t('Valid ID:')} <button className="ktc-link" style={{ fontSize: 13 }} onClick={() => void openFromStorage('valid-ids', cust.valid_id_path, t('Valid ID — {name}', { name: cust.full_name || cust.email || t('customer') }), {
            // 🗑 appears only past the 24h guaranteed window (auto-purge at
            // 3 days); the storage policy re-checks server-side either way.
            onDeleted: idDeletable(cust) ? async () => {
              await supabase.from('customers').update({ valid_id_path: null }).eq('id', cust.id)
              setCust({ ...cust, valid_id_path: null })
            } : undefined,
          })}>{t('View')}</button></div>}
          {cust.decided_at && <div>{t('Decided:')} {new Date(cust.decided_at).toLocaleString()}</div>}
          {cust.decision_reason && <div>{t('Note to customer:')} {cust.decision_reason}</div>}
        </div>
        <BrokerReview b={cust} />

        {cust.email && !cust.is_owner && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--glass-brd)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('Reset password')}</div>
            <p className="ktc-label" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, maxWidth: 560 }}>
              {t('Generate a one-time link the customer can open to set a new password — copy it and send it to them directly (e.g. Viber/SMS). No email is sent. The link is single-use and expires in about an hour.')}
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <button className="ktc-btn ktc-btn--sm" type="button" disabled={resetBusy} onClick={() => void generateResetLink()}>
                {resetBusy ? t('Generating…') : resetLink ? t('Regenerate link') : t('Generate set-password link')}
              </button>
            </div>
            {resetLink && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <input className="ktc-input ktc-mono" readOnly value={resetLink} onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: '1 1 320px', minWidth: 0, fontSize: 12 }} />
                <button className="ktc-btn ktc-btn-ghost ktc-btn--sm" type="button" onClick={() => void copyResetLink()}>
                  {copied ? t('✓ Copied') : t('Copy link')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{t('Job order history')}</h2>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>{t('{n} order(s).', { n: orders.length })}</p>
        {ordersErr ? (
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{ordersErr}</Notice>
        ) : orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No job orders yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{o.jo_number ?? t('Draft (no number yet)')}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()} · {t(JO_STATUS[o.status] ?? o.status)}</span>
                </div>
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                  {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : t('No consignee')}{o.entry_number ? ` · ${t('Entry {n}', { n: o.entry_number })}` : ''}
                </div>
                {o.lines && o.lines.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {o.lines.map((l, i) => <li key={i}>{l.container_number} — {l.service_request}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{t('Releases')}</h2>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>{t('{n} release(s).', { n: releases.length })}</p>
        {releasesErr ? (
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{releasesErr}</Notice>
        ) : releases.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No releases yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {releases.map((r) => (
              <div key={r.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <b className="ktc-mono" style={{ fontSize: 15 }}>{r.release_number ?? t('Draft (no number yet)')}</b>
                    <span className="ktc-chip">{t(RELEASE_STATUS_LABEL[r.status as keyof typeof RELEASE_STATUS_LABEL] ?? r.status)}</span>
                    {r.amount != null && <span className="ktc-chip ktc-chip--info ktc-mono">{peso(Number(r.amount))}</span>}
                  </span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>{t('BL')}: <span className="ktc-mono">{r.bl_number}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{t('Support')}</h2>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 16 }}>{t('{n} ticket(s).', { n: tickets.length })}</p>
        {ticketsErr ? (
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{ticketsErr}</Notice>
        ) : tickets.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No support tickets yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {tickets.map((tk) => (
              <div key={tk.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    <b style={{ fontSize: 14.5 }}>{tk.subject}</b>
                    <span className={tk.status === 'open' ? 'ktc-chip ktc-chip--warning' : 'ktc-chip'}>{t(TICKET_STATUS_LABEL[tk.status] ?? tk.status)}</span>
                    <span className="ktc-chip">{t(TICKET_CATEGORY_LABEL[tk.category] ?? tk.category)}</span>
                  </span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(tk.last_message_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {viewerModal}
    </AdminShell>
  )
}
