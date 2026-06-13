import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { VERSION_LABEL } from '../version'
import PendingPanel from './PendingPanel'
import BrokerStatusBanner from './BrokerStatusBanner'
import IdleWarning from './IdleWarning'
import { useTour } from './TourProvider'
import { customerSteps } from './WelcomeTour'

const IDLE_LOGOUT_MS = 15 * 60 * 1000 // auto sign-out after 15 min of inactivity (warning at 14)

// Primary navigation — persistent frosted bar (replaces the old back-button +
// breadcrumb pattern: every page is one tap away, and the active pill shows
// where you are).
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/job-order', label: 'New Job Order' },
  { to: '/job-orders', label: 'My Job Orders' },
  { to: '/calculator', label: 'Rates' },
  { to: '/account', label: 'My Account' },
]

export default function Shell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { broker, refresh } = useBroker()
  const navigate = useNavigate()
  const { startTour } = useTour()

  // Locked out entirely: rejected / suspended (non-admin) brokers get a message only.
  const locked = !!broker && !hasAdminAccess(broker) && (broker.status === 'rejected' || broker.status === 'suspended')
  // Pending (confirmed) brokers get the full portal + a status banner; submit is
  // gated server-side (job_orders insert requires broker_is_approved()).
  const pending = !!broker && !hasAdminAccess(broker) && broker.status === 'pending'

  // While pending, auto-pull the account status every 60s (visible tab only)
  // so approval shows up without a reload; manual ↻ is limited to one per 10s.
  const { refresh: pullStatus, cooling } = useAutoRefresh(refresh, { enabled: pending })

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  // One session per account: sign out (locally) if a newer login claimed it.
  useSessionGuard()

  // Idle timeout: sign customers out after 15 minutes of inactivity,
  // with a "still there?" prompt one minute before.
  const idleWarning = useIdleLogout(() => {
    sessionStorage.setItem('ktc_idle_logout', '15')
    void handleSignOut()
  }, IDLE_LOGOUT_MS)

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '14px 20px 60px' }}>
      <nav className="ktc-nav" aria-label="Primary">
        <Link to="/" aria-label="Go to Home" style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 6px' }}>
          <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 34 }} />
        </Link>
        <div className="ktc-nav-links">
          {NAV.map((n) => (
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
        <button className="ktc-nav-link" onClick={() => startTour({ steps: customerSteps, home: '/', label: 'customer tour' })}
          style={{ flex: '0 0 auto', fontWeight: 700 }} title="Replay the walkthrough" aria-label="Replay the walkthrough">
          ?
        </button>
        <button className="ktc-nav-link" onClick={handleSignOut} style={{ flex: '0 0 auto' }}>
          Sign out
        </button>
      </nav>

      {locked ? (
        <div className="ktc-rise">
          <PendingPanel broker={broker!} />
        </div>
      ) : (
        <div className="ktc-stagger">
          {pending && <div data-tour="id-banner"><BrokerStatusBanner broker={broker!} onRefresh={pullStatus} refreshCooling={cooling} /></div>}
          {children}
        </div>
      )}

      <footer style={{ marginTop: 44, paddingTop: 18, borderTop: '1px solid var(--glass-brd)', textAlign: 'center', fontSize: 12, color: 'hsl(var(--ink-2))' }}>
        <Link to="/manual" className="ktc-link" style={{ fontSize: 12 }}>User Manual</Link>
        <span aria-hidden style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
        <Link to="/agreement" className="ktc-link" style={{ fontSize: 12 }}>Customer Agreement (Terms &amp; Conditions)</Link>
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          KTC Online Portal {VERSION_LABEL} · © {new Date().getFullYear()} KTC Container Terminal Corp.
        </div>
      </footer>

      {idleWarning && <IdleWarning />}
    </div>
  )
}
