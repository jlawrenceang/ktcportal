import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import type { JobOrder } from '../lib/types'

const STATUS_LABEL: Record<string, string> = {
  held: 'Pending approval',
  submitted: 'Submitted',
  processing: 'Approved · processing',
  on_hold: 'On hold · info needed',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

// Per-status semantic tone, rendered with the shared .ktc-chip classes.
const STATUS_TONE: Record<string, string> = {
  held: 'warning',
  submitted: 'info',
  processing: 'progress',
  on_hold: 'warning',
  completed: 'success',
  rejected: 'danger',
  cancelled: '',
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// Inline form for the two "fix and resubmit" paths: respond to an on-hold
// order, or resubmit a recoverable rejected order. Calls the matching RPC —
// customers have no UPDATE policy; the SECURITY DEFINER RPC checks the
// ownership + transition server-side.
function ResubmitForm({ order, kind, onDone, onError }: {
  order: JobOrder
  kind: 'on_hold' | 'rejected'
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [note, setNote] = useState('')
  const [entry, setEntry] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (kind === 'on_hold' && !note.trim()) { onError('Please describe what you updated or clarified.'); return }
    setBusy(true)
    const { error } = kind === 'on_hold'
      ? await supabase.rpc('respond_to_hold', { p_id: order.id, p_note: note.trim(), p_entry_number: entry.trim() || null })
      : await supabase.rpc('resubmit_rejected', { p_id: order.id, p_note: note.trim() || null })
    setBusy(false)
    if (error) { onError(error.message); return }
    onDone()
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.6)', border: '1px solid var(--glass-brd)' }}>
      <label className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>
        {kind === 'on_hold' ? 'Your reply to KTC (what did you update or clarify?)' : 'What did you fix? (optional note to KTC)'}
      </label>
      <textarea className="ktc-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={kind === 'on_hold' ? 'e.g. Corrected the entry number — see below.' : 'e.g. Re-checked the container numbers with the shipping line.'} />
      {kind === 'on_hold' && (
        <input className="ktc-input" value={entry} onChange={(e) => setEntry(e.target.value)}
          placeholder={`Corrected entry number (optional${order.entry_number ? ` — currently ${order.entry_number}` : ''})`} />
      )}
      <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submit()} style={{ justifySelf: 'start' }}>
        {busy ? 'Resubmitting…' : 'Resubmit to KTC'}
      </button>
    </div>
  )
}

