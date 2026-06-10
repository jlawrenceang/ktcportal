import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'

const adminLinks = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/approvals', label: 'Approvals' },
  { to: '/admin/brokers', label: 'Customers' },
  { to: '/admin/consignees', label: 'Consignees' },
  { to: '/admin/job-orders', label: 'Job Orders' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function AdminShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { broker } = useBroker()
  const navigate = useNavigate()

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

      <nav style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {adminLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            style={({ isActive }) => ({
              padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, textDecoration: 'none',
              color: isActive ? '#fff' : 'hsl(var(--ink-2))',
              background: isActive ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : 'rgba(255,255,255,0.6)',
              border: '1px solid var(--glass-brd)',
            })}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  )
}
