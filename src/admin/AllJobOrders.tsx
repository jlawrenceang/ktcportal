import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import { useFileViewer } from '../components/FileViewerModal'
import { SERVICE_LINE_LABEL, type JobOrder, type ServingNumber } from '../lib/types'

interface AdminJobOrder extends JobOrder {
  broker?: { full_name: string | null; email: string | null; contact_number: string | null } | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  processing: 'Approved · processing',
  on_hold: 'On hold · info needed',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}
const STATUS_STYLE: Record<string, { bg: string; ink: string }> = {
  submitted: { bg: 'hsl(210 60% 90%)', ink: 'hsl(210 55% 36%)' },
  processing: { bg: 'hsl(265 55% 91%)', ink: 'hsl(265 45% 42%)' },
  on_hold: { bg: 'hsl(40 90% 86%)', ink: 'hsl(30 75% 32%)' },
  completed: { bg: 'hsl(150 50% 88%)', ink: 'hsl(150 55% 26%)' },
  rejected: { bg: 'hsl(0 75% 92%)', ink: 'hsl(0 65% 42%)' },
  cancelled: { bg: 'hsl(220 12% 88%)', ink: 'hsl(220 8% 40%)' },
}

const SELECT =
  'id, jo_number, entry_number, status, admin_note, customer_note, rejected_recoverable, xray_performed_at, service_invoice_no, payment_status, payment_proof_path, payment_submitted_at, created_at, broker:customers(full_name, email, contact_number), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), serving:serving_numbers(service_line, serving_no, week_start, vacated_at)'

// A resubmitted order went to the back of the line; the admin can restore its
// original (lower, same-week) number. Returns the restorable options.
function restorable(o: JobOrder): { line: ServingNumber['service_line']; no: number }[] {
  const out: { line: ServingNumber['service_line']; no: number }[] = []
  if (!['submitted', 'processing', 'on_hold'].includes(o.status)) return out
  const byLine = new Map<string, ServingNumber[]>()
  for (const s of o.serving ?? []) {
    if (!byLine.has(s.service_line)) byLine.set(s.service_line, [])
    byLine.get(s.service_line)!.push(s)
  }
  for (const [line, rows] of byLine) {
    const active = rows.find((r) => !r.vacated_at)
    const week = active?.week_start
    const oldBest = rows
      .filter((r) => r.vacated_at && (!week || r.week_start === week))
      .sort((a, b) => a.serving_no - b.serving_no)[0]
    if (oldBest && active && oldBest.serving_no < active.serving_no) {
      out.push({ line: line as ServingNumber['service_line'], no: oldBest.serving_no })
    }
  }
  return out
}

// Plain-text status message for chat apps (Viber / SMS / Messenger). Composed
// per order; staff send it from their own device via the share buttons.
function chatMessage(o: AdminJobOrder): string {
  const name = (o.broker?.full_name || '').split(' ')[0] || 'there'
  const jo = o.jo_number ?? 'your job order'
  const status = STATUS_LABEL[o.status] ?? o.status
  const lines = [
    `Hi ${name}! This is KTC Container Terminal regarding job order ${jo}.`,
    `Status: ${status}.`,
  ]
  if (o.admin_note && (o.status === 'on_hold' || o.status === 'rejected')) lines.push(`Note from KTC: ${o.admin_note}`)
  if (o.status === 'on_hold') lines.push('Please open the portal to update the order and resubmit it.')
  if (o.status === 'rejected' && o.rejected_recoverable !== false) lines.push('You can fix and resubmit the same order from the portal.')
  if (o.status === 'completed') lines.push('Your order is complete — you can print the slip from the portal.')
  lines.push('Track it here: https://portal.ktcterminal.com/job-orders')
  lines.push('Thank you!')
  return lines.join('\n')
}

const btn = (variant: 'solid' | 'ghost' | 'danger'): CSSProperties => ({
  border: variant === 'ghost' ? '1px solid var(--glass-brd)' : 0,
  borderRadius: 9,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  color: variant === 'solid' ? '#fff' : variant === 'danger' ? 'var(--acc-2)' : 'hsl(var(--ink))',
  background: variant === 'solid' ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : variant === 'danger' ? 'hsl(0 75% 96%)' : 'rgba(255,255,255,0.6)',
})