export default function MyJobOrders() {
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null) // order pending cancel confirmation
  const [busyId, setBusyId] = useState<string | null>(null)

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function cancelOrder(id: string) {
    setBusyId(id); setError(null)
    const { error: rpcErr } = await supabase.rpc('cancel_job_order', { p_id: id })
    setBusyId(null); setCancelId(null)
    if (rpcErr) { setError(rpcErr.message); return }
    await load()
  }

  async function load() {
    const { data } = await supabase
      .from('job_orders')
      .select(
        'id, jo_number, entry_number, status, admin_note, customer_note, rejected_recoverable, payment_status, service_invoice_no, created_at, consignee:consignees(code, name), lines:job_order_lines(container_number, service_request)',
      )
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as unknown as JobOrder[]
    setOrders(rows)
    setLoading(false)
    // Auto-expand the order just filed (handed over from the New Job Order page).
    const filedId = sessionStorage.getItem('ktc_jo_filed_id')
    if (filedId) {
      sessionStorage.removeItem('ktc_jo_filed_id')
      if (rows.some((o) => o.id === filedId)) setOpen(new Set([filedId]))
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Statuses auto-refresh every 60s while the tab is visible; the manual
  // button is rate-limited to one pull per 10s.
  const { refresh, cooling } = useAutoRefresh(load)

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="ktc-title">My Job Orders</h1>
            <p className="ktc-sub" style={{ marginBottom: 0 }}>
              Tap an order to see its containers and services.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={refresh} disabled={cooling} title={cooling ? 'Just refreshed — try again in a few seconds' : 'Refresh statuses (auto-refreshes every minute)'}>
              ↻ Refresh
            </button>
            <Link to="/job-order" className="ktc-btn" style={{ width: 'auto', padding: '9px 16px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              + New Job Order
            </Link>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'hsl(0 75% 97%)', border: '1px solid hsl(0 70% 88%)' }} role="alert">
            {error}
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          {loading ? (
            <div style={{ display: 'grid', gap: 12 }} aria-label="Loading job orders">
              {[64, 64, 64].map((h, i) => (
                <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 14 }} />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="ktc-label" style={{ fontSize: 14 }}>
              No job orders yet. Create one on the{' '}
              <Link to="/job-order" className="ktc-link">New Job Order</Link> page.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {orders.map((o) => {
                const isOpen = open.has(o.id)
                const count = o.lines?.length ?? 0
                return (
                  <div
                    key={o.id}
                    style={{ borderRadius: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)', overflow: 'hidden' }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-expanded={isOpen}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                        padding: '14px 16px', border: 0, background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{ flex: '0 0 auto', fontSize: 13, color: 'hsl(var(--ink-3))', transition: 'transform 0.18s ease', transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      >
                        ▶
                      </span>
                      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <b className={o.jo_number ? 'ktc-mono' : undefined} style={{ fontSize: o.jo_number ? 14.5 : 14 }}>{o.jo_number ?? 'Draft (no number yet)'}</b>
                          <StatusBadge status={o.status} />
                        </span>
                        <span className="ktc-label" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
                          {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : 'No consignee'}
                          {o.entry_number ? ` · Entry ${o.entry_number}` : ''}
                        </span>
                      </span>
                      <span className="ktc-label" style={{ flex: '0 0 auto', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {count} container{count === 1 ? '' : 's'}
                        <span style={{ display: 'block', opacity: 0.7 }}>{new Date(o.created_at).toLocaleDateString()}</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 16px 16px 40px' }}>
                        {o.status === 'held' && (
                          <div style={{ fontSize: 12, color: 'hsl(30 60% 38%)', marginBottom: 12, lineHeight: 1.5 }}>
                            Can’t be processed until you pass final verification — upload your valid ID, then a KTC admin verifies your account and it’s sent automatically.
                          </div>
                        )}
                        {o.status === 'on_hold' && (
                          <>
                            {o.admin_note && (
                              <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'hsl(40 90% 96%)', border: '1px solid hsl(35 85% 84%)', color: 'hsl(30 60% 32%)' }}>
                                <b>Information needed:</b> {o.admin_note}
                              </div>
                            )}
                            {respondingId === o.id ? (
                              <ResubmitForm order={o} kind="on_hold" onError={setError}
                                onDone={() => { setRespondingId(null); setError(null); void load() }} />
                            ) : (
                              <button type="button" className="ktc-btn ktc-btn--sm" style={{ display: 'inline-flex', marginBottom: 12 }}
                                onClick={() => { setRespondingId(o.id); setError(null) }}>
                                Respond &amp; resubmit
                              </button>
                            )}
                          </>
                        )}
                        {o.status === 'rejected' && (
                          <>
                            {o.admin_note && (
                              <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'hsl(0 75% 97%)', border: '1px solid hsl(0 70% 88%)', color: 'hsl(0 60% 40%)' }}>
                                <b>Rejected:</b> {o.admin_note}
                              </div>
                            )}
                            {o.rejected_recoverable === false ? (
                              <div className="ktc-label" style={{ fontSize: 12.5, marginBottom: 12 }}>
                                This order is closed. If needed, please <Link to="/job-order" className="ktc-link">file a new job order</Link>.
                              </div>
                            ) : respondingId === o.id ? (
                              <ResubmitForm order={o} kind="rejected" onError={setError}
                                onDone={() => { setRespondingId(null); setError(null); void load() }} />
                            ) : (
                              <button type="button" className="ktc-btn ktc-btn--sm" style={{ display: 'inline-flex', marginBottom: 12 }}
                                onClick={() => { setRespondingId(o.id); setError(null) }}>
                                Fix &amp; resubmit
                              </button>
                            )}
                          </>
                        )}
                        {o.customer_note && (o.status === 'submitted' || o.status === 'processing') && (
                          <div className="ktc-label" style={{ fontSize: 12.5, marginBottom: 10 }}>
                            Your note to KTC: “{o.customer_note}”
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {(o.status === 'processing' || o.status === 'completed') && (
                            <Link to={`/job-order/${o.id}/print`} target="_blank" className="ktc-btn ktc-btn--sm" style={{ display: 'inline-flex', marginBottom: 12, textDecoration: 'none' }}>
                              Print slip ↗
                            </Link>
                          )}
                          {!['held', 'cancelled', 'rejected'].includes(o.status) && (
                            <Link to={`/job-order/${o.id}/pay`} className="ktc-btn-secondary ktc-btn--sm" style={{ display: 'inline-flex', marginBottom: 12, textDecoration: 'none' }}>
                              {o.payment_status === 'confirmed' || o.service_invoice_no ? '✓ Paid · view charges'
                                : o.payment_status === 'submitted' ? 'Payment under review'
                                : o.payment_status === 'rejected' ? 'Payment issue — fix'
                                : 'View charges & pay'}
                            </Link>
                          )}
                        </div>
                        {count === 0 ? (
                          <div className="ktc-label" style={{ fontSize: 13 }}>No containers on this order.</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {o.lines!.map((l, i) => (
                              <div
                                key={i}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}
                              >
                                <span className="ktc-mono" style={{ fontWeight: 600 }}>{l.container_number}</span>
                                <span className="ktc-label" style={{ fontSize: 12.5 }}>{l.service_request}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Cancel — only before processing starts (held/submitted/on_hold). */}
                        {['held', 'submitted', 'on_hold'].includes(o.status) && (
                          <div style={{ marginTop: 12 }}>
                            {cancelId === o.id ? (
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                                <span style={{ fontWeight: 600, color: 'var(--acc-2)' }}>Cancel this order? This can’t be undone.</span>
                                <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={busyId === o.id}
                                  onClick={() => void cancelOrder(o.id)}>
                                  {busyId === o.id ? 'Cancelling…' : 'Yes, cancel it'}
                                </button>
                                <button type="button" className="ktc-link" onClick={() => setCancelId(null)}>Keep it</button>
                              </div>
                            ) : (
                              <button type="button" className="ktc-link" style={{ fontSize: 12.5, opacity: 0.85 }} onClick={() => setCancelId(o.id)}>
                                Cancel this order
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
