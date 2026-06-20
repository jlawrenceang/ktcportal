import { useCallback, useEffect, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { useT } from '../lib/i18n'
import { LockIcon } from '../components/icons'

// Customer support tickets — the logged system-of-record. Customers open
// tickets, exchange threaded messages with KTC, and (optionally) hand off to a
// live agent via call/email/Viber/SMS deep links that carry the ticket number.

interface Ticket {
  id: string
  subject: string
  category: string
  status: string
  created_at: string
  last_message_at: string
}

interface Message {
  id: string
  ticket_id: string
  author: string | null
  is_staff: boolean
  body: string
  created_at: string
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'app_system', label: 'App / System (bug or system concern)' },
  { key: 'customer_service', label: 'Customer service' },
  { key: 'operations', label: 'Operations' },
  { key: 'account', label: 'Account' },
  { key: 'accreditation', label: 'Accreditation' },
  { key: 'job_order', label: 'Job order' },
  { key: 'payment', label: 'Payment' },
  { key: 'other', label: 'Other' },
]
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
}
const STATUS_TONE: Record<string, string> = {
  open: 'info',
  closed: '',
}

type Channel = 'call' | 'email' | 'sms' | 'viber'

// A short, human ticket reference for off-platform messages.
function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

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

export default function SupportTickets() {
  const { t } = useT()
  const { broker } = useBroker()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New-ticket form.
  const [showNew, setShowNew] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('other')
  const [body, setBody] = useState('')
  const [creating, setCreating] = useState(false)

  // Open ticket thread. Stored as its own object (not derived from the list) so
  // the modal stays put after a reply or a list refresh.
  const [active, setActive] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  // Contact settings for the hand-off deep links.
  const [contact, setContact] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  const loadTickets = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, created_at, last_message_at')
      .order('last_message_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setTickets((data ?? []) as Ticket[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadTickets() }, [loadTickets])

  useEffect(() => {
    supabase
      .from('support_contact')
      .select('key, value')
      .then(({ data }) => {
        const map: Record<string, string> = {}
        for (const row of (data ?? []) as { key: string; value: string | null }[]) {
          if (row.value && row.value.trim()) map[row.key] = row.value.trim()
        }
        setContact(map)
      })
  }, [])

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
    setCopied(false)
    void loadThread(tk.id)
  }

  async function createTicket() {
    if (!subject.trim()) { setError(t('Please enter a subject.')); return }
    if (!body.trim()) { setError(t('Please enter a message.')); return }
    setCreating(true); setError(null)
    const { data, error: err } = await supabase.rpc('open_ticket', {
      p_subject: subject.trim(), p_category: category, p_body: body.trim(),
    })
    setCreating(false)
    if (err) { setError(err.message); return }
    const created: Ticket | null = typeof data === 'string'
      ? { id: data, subject: subject.trim(), category, status: 'open', created_at: new Date().toISOString(), last_message_at: new Date().toISOString() }
      : null
    setSubject(''); setCategory('other'); setBody(''); setShowNew(false)
    await loadTickets()
    if (created) openTicket(created)
  }

  async function sendReply() {
    if (!active || !reply.trim()) return
    setSending(true); setError(null)
    const { error: err } = await supabase.rpc('post_ticket_message', { p_ticket: active.id, p_body: reply.trim() })
    setSending(false)
    if (err) { setError(err.message); return }
    setReply('')
    await loadThread(active.id)
    void loadTickets()
  }

  // The prefilled message that carries the ticket reference off-platform.
  function prefill(ticket: Ticket): string {
    const name = broker?.full_name?.split(' ')[0] || t('Hi')
    return t(
      '{greeting}, this is regarding my KTC support ticket #{ref} ({subject}). ',
      { greeting: name, ref: shortRef(ticket.id), subject: ticket.subject },
    )
  }

  async function escalate(ticket: Ticket, channel: Channel) {
    // Fire-and-await so the off-platform hand-off is logged on the ticket.
    const { error: err } = await supabase.rpc('log_ticket_escalation', { p_ticket: ticket.id, p_channel: channel })
    if (!err) await loadThread(ticket.id)
  }

  async function copyPrefill(ticket: Ticket) {
    try {
      await navigator.clipboard.writeText(prefill(ticket))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard unavailable — the text is shown below to copy by hand */ }
  }

  // Deep-link hrefs per channel (empty channels are hidden by the caller).
  function channelHref(channel: Channel, ticket: Ticket): string {
    const msg = prefill(ticket)
    const phone = (contact.phone ?? '').replace(/[^+0-9]/g, '')
    const smsNo = (contact.sms ?? contact.phone ?? '').replace(/[^+0-9]/g, '')
    const viberNo = (contact.viber ?? '').replace(/[^+0-9]/g, '')
    switch (channel) {
      case 'call': return `tel:${phone}`
      case 'email': return `mailto:${contact.email}?subject=${encodeURIComponent(t('KTC support ticket #{ref}', { ref: shortRef(ticket.id) }))}&body=${encodeURIComponent(msg)}`
      case 'sms': return `sms:${smsNo}?body=${encodeURIComponent(msg)}`
      case 'viber': return `viber://chat?number=${encodeURIComponent(viberNo)}`
    }
  }

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="ktc-title">{t('Support')}</h1>
            <p className="ktc-sub" style={{ marginBottom: 0 }}>
              {t('Open a ticket and we’ll get back to you. You can also continue with a live agent below.')}
            </p>
          </div>
          <button type="button" className="ktc-btn" style={{ width: 'auto', padding: '9px 16px', fontSize: 13, whiteSpace: 'nowrap' }}
            onClick={() => { setShowNew((v) => !v); setError(null) }}>
            {showNew ? t('Cancel') : `+ ${t('New ticket')}`}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
            {error}
          </div>
        )}

        {/* New-ticket form */}
        {showNew && (
          <div style={{ marginTop: 16, display: 'grid', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
            <div>
              <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('Subject')}</label>
              <input className="ktc-input" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder={t('Short summary of your concern')} maxLength={120} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('Category')}</label>
              <select className="ktc-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%' }}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
              </select>
            </div>
            <div>
              <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('Message')}</label>
              <textarea className="ktc-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={t('Describe what you need help with…')} style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <button type="button" className="ktc-btn ktc-btn--sm" disabled={creating} onClick={() => void createTicket()} style={{ justifySelf: 'start' }}>
              {creating ? t('Submitting…') : t('Submit ticket')}
            </button>
          </div>
        )}

        {/* Ticket list */}
        <div style={{ marginTop: 18 }}>
          {loading ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {[52, 52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="ktc-label" style={{ fontSize: 14 }}>
              {t('No support tickets yet. Open one with the “New ticket” button.')}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {tickets.map((tk) => (
                <button key={tk.id} type="button" className="ktc-jo-row" onClick={() => openTicket(tk)}>
                  <span style={{ minWidth: 0, display: 'block' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 13.5 }}>{tk.subject}</b>
                      <StatusChip status={tk.status} />
                    </span>
                    <span className="ktc-label" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>
                      {t(CATEGORY_LABEL[tk.category] ?? tk.category)} · {t('Updated')} {fmtWhen(tk.last_message_at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Thread modal */}
      {active && (() => {
        const tk = active
        const close = () => { setActive(null); setMessages([]); setError(null) }
        const channels: { key: Channel; label: string; value: string | undefined }[] = [
          { key: 'call', label: t('Call'), value: contact.phone },
          { key: 'email', label: t('Email'), value: contact.email },
          { key: 'sms', label: t('SMS'), value: contact.sms ?? contact.phone },
          { key: 'viber', label: t('Viber'), value: contact.viber },
        ]
        const anyChannel = channels.some((c) => c.value)
        return (
          <div className="ktc-modal-backdrop" onClick={close}>
            <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
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
                  {t('Ticket')} #{shortRef(tk.id)} · {t(CATEGORY_LABEL[tk.category] ?? tk.category)} · {t('Opened')} {fmtWhen(tk.created_at)}
                </div>

                {/* Messages */}
                {threadLoading ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[40, 40].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {messages.map((m) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: m.is_staff ? 'flex-start' : 'flex-end' }}>
                        <div style={{
                          maxWidth: '82%',
                          padding: '9px 13px',
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: m.is_staff ? 'var(--c-w60)' : 'var(--c-h210-60-94)',
                          border: '1px solid var(--glass-brd)',
                        }}>
                          <div className="ktc-label" style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, opacity: 0.8 }}>
                            {m.is_staff ? t('KTC') : t('You')} · {fmtWhen(m.created_at)}
                          </div>
                          {m.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply — a closed ticket is locked; the customer continues via
                    a hand-off below or opens a new ticket. */}
                {tk.status === 'closed' ? (
                  <div className="ktc-label" style={{ fontSize: 12.5, marginTop: 14, padding: '10px 12px', borderRadius: 9, background: 'var(--c-w35)', border: '1px dashed var(--glass-brd)', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }}><LockIcon size={13} /></span>
                    {t('This ticket is closed. Open a new ticket if you need further help.')}
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    <textarea className="ktc-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)}
                      placeholder={t('Type your reply…')} style={{ width: '100%', resize: 'vertical' }} />
                    <button type="button" className="ktc-btn ktc-btn--sm" disabled={sending || !reply.trim()} onClick={() => void sendReply()} style={{ justifySelf: 'start' }}>
                      {sending ? t('Sending…') : t('Send reply')}
                    </button>
                  </div>
                )}

                {/* Talk to an agent now */}
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--glass-brd)' }}>
                  <div className="ktc-label" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{t('Talk to an agent now')}</div>
                  {!anyChannel ? (
                    <div className="ktc-label" style={{ fontSize: 12.5 }}>
                      {t('Live contact details aren’t set up yet — please use the ticket above and we’ll reply here.')}
                    </div>
                  ) : (
                    <>
                      <p className="ktc-label" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                        {t('Continue this ticket off-platform. Your ticket number is included so we can find it fast.')}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {channels.filter((c) => c.value).map((c) => (
                          <a key={c.key} className="ktc-btn-secondary ktc-btn--sm" style={{ textDecoration: 'none' }}
                            href={channelHref(c.key, tk)} onClick={() => void escalate(tk, c.key)}>
                            {c.label}
                          </a>
                        ))}
                        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void copyPrefill(tk)}>
                          {copied ? t('✓ Copied') : t('Copy message')}
                        </button>
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                        {contact.phone && (
                          <div className="ktc-label" style={{ fontSize: 12 }}>{t('Phone')}: <span className="ktc-mono">{contact.phone}</span></div>
                        )}
                        {contact.email && (
                          <div className="ktc-label" style={{ fontSize: 12 }}>{t('Email')}: <span className="ktc-mono">{contact.email}</span></div>
                        )}
                        {contact.viber && (
                          <div className="ktc-label" style={{ fontSize: 12 }}>{t('Viber')}: <span className="ktc-mono">{contact.viber}</span></div>
                        )}
                        {contact.hours && (
                          <div className="ktc-label" style={{ fontSize: 12 }}>{t('Hours')}: {contact.hours}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </Shell>
  )
}