export default function AllJobOrders() {
  const { can } = usePermissions()
  const [orders, setOrders] = useState<AdminJobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // ERP Service Invoice recording (cashier): JO id being recorded + the number.
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [invoiceNo, setInvoiceNo] = useState('')
  // Note prompt for hold / reject (the note is shown to the customer).
  const [modal, setModal] = useState<{ id: string; jo: string; target: 'on_hold' | 'rejected' } | null>(null)
  const [note, setNote] = useState('')
  const [recoverable, setRecoverable] = useState(true) // reject: allow fix & resubmit
  // Chat status-message generator (Viber / SMS / copy-paste).
  const [msgOrder, setMsgOrder] = useState<AdminJobOrder | null>(null)
  const [copied, setCopied] = useState(false)
  // Payment-proof review (permission: review_payments).
  const [payReject, setPayReject] = useState<AdminJobOrder | null>(null)
  const [payNote, setPayNote] = useState('')
  const { openFromStorage, viewerModal } = useFileViewer((m) => alert(m))

  function load() {
    return supabase
      .from('job_orders')
      .select(SELECT)
      .neq('status', 'held') // held = not-yet-verified customers; kept out of the queue
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = ((data ?? []) as unknown as AdminJobOrder[]).map((o) => ({
          ...o,
          broker: one(o.broker),
          consignee: one(o.consignee),
        }))
        setOrders(rows)
        setLoading(false)
      })
  }

  useEffect(() => { void load() }, [])

  async function apply(id: string, status: string, adminNote?: string | null, rejectedRecoverable?: boolean) {
    setBusyId(id)
    const patch: Record<string, unknown> = { status }
    if (adminNote !== undefined) patch.admin_note = adminNote
    if (rejectedRecoverable !== undefined) patch.rejected_recoverable = rejectedRecoverable
    const { error } = await supabase.from('job_orders').update(patch).eq('id', id)
    if (error) { setBusyId(null); alert(error.message); return }
    await load()
    setBusyId(null)
  }

  function openNote(o: AdminJobOrder, target: 'on_hold' | 'rejected') {
    setModal({ id: o.id, jo: o.jo_number ?? '—', target })
    setNote(o.admin_note ?? '')
    setRecoverable(true)
  }

  async function confirmNote() {
    if (!modal) return
    if (!note.trim()) { alert('Please add a note for the customer.'); return }
    const id = modal.id, target = modal.target
    setModal(null)
    await apply(id, target, note.trim(), target === 'rejected' ? recoverable : undefined)
    setNote('')
  }

  async function restoreNumber(id: string, line: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('restore_serving_number', { p_jo: id, p_line: line })
    setBusyId(null)
    if (error) { alert(error.message); return }
    await load()
  }

  async function reviewPayment(id: string, confirm: boolean, note?: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('review_payment', { p_id: id, p_confirm: confirm, p_note: note ?? null })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setPayReject(null); setPayNote('')
    await load()
  }

  async function recordInvoice() {
    if (!invoiceId || !invoiceNo.trim()) return
    setBusyId(invoiceId)
    const { error } = await supabase.rpc('record_service_invoice', { p_id: invoiceId, p_invoice_no: invoiceNo.trim() })
    setBusyId(null)
    if (error) { alert(error.message); return }
    setInvoiceId(null); setInvoiceNo('')
    await load()
  }

  async function copyMessage() {
    if (!msgOrder) return
    try {
      await navigator.clipboard.writeText(chatMessage(msgOrder))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard unavailable — text is selectable in the box */ }
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 className="ktc-title">Job Orders</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>Review and process job orders from verified customers.</p>

        {loading ? <span className="ktc-label">Loading…</span> : orders.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No job orders yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {orders.map((o) => {
              const sp = STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled
              const printable = o.status === 'processing' || o.status === 'completed'
              const isBusy = busyId === o.id
              return (
                <div key={o.id} style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <b className="ktc-mono" style={{ fontSize: 14.5 }}>{o.jo_number ?? '—'}</b>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.service_invoice_no && (
                        <span className="ktc-chip ktc-chip--success" title={`Service Invoice ${o.service_invoice_no}`}>
                          PAID · SI {o.service_invoice_no}
                        </span>
                      )}
                      {(o.serving ?? []).filter((s) => !s.vacated_at).map((s) => (
                        <span key={s.service_line} className="ktc-chip ktc-chip--accent" title={`This week's ${SERVICE_LINE_LABEL[s.service_line]} line number`}>
                          {SERVICE_LINE_LABEL[s.service_line]} #{s.serving_no}
                        </span>
                      ))}
                      {!o.service_invoice_no && o.payment_status === 'submitted' && (
                        <span className="ktc-chip ktc-chip--warning">Payment proof to review</span>
                      )}
                      {!o.service_invoice_no && o.payment_status === 'confirmed' && (
                        <span className="ktc-chip ktc-chip--success">Payment confirmed</span>
                      )}
                      {o.xray_performed_at && !o.service_invoice_no && (
                        <span className="ktc-chip ktc-chip--info" title={new Date(o.xray_performed_at).toLocaleString()}>
                          X-ray done
                        </span>
                      )}
                    </span>
                    <span className="ktc-label" style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString()}</span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>
                    {o.broker?.full_name || o.broker?.email || 'Unknown customer'}
                    {' · '}{o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'no consignee'}
                    {o.entry_number ? ` · Entry ${o.entry_number}` : ''}
                  </div>
                  {o.lines && o.lines.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {o.lines.map((l, i) => (<li key={i}>{l.container_number} — {l.service_request}</li>))}
                    </ul>
                  )}
                  {o.admin_note && (o.status === 'on_hold' || o.status === 'rejected') && (
                    <div style={{ marginTop: 10, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'hsl(40 90% 96%)', border: '1px solid hsl(35 85% 84%)', color: 'hsl(30 60% 32%)' }}>
                      <b>Note to customer:</b> {o.admin_note}
                      {o.status === 'rejected' && o.rejected_recoverable === false && <> · <b>terminal</b> (customer can’t resubmit)</>}
                    </div>
                  )}
                  {o.customer_note && (
                    <div style={{ marginTop: 8, fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'hsl(210 60% 96%)', border: '1px solid hsl(210 55% 86%)', color: 'hsl(210 55% 32%)' }}>
                      <b>Customer reply:</b> {o.customer_note}
                    </div>
                  )}

                  {/* Actions — gated by the owner-tweakable role permissions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {can('process_job_orders') && restorable(o).map((r) => (
                      <button key={r.line} style={btn('ghost')} disabled={isBusy}
                        title="This order was resubmitted and went to the back of the line — restore its original number"
                        onClick={() => void restoreNumber(o.id, r.line)}>
                        ↩ Restore {SERVICE_LINE_LABEL[r.line]} #{r.no}
                      </button>
                    ))}
                    {can('process_job_orders') && (
                      <>
                        {(o.status === 'submitted' || o.status === 'on_hold') && (
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'processing', null)}>Approve &amp; process</button>
                        )}
                        {o.status === 'processing' && (
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void apply(o.id, 'completed')}>Mark completed</button>
                        )}
                        {(o.status === 'submitted' || o.status === 'processing') && (
                          <button style={btn('ghost')} disabled={isBusy} onClick={() => openNote(o, 'on_hold')}>Hold for info</button>
                        )}
                        {(o.status === 'submitted' || o.status === 'processing' || o.status === 'on_hold') && (
                          <button style={btn('danger')} disabled={isBusy} onClick={() => openNote(o, 'rejected')}>Reject</button>
                        )}
                      </>
                    )}
                    {can('review_payments') && o.payment_status === 'submitted' && (
                      payReject?.id === o.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="ktc-input"
                            value={payNote}
                            onChange={(e) => setPayNote(e.target.value)}
                            placeholder="Why? (shown to the customer)"
                            autoFocus
                            style={{ width: 230, padding: '7px 11px', fontSize: 13 }}
                          />
                          <button style={btn('danger')} disabled={isBusy || !payNote.trim()} onClick={() => void reviewPayment(o.id, false, payNote.trim())}>Reject proof</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setPayReject(null); setPayNote('') }}>Cancel</button>
                        </span>
                      ) : (
                        <>
                          <button style={btn('ghost')} onClick={() => void openFromStorage('payment-slips', o.payment_proof_path, `Payment slip — ${o.jo_number ?? ''} (${o.broker?.full_name ?? ''})`)}>
                            View payment slip
                          </button>
                          <button style={btn('solid')} disabled={isBusy} onClick={() => void reviewPayment(o.id, true)}>Confirm payment</button>
                          <button style={btn('danger')} disabled={isBusy} onClick={() => { setPayReject(o); setPayNote('') }}>Reject proof</button>
                        </>
                      )
                    )}
                    {can('record_invoice') && o.status === 'completed' && !o.service_invoice_no && (
                      invoiceId === o.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input
                            className="ktc-input ktc-mono"
                            value={invoiceNo}
                            onChange={(e) => setInvoiceNo(e.target.value)}
                            placeholder="Service Invoice no."
                            autoFocus
                            style={{ width: 170, padding: '7px 11px', fontSize: 13 }}
                          />
                          <button style={btn('solid')} disabled={isBusy || !invoiceNo.trim()} onClick={() => void recordInvoice()}>Save · PAID</button>
                          <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => { setInvoiceId(null); setInvoiceNo('') }}>Cancel</button>
                        </span>
                      ) : (
                        <button style={btn('ghost')} onClick={() => { setInvoiceId(o.id); setInvoiceNo('') }} title="Record the ERP Service Invoice number — having one on file marks the order PAID">
                          Record invoice #
                        </button>
                      )
                    )}
                    {printable && (
                      <Link to={`/job-order/${o.id}/print`} target="_blank" style={{ ...btn('ghost'), textDecoration: 'none' }}>Print slip ↗</Link>
                    )}
                    <button style={btn('ghost')} onClick={() => { setMsgOrder(o); setCopied(false) }} title="Compose a status message for Viber / SMS / Messenger">
                      💬 Message
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {viewerModal}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass" style={{ maxWidth: 460, width: '100%', padding: 26 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              {modal.target === 'on_hold' ? 'Hold for information' : 'Reject job order'} · {modal.jo}
            </h2>
            <p className="ktc-label" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
              {modal.target === 'on_hold'
                ? 'Tell the customer what information or update you need. They’ll see this note on the order.'
                : 'Tell the customer why this order is being rejected. They’ll see this note on the order.'}
            </p>
            <textarea
              className="ktc-input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={modal.target === 'on_hold' ? 'e.g. Please confirm the entry number — it doesn’t match the consignee.' : 'e.g. Duplicate of JO-000123.'}
              style={{ marginTop: 12, resize: 'vertical', minHeight: 90 }}
            />
            {modal.target === 'rejected' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} style={{ marginTop: 2 }} />
                <span className="ktc-label" style={{ fontSize: 13 }}>
                  Allow the customer to <b>fix &amp; resubmit</b> this order (untick to close it permanently — they’d have to file a new one)
                </span>
              </label>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button style={btn(modal.target === 'rejected' ? 'danger' : 'solid')} onClick={() => void confirmNote()}>
                {modal.target === 'on_hold' ? 'Put on hold' : 'Reject order'}
              </button>
              <button type="button" className="ktc-link" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat status-message generator: composes the message; staff send it via
          their own Viber/SMS. Messenger has no prefill — use Copy, then paste. */}
      {msgOrder && (
        <div className="ktc-modal-backdrop" onClick={() => setMsgOrder(null)}>
          <div className="ktc-glass-thick ktc-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: 24 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>
              Status message · <span className="ktc-mono">{msgOrder.jo_number ?? '—'}</span>
            </h2>
            <p className="ktc-label" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
              To {msgOrder.broker?.full_name || msgOrder.broker?.email || 'customer'}
              {msgOrder.broker?.contact_number ? <> · <span className="ktc-mono">{msgOrder.broker.contact_number}</span></> : ' · no contact number on file'}
            </p>
            <textarea
              className="ktc-input"
              readOnly
              value={chatMessage(msgOrder)}
              rows={8}
              onFocus={(e) => e.currentTarget.select()}
              style={{ marginTop: 10, resize: 'vertical', fontSize: 13, lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="ktc-btn ktc-btn--sm" type="button" onClick={() => void copyMessage()}>
                {copied ? '✓ Copied' : 'Copy message'}
              </button>
              <a
                className="ktc-btn-secondary ktc-btn--sm"
                href={`viber://forward?text=${encodeURIComponent(chatMessage(msgOrder))}`}
                onClick={() => void copyMessage()} // also copy, so paste works if the prefill doesn't carry over
                style={{ textDecoration: 'none' }}
                title="Copies the message and opens Viber's forward screen — pick the customer's chat (paste if the text doesn't carry over)"
              >
                Send via Viber
              </a>
              {msgOrder.broker?.contact_number && (
                <a
                  className="ktc-btn-secondary ktc-btn--sm"
                  href={`sms:${msgOrder.broker.contact_number.replace(/[^+0-9]/g, '')}?body=${encodeURIComponent(chatMessage(msgOrder))}`}
                  style={{ textDecoration: 'none' }}
                  title="Opens your SMS app with the message pre-filled (mobile)"
                >
                  SMS
                </a>
              )}
              <button type="button" className="ktc-link" onClick={() => setMsgOrder(null)} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
            <p className="ktc-label" style={{ marginTop: 10, fontSize: 11.5, opacity: 0.8, lineHeight: 1.5 }}>
              Messenger doesn’t allow pre-filled messages — use Copy, then paste into the chat. Viber/SMS buttons work on devices with those apps installed.
            </p>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
