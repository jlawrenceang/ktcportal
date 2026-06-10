import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'

// Path → breadcrumb label. The Dashboard cards are the primary navigation; this
// just shows where you are and links back to the Dashboard.
const CRUMBS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/approvals': 'Approvals',
  '/admin/customers': 'Customers',
  '/admin/consignees': 'Consignees',
  '/admin/job-orders': 'Job Orders',
  '/admin/settings': 'Settings',
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { broker } = useBroker()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isDashboard = pathname === '/admin'
  const isCustomerDetail = pathname.startsWith('/admin/customers/')
  const current = CRUMBS[pathname] ?? (isCustomerDetail ? 'Customer' : '')

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const role = broker?.is_owner ? 'Owner' : broker?.is_admin ? 'Admin' : ''

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/ktc-logo.png" alt="KTC" style={{ height: 44 }} />
          <span
            style={{
              fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 999, color: '#fff',
              background: 'linear-gradient(135deg, var(--acc), var(--acc-2))',
            }}
          >
            Admin Portal
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {role && <span className="ktc-label" style={{ fontSize: 12 }}>{role}: {broker?.email}</span>}
          <button className="ktc-link" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22, fontSize: 14 }}>
        {isDashboard ? (
          <span style={{ fontWeight: 600 }}>Dashboard</span>
        ) : (
          <>
            <Link to="/admin" className="ktc-link">Dashboard</Link>
            <span style={{ color: 'hsl(var(--ink-2))', opacity: 0.5 }}>›</span>
            {isCustomerDetail && (
              <>
                <Link to="/admin/customers" className="ktc-link">Customers</Link>
                <span style={{ color: 'hsl(var(--ink-2))', opacity: 0.5 }}>›</span>
              </>
            )}
            <span style={{ fontWeight: 600 }}>{current}</span>
          </>
        )}
      </nav>
      {children}
    </div>
  )
}
