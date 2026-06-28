import { useCallback, useEffect, useState } from 'react'
import RoleShell from '../app/RoleShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { usePageTour } from '../components/TourProvider'
import { supportSteps } from './AdminTour'
import { useT } from '../lib/i18n'
import { LockIcon } from '../components/icons'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import { searchCustomers } from '../lib/pickerSearches'

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
  app_system: 'App / System',
  customer_service: 'Customer service',
  operations: 'Operations',
  other: 'Other',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
}
const STATUS_TONE: Record<string, string> = {
  open: 'warning',
  closed: '',
}

type Filter = 'all' | 'open' | 'closed'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
]

// Category filter for the list (T2-24) — the customer/Lara-facing set.
type CatFilter = 'all' | 'account' | 'accreditation' | 'job_order' | 'payment' | 'other'
const CAT_FILTERS: { key: CatFilter; label: string }[] = [
  { key: 'all', label: 'All categories' },
  { key: 'account', label: 'Account' },
  { key: 'accreditation', label: 'Accreditation' },
  { key: 'job_order', label: 'Job order' },
  { key: 'payment', label: 'Payment' },
  { key: 'other', label: 'Other' },
]

// Categories a staffer may pick when opening a ticket on a customer's behalf
// (T2-25) — must match the staff_open_ticket / support_tickets CHECK set.
const NEW_TICKET_CATEGORIES: { key: string; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'accreditation', label: 'Accreditation' },
  { key: 'job_order', label: 'Job order' },
  { key: 'payment', label: 'Payment' },
  { key: 'other', label: 'Other' },
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

