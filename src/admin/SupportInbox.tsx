import { useCallback, useEffect, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { usePageTour } from '../components/TourProvider'
import { supportSteps } from './AdminTour'
import { useT } from '../lib/i18n'

// Staff support inbox — gated on the manage_support permission. Lists every
// ticket with a status filter; opening one shows the thread, a reply box, and
// status controls (mark answered / close / reopen). Writes go through the
// SECURITY DEFINER RPCs (post_ticket_message / set_ticket_status).

interface Ticket {
  id: string
  customer_id: string
  subject: string
  category: string
  status: string
  created_at: string
  last_message_at: string
  customer?: { full_name: string | null; email: string | null } | null
}

interface Message {
  id: string
  ticket_id: string
  author: string | null
  is_staff: boolean
  body: string
  created_at: string
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const CATEGORY_LABEL: Record<string, string> = {
  account: 'Account',
  accreditation: 'Accreditation',
  job_order: 'Job order',
  payment: 'Payment',
  other: 'Other',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
}
const STATUS_TONE: Record<string, string> = {
  open: 'warning',
  answered: 'info',
  closed: '',
}

type Filter = 'all' | 'open' | 'answered' | 'closed'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'answered', label: 'Answered' },
  { key: 'closed', label: 'Closed' },
]

const SELECT =
  'id, customer_id, subject, category, status, created_at, last_message_at, customer:customers(full_name, email)'

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString()
}

function StatusChip({ status }: { status: string }) {
  const { t } = useT()
  const tone = STATUS_TONE[status]
  return (
    <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>
      {t(STATUS_LABEL[status] ?? status)}
    </span>
  )
}

export default function SupportInbox() {
  const { t } = useT()
  usePageTour('support', supportSteps)
  const { can, loading: permLoading } = usePermissions()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('open')
  const [error, setError] = useState<string | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)

  const allowed = can('manage_support')

  const loadTickets = useCallback(async (f: Filter) => {
    let q = supabase
      .from('support_tickets')
      .select(SELECT)
    if (f !== 'all') q = q.eq('status', f)
    const { data, error: err } = await q.order('last_message_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    const rows = ((data ?? []) as unknown as Ticket[]).map((tk) => ({ ...tk, customer: one(tk.customer) }))
    setTickets(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (permLoading || !allowed) return
    void loadTickets(filter)
  }, [permLoading, allowed, filter, loadTickets])

  function changeFilter(f: Filter) {
    setFilter(f); setLoading(true)
  }

  const loadThread = useCallback(async (ticketId: string) => {
    setThreadLoading(true)
    const { data, error: err } = await supabase
      .from('support_messages')
      .select('id, ticket_id, author, is_staff, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    setThreadLoading(false)
    if (err) { setError(err.message); return }
    setMessages((data ?? []) as Message[])
  }, [])

  function openTicket(ticketId: string) {
    setOpenId(ticketId)
    setReply('')
    setError(null)
    void loadThread(ticketId)
  }

  async function sendReply() {
    if (!openId || !reply.trim()) return
    setSending(true); setError(null)
    const { error: err } = await supabase.rpc('post_ticket_message', { p_ticket: openId, p_body: reply.trim() })
    setSending(false)
    if (err) { setError(err.message); return }
    setReply('')
    await loadThread(openId)
    await loadTickets(filter)
  }

  async function setStatus(ticketId: string, status: string) {
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('set_ticket_status', { p_ticket: ticketId, p_status: status })
    setBusy(false)
    if (err) { setError(err.message); return }
    await loadThread(ticketId)
    await loadTickets(filter)
  }

  if (permLoading) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <div className="ktc-label">{t('Loading…')}</div>
        </div>
      </AdminShell>
    )
  }

  if (!allowed) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <h1 className="ktc-title">{t('Support')}</h1>
          <p className="ktc-label" style={{ fontSize: 14, marginTop: 8 }}>
            {t('You don’t have access to the support inbox.')}
          </p>
        </div>
      </AdminShell>
    )
  }

  const openTicketRow = tickets.find((tk) => tk.id === openId) ?? null

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Support')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Customer support tickets. Newest activity first.')}</p>

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
            {error}
          </div>
        )}

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`ktc-nav-link${filter === f.key ? ' is-active' : ''}`} onClick={() => changeFilter(f.key)}>
              {t(f.label)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {[64, 64, 64].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 14 }} />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No tickets in this view.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {tickets.map((tk) => (
              <button key={tk.id} type="button" onClick={() => openTicket(tk.id)}
                style={{ textAlign: 'left', cursor: 'pointer', padding: '14px 16px', borderRadius: 14, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    <b style={{ fontSize: 14.5 }}>{tk.subject}</b>
                    <StatusChip status={tk.status} />
                    <span className="ktc-chip">{t(CATEGORY_LABEL[tk.category] ?? tk.category)}</span>
                  </span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{fmtWhen(tk.last_message_at)}</span>
                </div>
                <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                  {tk.customer?.full_name || tk.customer?.email || t('Unknown customer')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread modal */}
      {openTicketRow && (() => {
        const tk = openTicketRow
        const close = () => { setOpenId(null); setMessages([]); setError(null) }
        return (
          <div className="ktc-modal-backdrop" onClick={close}>
            <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                  <b style={{ fontSize: 15 }}>{tk.subject}</b>
                  <StatusChip status={tk.status} />
                </div>
                <button type="button" aria-label={t('Close')} onClick={close}
                  style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
                <div className="ktc-label" style={{ fontSize: 12, marginBottom: 12 }}>
                  {tk.customer?.full_name || tk.customer?.email || t('Unknown customer')}
                  {' · '}{t(CATEGORY_LABEL[tk.category] ?? tk.category)}
                  {' · '}{t('Opened')} {fmtWhen(tk.created_at)}
                </div>

                {/* Status controls */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {tk.status !== 'answered' && (
                    <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void setStatus(tk.id, 'answered')}>
                      {t('Mark answered')}
                    </button>
                  )}
                  {tk.status !== 'closed' && (
                    <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void setStatus(tk.id, 'closed')}>
                      {t('Close')}
                    </button>
                  )}
                  {tk.status === 'closed' && (
                    <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void setStatus(tk.id, 'open')}>
                      {t('Reopen')}
                    </button>
                  )}
                </div>

                {/* Messages */}
                {threadLoading ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[40, 40].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {messages.map((m) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: m.is_staff ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '82%',
                          padding: '9px 13px',
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: m.is_staff ? 'var(--c-h210-60-94)' : 'var(--c-w60)',
                          border: '1px solid var(--glass-brd)',
                        }}>
                          <div className="ktc-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, opacity: 0.8 }}>
                            {m.is_staff ? t('KTC') : t('Customer')} · {fmtWhen(m.created_at)}
                          </div>
                          {m.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply */}
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <textarea className="ktc-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)}
                    placeholder={t('Type your reply to the customer…')} style={{ width: '100%', resize: 'vertical' }} />
                  <button type="button" className="ktc-btn ktc-btn--sm" disabled={sending || !reply.trim()} onClick={() => void sendReply()} style={{ justifySelf: 'start' }}>
                    {sending ? t('Sending…') : t('Send reply')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </AdminShell>
  )
}
