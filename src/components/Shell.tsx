import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'

const baseLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/job-order', label: 'New Job Order' },
  { to: '/accreditation', label: 'Accreditation' },
  { to: '/job-orders', label: 'My Job Orders' },
]

export default function Shell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { broker } = useBroker()
  const navigate = useNavigate()
  const isAdmin = hasAdminAccess(broker)
  const links = isAdmin ? [...baseLinks, { to: '/admin', label: 'Admin' }] : baseLinks

  // Account-approval gate: un-approved (non-admin) brokers can't use the tools yet.
  const gated = !!broker && !isAdmin && broker.status !== 'approved'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 48 }} />
        <button className="ktc-link" onClick={handleSignOut}>Sign out</button>
      </header>

      {gated ? (
        <div className="ktc-glass" style={{ padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {broker!.status === 'rejected' ? 'Account not approved' : 'Account pending approval'}
          </h1>
          <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
            {broker!.status === 'rejected'
              ? 'Your account application was not approved. Please contact KTC for details.'
              : 'Thanks for registering. A KTC admin is reviewing your account and valid ID. ' +
                "You'll be able to request accreditations and submit job orders once approved."}
          </p>
        </div>
      ) : (
        <>
          <nav style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                style={({ isActive }) => ({
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
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
        </>
      )}
    </div>
  )
}
