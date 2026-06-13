import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { usePermissions, type Permission } from '../lib/usePermissions'
import { purgeExpiredIds } from '../lib/idPurge'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import IdleWarning from '../components/IdleWarning'
import { staffTourRole, staffTourSeen, markStaffTourSeen, staffSteps, staffTourHome } from './AdminTour'
import { useTour } from '../components/TourProvider'
import { VERSION_LABEL } from '../version'

// All staff sessions time out — on a longer leash than the 15-min customer
// rule because back-office work happens in bursts (review, step away, come
// back). The hour also keeps cashier/checker floor stations workable: a
// "still there?" prompt fires a minute before, and one tap keeps them alive.
const ADMIN_IDLE_LOGOUT_MS = 60 * 60 * 1000

// Persistent frosted admin nav — every admin surface one tap away; the active
// pill shows where you are. Items are gated by the owner-tweakable role
// permissions (cashier/checker only see what their role allows).
const NAV: { to: string; label: string; end?: boolean; perm?: Permission }[] = [
  { to: '/admin', label: 'Dashboard', end: true, perm: 'manage_approvals' },
  { to: '/admin/approvals', label: 'Approvals', perm: 'manage_approvals' },
  { to: '/admin/customers', label: 'Customers', perm: 'manage_customers' },
  { to: '/admin/consignees', label: 'Consignees', perm: 'manage_consignees' },
  { to: '/admin/job-orders', label: 'Job Orders', perm: 'view_job_orders' },
  { to: '/admin/new-job-order', label: 'New JO', perm: 'file_job_orders' },
  { to: '/admin/checker', label: 'X-ray Checker', perm: 'confirm_xray' },
  { to: '/admin/vessel-schedule', label: 'Vessels', perm: 'manage_vessel_schedule' },
  { to: '/admin/logs', label: 'Logs', perm: 'manage_approvals' },
  { to: '/admin/security', label: '2FA', perm: 'manage_approvals' },
  { to: '/admin/settings', label: 'Settings', perm: 'manage_pricing' },
  { to: '/admin/manual', label: 'Manual' }, // every staff role gets the guide
]

export default function AdminShell({ children }: { children: ReactNode; crumb?: string }) {
  const { signOut } = useAuth()
  const { can, broker } = usePermissions()
  const navigate = useNavigate()

  // 3-day ID retention: admins opportunistically purge expired files
  // (hourly-throttled; the pg_cron purge is the backstop). Admin-only —
  // cashier/checker sessions can't pass the storage delete policy.
  useEffect(() => {
    if (broker && (broker.is_admin || broker.is_owner)) purgeExpiredIds()
  }, [broker])

  // First visit → role-appropriate guided tour (re-openable from the ✨ button).
  const tourRole = staffTourRole(broker)
  const { startTour, active } = useTour()
  function openTour() {
    if (tourRole) startTour({ steps: staffSteps[tourRole], home: staffTourHome(tourRole), label: `${tourRole} tour`, onDone: () => markStaffTourSeen(tourRole) })
  }
  useEffect(() => {
    if (tourRole && !staffTourSeen(tourRole) && !active) { markStaffTourSeen(tourRole); openTour() }
  }, [tourRole]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  // One session per account: sign out (locally) if a newer login claimed it.
  useSessionGuard()

  // Idle timeout for every staff role — the enabled flag stays false until
  // the broker row loads so nobody gets kicked by a stale activity marker
  // during the loading flash.
  const idleWarning = useIdleLogout(() => {
    sessionStorage.setItem('ktc_idle_logout', String(ADMIN_IDLE_LOGOUT_MS / 60000))
    void handleSignOut()
  }, ADMIN_IDLE_LOGOUT_MS, !!broker)

  const role = broker?.is_owner ? 'Owner'
    : broker?.staff_role === 'cashier' ? 'Cashier'
    : broker?.staff_role === 'checker' ? 'Checker'
    : broker?.staff_role === 'operations' ? 'Operations'
    : broker?.is_admin ? 'Admin' : ''
  const home = broker?.staff_role === 'checker' || broker?.staff_role === 'operations' ? '/admin/checker'
    : broker?.staff_role === 'cashier' ? '/admin/job-orders'
    : '/admin'

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
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
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
        {tourRole && (
          <button className="ktc-nav-link" onClick={openTour} style={{ flex: '0 0 auto' }} title="Replay the quick tour">
            ✨
          </button>
        )}
        <button className="ktc-nav-link" onClick={handleSignOut} style={{ flex: '0 0 auto' }}>
          Sign out
        </button>
      </nav>

      <div className="ktc-stagger">{children}</div>

      <footer style={{ marginTop: 40, paddingTop: 14, borderTop: '1px solid var(--glass-brd)', textAlign: 'center', fontSize: 11.5, color: 'hsl(var(--ink-2))', opacity: 0.8 }}>
        KTC Online Portal {VERSION_LABEL}
      </footer>

      {idleWarning && <IdleWarning />}
    </div>
  )
}
