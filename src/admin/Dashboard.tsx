import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'

async function count(table: string, filter?: { col: string; val: string }) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter) q = q.eq(filter.col, filter.val)
  const { count } = await q
  return count ?? 0
}

interface Stats {
  pendingAccounts: number
  pendingAccreditations: number
  pendingConsignees: number
  brokers: number
  consignees: number
  jobOrders: number
}

const cards: { key: keyof Stats; label: string; to: string }[] = [
  { key: 'pendingAccounts', label: 'Accounts awaiting approval', to: '/admin/approvals' },
  { key: 'pendingAccreditations', label: 'Accreditations pending', to: '/admin/approvals' },
  { key: 'pendingConsignees', label: 'Consignees pending', to: '/admin/consignees' },
  { key: 'brokers', label: 'Brokers', to: '/admin/brokers' },
  { key: 'consignees', label: 'Consignees', to: '/admin/consignees' },
  { key: 'jobOrders', label: 'Job orders', to: '/admin/job-orders' },
]

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    Promise.all([
      count('brokers', { col: 'status', val: 'pending' }),
      count('accreditations', { col: 'status', val: 'pending' }),
      count('consignees', { col: 'status', val: 'pending' }),
      count('brokers'),
      count('consignees'),
      count('job_orders'),
    ]).then(([pendingAccounts, pendingAccreditations, pendingConsignees, brokers, consignees, jobOrders]) =>
      setStats({ pendingAccounts, pendingAccreditations, pendingConsignees, brokers, consignees, jobOrders }),
    )
  }, [])

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Dashboard</h1>
        <p className="ktc-label" style={{ marginTop: 6 }}>Overview of the KTC Job Order system.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {cards.map((c) => (
          <Link
            key={c.key}
            to={c.to}
            className="ktc-glass"
            style={{ padding: 22, borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em' }}>
              {stats ? stats[c.key] : '—'}
            </div>
            <div className="ktc-label" style={{ fontSize: 13, marginTop: 4 }}>{c.label}</div>
          </Link>
        ))}
      </div>
    </AdminShell>
  )
}