export default function SupportInbox({ app = false }: { app?: boolean }) {
  const { t } = useT()
  usePageTour('support', supportSteps)
  const { can, loading: permLoading } = usePermissions()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [catFilter, setCatFilter] = useState<CatFilter>('all')
  const [error, setError] = useState<string | null>(null)

  // New-ticket composer (T2-25) — staff opens a ticket on a customer's behalf.
  const [composing, setComposing] = useState(false)
  const [ntCustomer, setNtCustomer] = useState<PickerItem | null>(null)
  const [ntSubject, setNtSubject] = useState('')
  const [ntCategory, setNtCategory] = useState('account')
  const [ntBody, setNtBody] = useState('')
  const [ntBusy, setNtBusy] = useState(false)
  const [ntError, setNtError] = useState<string | null>(null)

  // The open ticket is stored as its own object (not derived from the filtered
  // list) so the thread modal stays put after a reply / status change — it used
  // to vanish or re-pop when the row left the current filter.
  const [active, setActive] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)

  const allowed = can('manage_support')

  const loadTickets = useCallback(async (f: Filter, c: CatFilter) => {
    let q = supabase
      .from('support_tickets')
      .select(SELECT)
    if (f !== 'all') q = q.eq('status', f)
    if (c !== 'all') q = q.eq('category', c)
    const { data, error: err } = await q.order('last_message_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    const rows = ((data ?? []) as unknown as Ticket[]).map((tk) => ({ ...tk, customer: one(tk.customer) }))
    setTickets(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (permLoading || !allowed) return
    void loadTickets(filter, catFilter)
  }, [permLoading, allowed, filter, catFilter, loadTickets])

  function changeFilter(f: Filter) {
    setFilter(f); setLoading(true)
  }
  function changeCat(c: CatFilter) {
    setCatFilter(c); setLoading(true)
  }

  function openCompose() {
    setNtCustomer(null); setNtSubject(''); setNtCategory('account'); setNtBody(''); setNtError(null)
    setComposing(true)
  }

  async function submitNewTicket() {
    if (!ntCustomer) { setNtError(t('Select a customer.')); return }
    if (!ntSubject.trim()) { setNtError(t('Enter a subject.')); return }
    if (!ntBody.trim()) { setNtError(t('Enter a message.')); return }
    setNtBusy(true); setNtError(null)
    const { data, error: err } = await supabase.rpc('staff_open_ticket', {
      p_customer: ntCustomer.id,
      p_subject: ntSubject.trim(),
      p_category: ntCategory,
      p_body: ntBody.trim(),
    })
    setNtBusy(false)
    if (err) { setNtError(err.message); return }
    setComposing(false)
    await loadTickets(filter, catFilter)
    // Pull the freshly-opened ticket and open its thread.
    const newId = data as unknown as string
    const { data: tk } = await supabase.from('support_tickets').select(SELECT).eq('id', newId).single()
    if (tk) {
      const row = tk as unknown as Ticket
      openTicket({ ...row, customer: one(row.customer) })
    }
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

  function openTicket(tk: Ticket) {
    setActive(tk)
    setReply('')
    setError(null)
    void loadThread(tk.id)
  }

  async function sendReply() {
    if (!active || !reply.trim()) return
    setSending(true); setError(null)
    const { error: err } = await supabase.rpc('post_ticket_message', { p_ticket: active.id, p_body: reply.trim() })
    setSending(false)
    if (err) { setError(err.message); return }
    setReply('')
    await loadThread(active.id)
    void loadTickets(filter, catFilter)
  }

  async function setStatus(status: string) {
    if (!active) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('set_ticket_status', { p_ticket: active.id, p_status: status })
    setBusy(false)
    if (err) { setError(err.message); return }
    // Update the open ticket in place so the modal reflects the new status and
    // stays open (no flicker, no disappearing row).
    setActive((a) => (a ? { ...a, status } : a))
    void loadThread(active.id)
    void loadTickets(filter, catFilter)
  }

  if (permLoading) {
    return (
      <RoleShell app={app} title="Support">
        <div className="ktc-glass" style={{ padding: 18 }}>
          <div className="ktc-label">{t('Loading…')}</div>
        </div>
      </RoleShell>
    )
  }

  if (!allowed) {
    return (
      <RoleShell app={app} title="Support">
        <div className="ktc-glass" style={{ padding: 18 }}>
          <h1 className="ktc-title">{t('Support')}</h1>
          <p className="ktc-label" style={{ fontSize: 14, marginTop: 8 }}>
            {t('You don’t have access to the support inbox.')}
          </p>
        </div>
      </RoleShell>
    )
  }

  return (
    <RoleShell app={app} title="Support">
      <div className="ktc-glass" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="ktc-title">{t('Support')}</h1>
          {/* manage_support already gates this whole page (early return below), so
              reaching here means the staffer may open a ticket on a customer's behalf. */}
          <button type="button" className="ktc-btn ktc-btn--sm" style={{ width: 'auto' }} onClick={openCompose}>
            + {t('New ticket')}
          </button>
        </div>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Customer support tickets. Newest activity first.')}</p>

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
            {error}
          </div>
        )}

        {/* Status + category filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={`ktc-nav-link${filter === f.key ? ' is-active' : ''}`} onClick={() => changeFilter(f.key)}>
                {t(f.label)}
              </button>
            ))}
          </div>
          <label className="ktc-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12.5 }}>
            {t('Category')}
            <select className="ktc-input" value={catFilter} onChange={(e) => changeCat(e.target.value as CatFilter)} style={{ width: 'auto', padding: '6px 10px' }}>
              {CAT_FILTERS.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
            </select>
          </label>
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
              <button key={tk.id} type="button" onClick={() => openTicket(tk)}
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
      {active && (() => {
        const tk = active
        const close = () => { setActive(null); setMessages([]); setError(null) }
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
                  {tk.status !== 'closed' ? (
                    <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void setStatus('closed')}>
                      {t('Close ticket')}
                    </button>
                  ) : (
                    <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={busy} onClick={() => void setStatus('open')}>
                      {t('Reopen ticket')}
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

                {/* Reply — a closed ticket is locked; reopen it to continue. */}
                {tk.status === 'closed' ? (
                  <div className="ktc-label" style={{ fontSize: 12.5, marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--c-w35)', border: '1px dashed var(--glass-brd)', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }}><LockIcon size={13} /></span>
                    {t('This ticket is closed. Reopen it to send a message.')}
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    <textarea className="ktc-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)}
                      placeholder={t('Type your reply to the customer…')} style={{ width: '100%', resize: 'vertical' }} />
                    <button type="button" className="ktc-btn ktc-btn--sm" disabled={sending || !reply.trim()} onClick={() => void sendReply()} style={{ justifySelf: 'start' }}>
                      {sending ? t('Sending…') : t('Send reply')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* New-ticket composer — staff opens a ticket on a customer's behalf (T2-25). */}
      {composing && (
        <div className="ktc-modal-backdrop" onClick={() => { if (!ntBusy) setComposing(false) }}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
              <b style={{ fontSize: 15 }}>{t('New support ticket')}</b>
              <button type="button" aria-label={t('Close')} onClick={() => setComposing(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'grid', gap: 14 }}>
              <p className="ktc-label" style={{ fontSize: 12.5, margin: 0 }}>
                {t('Open a ticket on a customer’s behalf (phone, walk-in, or proactive). The customer sees the thread and can reply.')}
              </p>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="nt-customer">{t('Customer')}</label>
                <SearchPicker
                  inputId="nt-customer"
                  placeholder={t('Search by name, customer code, or email…')}
                  selected={ntCustomer}
                  onSelect={setNtCustomer}
                  search={searchCustomers}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="nt-subject">{t('Subject')}</label>
                <input id="nt-subject" className="ktc-input" value={ntSubject} onChange={(e) => setNtSubject(e.target.value)} placeholder={t('Short summary')} />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="nt-category">{t('Category')}</label>
                <select id="nt-category" className="ktc-input" value={ntCategory} onChange={(e) => setNtCategory(e.target.value)}>
                  {NEW_TICKET_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="nt-body">{t('Message')}</label>
                <textarea id="nt-body" className="ktc-input" rows={4} value={ntBody} onChange={(e) => setNtBody(e.target.value)}
                  placeholder={t('What does the customer need?')} style={{ width: '100%', resize: 'vertical' }} />
              </div>

              {ntError && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{ntError}</div>}

              <button type="button" className="ktc-btn ktc-btn--sm" disabled={ntBusy} onClick={() => void submitNewTicket()} style={{ justifySelf: 'start' }}>
                {ntBusy ? t('Opening…') : t('Open ticket')}
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleShell>
  )
}
