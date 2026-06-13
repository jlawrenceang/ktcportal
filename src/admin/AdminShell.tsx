import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { usePermissions, type Permission } from '../lib/usePermissions'
import { purgeExpiredIds } from '../lib/idPurge'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import IdleWarning from '../components/IdleWarning'
import { useTour } from '../components/TourProvider'
import LangToggle from '../components/LangToggle'
import { VERSION_LABEL } from '../version'

// All staff sessions time out — on a longer leash than the 15-min customer
// rule because back-office work happens in bursts (review, step away, come
// back). The hour also keeps cashier/checker floor stations workable: a
// "still there?" prompt fires a minute before, and one tap keeps them alive.
const ADMIN_IDLE_LOGOUT_MS = 60 * 60 * 1000

// Persistent frosted admin nav — condensed into groups (each opens a dropdown)
// so the bar stays short. Items are gated by the owner-tweakable role
// permissions; a group with one visible item collapses to a direct link, and
// an empty group disappears (so each role sees only what it needs).
type NavLeaf = { to: string; label: string; end?: boolean; perm?: Permission }
type NavGroup = { label: string; tour?: string; items: NavLeaf[] }
type NavNode = NavLeaf | NavGroup

const NAV: NavNode[] = [
  { to: '/admin', label: 'Dashboard', end: true, perm: 'manage_approvals' },
  { label: 'Job Orders', tour: 'navgroup-jobs', items: [
    { to: '/admin/job-orders', label: 'Queue', perm: 'view_job_orders' },
    { to: '/admin/new-job-order', label: 'New JO', perm: 'file_job_orders' },
    { to: '/admin/checker', label: 'X-ray Checker', perm: 'confirm_xray' },
  ] },
  { label: 'Customers', tour: 'navgroup-customers', items: [
    { to: '/admin/approvals', label: 'Approvals', perm: 'manage_approvals' },
    { to: '/admin/customers', label: 'Customers', perm: 'manage_customers' },
    { to: '/admin/consignees', label: 'Consignees', perm: 'manage_consignees' },
  ] },
  { to: '/admin/vessel-schedule', label: 'Vessels', perm: 'manage_vessel_schedule' },
  { label: 'System', tour: 'navgroup-system', items: [
    { to: '/admin/settings', label: 'Settings', perm: 'manage_pricing' },
    { to: '/admin/logs', label: 'Logs', perm: 'manage_approvals' },
    { to: '/admin/security', label: '2FA', perm: 'manage_approvals' },
  ] },
  { to: '/admin/manual', label: 'Manual' }, // every staff role gets the guide
]

function AdminNav({ can }: { can: (p: Permission) => boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setOpen(null) }, [location.pathname]) // close on navigation
  useEffect(() => {
    // pointerdown covers mouse + touch + pen, so tapping away closes it on a tablet too
    function onDoc(e: PointerEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [])
  const linkClass = ({ isActive }: { isActive: boolean }) => `ktc-nav-link${isActive ? ' is-active' : ''}`
  return (
    <div className="ktc-nav-links" ref={ref}>
      {NAV.map((node) => {
        if ('items' in node) {
          const items = node.items.filter((i) => !i.perm || can(i.perm))
          if (items.length === 0) return null
          if (items.length === 1) return <NavLink key={node.label} to={items[0].to} className={linkClass}>{node.label}</NavLink>
          const groupActive = items.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/'))
          const isOpen = open === node.label
          return (
            <div key={node.label} style={{ position: 'relative', display: 'inline-flex' }}>
              <button type="button" data-tour={node.tour} aria-haspopup="true" aria-expanded={isOpen}
                className={`ktc-nav-link${groupActive ? ' is-active' : ''}`} onClick={() => setOpen(isOpen ? null : node.label)}>
                {node.label} <span aria-hidden style={{ fontSize: 9, marginLeft: 2, opacity: 0.7 }}>▾</span>
              </button>
              {isOpen && (
                <div className="ktc-glass" role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 170, padding: 6, display: 'grid', gap: 2, zIndex: 50, background: 'rgba(255,255,255,0.97)' }}>
                  {items.map((i) => (
                    <NavLink key={i.to} to={i.to} role="menuitem" className={linkClass} style={{ textAlign: 'left' }}>{i.label}</NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        }
        if (node.perm && !can(node.perm)) return null
        return <NavLink key={node.to} to={node.to} end={node.end} className={linkClass}>{node.label}</NavLink>
      })}
    </div>
  )
}

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

  // Per-page tours auto-open on first visit (see usePageTour); the ? button
  // replays the current page's walkthrough when one is registered.
  const { replayPageTour, hasPageTour } = useTour()

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
        <AdminNav can={can} />
        <LangToggle />
        {hasPageTour && (
          <button className="ktc-nav-link" onClick={replayPageTour} style={{ flex: '0 0 auto', fontWeight: 700 }} title="Show this page's walkthrough" aria-label="Show this page's walkthrough">
            ?
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
