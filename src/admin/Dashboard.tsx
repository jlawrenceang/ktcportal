import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePageTour } from '../components/TourProvider'
import { dashboardSteps } from './AdminTour'
import { useT } from '../lib/i18n'
import { usePermissions } from '../lib/usePermissions'

// External customers only — staff/admin/owner accounts are not "customers".
function customers() {
  return supabase.from('customers').select('id', { count: 'exact', head: true })
    .eq('is_admin', false).eq('is_owner', false).is('staff_role', null)
}
const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0

interface Stats {
  pendingAccounts: number
  pendingConsignees: number
  brokers: number
  consignees: number
  jobOrders: number
  paymentProofs: number
  supportTickets: number
  xrayVans: number
}

interface AcctRow { id: string; full_name: string | null; customer_code: string | null; created_at: string }
interface ConsRow { id: string; name: string | null; created_at: string }
interface PayRow { id: string; jo_number: string | null; created_at: string }
interface TicketRow { id: string; subject: string | null; created_at: string }
interface XrayRow { id: string; container_number: string | null; jo_number: string | null; created_at: string | null }
interface Queue { accounts: AcctRow[]; consignees: ConsRow[]; payments: PayRow[]; tickets: TicketRow[]; xray: XrayRow[] }

const cards: { key: keyof Stats; label: string; to: string; accent?: boolean }[] = [
  { key: 'pendingAccounts', label: 'Accounts awaiting approval', to: '/admin/approvals', accent: true },
  { key: 'pendingConsignees', label: 'Consignees pending', to: '/admin/consignees', accent: true },
  { key: 'brokers', label: 'Customers', to: '/admin/customers' },
  { key: 'consignees', label: 'Consignees', to: '/admin/consignees' },
  { key: 'jobOrders', label: 'Open job orders', to: '/admin/job-orders' },
]

function shortDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { t } = useT()
  const { can } = usePermissions()
  const [stats, setStats] = useState<Stats | null>(null)
  const [queue, setQueue] = useState<Queue | null>(null)
  usePageTour('dashboard', dashboardSteps)

  useEffect(() => {
    // Vans still awaiting an X-ray confirmation — same query the checker badge
    // uses (useAdminCounts): only ACCEPTED orders (processing/on_hold), open
    // x-ray lines. Reused for both the count (head) and the preview rows.
    const xrayCount = supabase.from('job_order_lines').select('id, job_orders!inner(status)', { count: 'exact', head: true })
      .is('xray_done_at', null).ilike('service_request', '%x-ray%')
      .in('job_orders.status', ['processing', 'on_hold'])
    // Payment proofs (base or RPS) awaiting the cashier's review — mirrors the
    // cashier badge's filter (applied after .select()).
    const PAY_FILTER = 'payment_status.eq.submitted,rps_payment_status.eq.submitted'

    Promise.all([
      n(customers().eq('status', 'pending')),
      n(supabase.from('consignees').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      // Only APPROVED accounts are "customers" — a pending (in-approval) account
      // isn't a customer yet, so it shouldn't bump this count.
      n(customers().eq('status', 'approved')),
      n(supabase.from('consignees').select('id', { count: 'exact', head: true })),
      // matches the queue's default "Open" view this tile links to
      n(supabase.from('job_orders').select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'processing', 'on_hold']).is('archived_at', null)),
      n(supabase.from('job_orders').select('id', { count: 'exact', head: true }).or(PAY_FILTER)),
      n(supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open')),
      n(xrayCount),
    ]).then(([pendingAccounts, pendingConsignees, brokers, consignees, jobOrders, paymentProofs, supportTickets, xrayVans]) =>
      setStats({ pendingAccounts, pendingConsignees, brokers, consignees, jobOrders, paymentProofs, supportTickets, xrayVans }),
    )

    // The actual pending work — surfaced as drill-down rows below the counts, so the
    // dashboard lands the admin on the queue itself, not just a scoreboard. The
    // permission-keyed backlogs render only for the roles that hold the gate (RLS
    // also protects the data); rows the role can't act on stay hidden.
    Promise.all([
      supabase.from('customers').select('id, full_name, customer_code, created_at')
        .eq('is_admin', false).eq('is_owner', false).is('staff_role', null)
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(5),
      supabase.from('consignees').select('id, name, created_at')
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(5),
      supabase.from('job_orders').select('id, jo_number, created_at').or(PAY_FILTER).order('created_at', { ascending: true }).limit(5),
      supabase.from('support_tickets').select('id, subject, created_at')
        .eq('status', 'open').order('created_at', { ascending: true }).limit(5),
      supabase.from('job_order_lines').select('id, container_number, job_orders!inner(jo_number, status, created_at)')
        .is('xray_done_at', null).ilike('service_request', '%x-ray%')
        .in('job_orders.status', ['processing', 'on_hold']).limit(5),
    ]).then(([a, c, p, tk, x]) => setQueue({
      accounts: (a.data as AcctRow[] | null) ?? [],
      consignees: (c.data as ConsRow[] | null) ?? [],
      payments: (p.data as PayRow[] | null) ?? [],
      tickets: (tk.data as TicketRow[] | null) ?? [],
      xray: ((x.data as unknown as { id: string; container_number: string | null; job_orders: { jo_number: string | null; created_at: string | null } | { jo_number: string | null; created_at: string | null }[] | null }[] | null) ?? []).map((l) => {
        const jo = Array.isArray(l.job_orders) ? l.job_orders[0] : l.job_orders
        return { id: l.id, container_number: l.container_number, jo_number: jo?.jo_number ?? null, created_at: jo?.created_at ?? null }
      }),
    }))
  }, [])

  return (
    <AdminShell>
      <div
        className="ktc-photo-banner ktc-photo-banner--tight"
        style={{ backgroundImage: "url('/photos/dash-admin.jpg')" }}
        aria-hidden="true"
      />
      <div className="ktc-home-head">
        <span className="ktc-home-eyebrow">{t('Admin')}</span>
        <h1 className="ktc-home-greet">{t('Dashboard')}</h1>
        <p className="ktc-sub" style={{ maxWidth: 460, marginBottom: 0 }}>
          {t('Overview of the KTC Online Portal.')}
        </p>
      </div>

      <div className="ktc-stat-grid">
        {cards.map((c) => {
          const val = stats ? stats[c.key] : null
          const active = !!c.accent && (val ?? 0) > 0 // pending tile with work waiting
          return (
            <Link
              key={c.key}
              to={c.to}
              data-tour={`dash-${c.key}`}
              className={`ktc-glass ktc-card ktc-stat${active ? ' ktc-stat--alert' : ''}`}
            >
              <span className="ktc-stat-num">{val ?? '—'}</span>
              <span className="ktc-stat-label">{t(c.label)}</span>
            </Link>
          )
        })}
      </div>

      {/* Needs your attention — the actual pending work as clickable drill-down rows,
          so the dashboard is a work surface (act on the queue), not just a scoreboard. */}
      <h2 className="ktc-home-greet" style={{ fontSize: 17, margin: '22px 0 10px' }}>
        {t('Needs your attention')}
      </h2>
      <div data-tour="dash-queue" className="ktc-glass ktc-card" style={{ padding: 0, overflow: 'hidden' }}>
        {queue === null ? (
          <div className="ktc-label" style={{ padding: 16 }}>{t('Loading…')}</div>
        ) : (() => {
          // Each backlog shows only when it has work AND (for the permission-keyed
          // ones) the signed-in role holds the gate.
          const showAccounts = queue.accounts.length > 0
          const showConsignees = queue.consignees.length > 0
          const showPayments = queue.payments.length > 0 && can('review_payments')
          const showTickets = queue.tickets.length > 0 && can('manage_support')
          const showXray = queue.xray.length > 0 && (can('confirm_xray') || can('view_xray_queue'))
          if (!showAccounts && !showConsignees && !showPayments && !showTickets && !showXray) {
            return (
              <div className="ktc-label" style={{ padding: '22px 16px', textAlign: 'center' }}>
                ✓ {t('All caught up — nothing is waiting for your action.')}
              </div>
            )
          }
          return (
            <>
              {showAccounts && (
                <QueueSection t={t} title={t('Accounts awaiting approval')} count={stats?.pendingAccounts ?? queue.accounts.length} to="/admin/approvals">
                  {queue.accounts.map((a) => (
                    <QueueRow key={a.id} to="/admin/approvals"
                      main={a.full_name || a.customer_code || t('(no name)')}
                      sub={a.full_name && a.customer_code ? a.customer_code : undefined}
                      date={shortDate(a.created_at)} />
                  ))}
                </QueueSection>
              )}
              {showConsignees && (
                <QueueSection t={t} title={t('Pending consignee requests')} count={stats?.pendingConsignees ?? queue.consignees.length} to="/admin/consignees">
                  {queue.consignees.map((c) => (
                    <QueueRow key={c.id} to="/admin/consignees" main={c.name || t('(no name)')} date={shortDate(c.created_at)} />
                  ))}
                </QueueSection>
              )}
              {showPayments && (
                <QueueSection t={t} title={t('Payment proofs to review')} count={stats?.paymentProofs ?? queue.payments.length} to="/admin/cashier">
                  {queue.payments.map((p) => (
                    <QueueRow key={p.id} to="/admin/cashier" main={p.jo_number || t('(no number)')} date={shortDate(p.created_at)} />
                  ))}
                </QueueSection>
              )}
              {showTickets && (
                <QueueSection t={t} title={t('Open support tickets')} count={stats?.supportTickets ?? queue.tickets.length} to="/admin/support">
                  {queue.tickets.map((tk) => (
                    <QueueRow key={tk.id} to="/admin/support" main={tk.subject || t('(no subject)')} date={shortDate(tk.created_at)} />
                  ))}
                </QueueSection>
              )}
              {showXray && (
                <QueueSection t={t} title={t('Vans awaiting X-ray')} count={stats?.xrayVans ?? queue.xray.length} to="/admin/checker">
                  {queue.xray.map((x) => (
                    <QueueRow key={x.id} to="/admin/checker"
                      main={x.container_number || t('(no container)')}
                      sub={x.jo_number ?? undefined}
                      date={x.created_at ? shortDate(x.created_at) : '—'} />
                  ))}
                </QueueSection>
              )}
            </>
          )
        })()}
      </div>
    </AdminShell>
  )
}

function QueueSection({ t, title, count, to, children }: { t: (s: string) => string; title: string; count: number; to: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--glass-brd)', background: 'var(--c-w55)' }}>
        <span style={{ fontSize: 13, fontWeight: 650 }}>
          {title} <span className="ktc-label" style={{ fontWeight: 500 }}>· {count}</span>
        </span>
        <Link to={to} className="ktc-link" style={{ fontSize: 12.5, flex: '0 0 auto' }}>{t('View all')} →</Link>
      </div>
      {children}
    </div>
  )
}

function QueueRow({ to, main, sub, date }: { to: string; main: string; sub?: string; date: string }) {
  return (
    <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--glass-brd)', textDecoration: 'none', color: 'inherit' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {main}{sub ? <span className="ktc-label" style={{ marginLeft: 6 }}>· {sub}</span> : null}
      </span>
      <span className="ktc-label" style={{ fontSize: 11.5, flex: '0 0 auto' }}>{date}</span>
      <span aria-hidden style={{ color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>›</span>
    </Link>
  )
}
