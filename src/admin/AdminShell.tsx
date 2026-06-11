import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { usePermissions, type Permission } from '../lib/usePermissions'

// Persistent frosted admin nav — every admin surface one tap away; the active
// pill shows where you are. Items are gated by the owner-tweakable role
// permissions (cashier/checker only see what their role allows).
const NAV: { to: string; label: string; end?: boolean; perm: Permission }[] = [
  { to: '/admin', label: 'Dashboard', end: true, perm: 'manage_approvals' },
  { to: '/admin/approvals', label: 'Approvals', perm: 'manage_approvals' },
  { to: '/admin/customers', label: 'Customers', perm: 'manage_customers' },
  { to: '/admin/consignees', label: 'Consignees', perm: 'manage_consignees' },
  { to: '/admin/job-orders', label: 'Job Orders', perm: 'view_job_orders' },
  { to: '/admin/new-job-order', label: 'New JO', perm: 'file_job_orders' },
  { to: '/admin/checker', label: 'X-ray Checker', perm: 'confirm_xray' },
  { to: '/admin/logs', label: 'Logs', perm: 'manage_approvals' },
  { to: '/admin/security', label: '2FA', perm: 'manage_approvals' },
  { to: '/admin/settings', label: 'Settings', perm: 'manage_pricing' },
]

export default function AdminShell({ children }: { children: ReactNode; crumb?: string }) {
  const { signOut } = useAuth()
  const { can, broker } = usePermissions()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const role = broker?.is_owner ? 'Owner'
    : broker?.staff_role === 'cashier' ? 'Cashier'
    : broker?.staff_role === 'checker' ? 'Checker'
    : broker?.is_admin ? 'Admin' : ''
  const home = broker?.staff_role === 'checker' ? '/admin/checker'
    : broker?.staff_role === 'cashier' ? '/admin/job-orders' : '/admin'

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto', padding: '14px 20px 60px' }}>
      <nav className="ktc-nav" aria-label="Admin">
        <Link to={home} aria-label="Go to start page" style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 6px' }}>
          <img src="/ktc-logo.png" alt="KTC" style={{ height: 34 }} />
        </Link>
        <span
          title={role ? `${role}: ${broker?.email ?? ''}` : undefined}
          style={{
            flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '4px 9px', borderRadius: 999, color: '#fff', marginRight: 4,
            background: 'linear-gradient(135deg, var(--acc), var(--acc-2))',
          }}
        >
          {role || 'Admin'}
        </span>
        <div className="ktc-nav-links">
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `ktc-nav-link${isActive ? ' is-active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </div>
        <button className="ktc-nav-link" onClick={handleSignOut} style={{ flex: '0 0 auto' }}>
          Sign out
        </button>
      </nav>

      <div className="ktc-stagger">{children}</div>
    </div>
  )
}
