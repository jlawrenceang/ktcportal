import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePageTour } from '../components/TourProvider'
import { dashboardSteps } from './AdminTour'
import { useT } from '../lib/i18n'

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
}

const cards: { key: keyof Stats; label: string; to: string; accent?: boolean }[] = [
  { key: 'pendingAccounts', label: 'Accounts awaiting approval', to: '/admin/approvals', accent: true },
  { key: 'pendingConsignees', label: 'Consignees pending', to: '/admin/consignees', accent: true },
  { key: 'brokers', label: 'Customers', to: '/admin/customers' },
  { key: 'consignees', label: 'Consignees', to: '/admin/consignees' },
  { key: 'jobOrders', label: 'Open job orders', to: '/admin/job-orders' },
]

export default function Dashboard() {
  const { t } = useT()
  const [stats, setStats] = useState<Stats | null>(null)
  usePageTour('dashboard', dashboardSteps)

  useEffect(() => {
    Promise.all([
      n(customers().eq('status', 'pending')),
      n(supabase.from('consignees').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      n(customers()),
      n(supabase.from('consignees').select('id', { count: 'exact', head: true })),
      // matches the queue's default "Open" view this tile links to
      n(supabase.from('job_orders').select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'processing', 'on_hold']).is('archived_at', null)),
    ]).then(([pendingAccounts, pendingConsignees, brokers, consignees, jobOrders]) =>
      setStats({ pendingAccounts, pendingConsignees, brokers, consignees, jobOrders }),
    )
  }, [])

  return (
    <AdminShell>
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
    </AdminShell>
  )
}
