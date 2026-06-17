import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { purgeExpiredIds } from '../lib/idPurge'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import IdleWarning from '../components/IdleWarning'
import PushPrompt from '../components/PushPrompt'
import StaffNotificationBell from '../components/StaffNotificationBell'
import AdminBottomNav from './AdminBottomNav'
import { useT } from '../lib/i18n'
import { VERSION_LABEL, VERSION_FULL } from '../version'

// Admin shell — mirrors the customer Shell: a slim top rail (logo + role badge)
// + the floating bottom tab bar (AdminBottomNav). Navigation, language, theme,
// the quick tour and sign-out all live in the bottom bar's ⊞ Menu, exactly like
// the customer side, so the two portals look and feel the same.

// All staff sessions time out — on a longer leash than the 15-min customer rule
// because back-office work happens in bursts. A "still there?" prompt fires a
// minute before, and one tap keeps them alive.
const ADMIN_IDLE_LOGOUT_MS = 60 * 60 * 1000

export default function AdminShell({ children }: { children: ReactNode; crumb?: string; title?: string }) {
  const { t } = useT()
  const { signOut } = useAuth()
  const { broker } = usePermissions()
  const navigate = useNavigate()

  // 3-day ID retention: admins opportunistically purge expired files
  // (hourly-throttled; the pg_cron purge is the backstop). Admin-only.
  useEffect(() => {
    if (broker && (broker.is_admin || broker.is_owner)) purgeExpiredIds()
  }, [broker])

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  // One session per account: sign out (locally) if a newer login claimed it.
  useSessionGuard()

  // Idle timeout for every staff role — disabled until the broker row loads so
  // nobody gets kicked by a stale activity marker during the loading flash.
  const idleWarning = useIdleLogout(() => {
    sessionStorage.setItem('ktc_idle_logout', String(ADMIN_IDLE_LOGOUT_MS / 60000))
    void handleSignOut()
  }, ADMIN_IDLE_LOGOUT_MS, !!broker)

  const role = broker?.is_owner ? 'Owner'
    : broker?.staff_role === 'cashier' ? 'Cashier'
    : broker?.staff_role === 'checker' ? 'Checker'
    : broker?.staff_role === 'operations' ? 'Operations'
    : broker?.staff_role === 'csr' ? 'CSR'
    : broker?.is_admin ? 'Admin' : ''
  const home = broker?.staff_role === 'checker' ? '/admin/checker'
    : broker?.staff_role === 'operations' ? '/admin/job-orders'
    : broker?.staff_role === 'cashier' ? '/admin/cashier'
    : broker?.staff_role === 'csr' ? '/admin/support'
    : '/admin'

  return (
    <div className="ktc-page ktc-page--wide ktc-page--tabbar">
      <nav className="ktc-nav ktc-nav--app" aria-label={t('Admin')}>
        <Link to={home} aria-label={t('Go to start page')} style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 4px' }}>
          <img src="/ktc-logo.png" alt="KTC" style={{ height: 32 }} />
        </Link>
        <span style={{ flex: 1 }} />
        <StaffNotificationBell />
        {/* Only render once the role is known — never fall back to a generic
            "Admin" label (that made the owner's pill flash "Admin" on every
            tab switch while the profile reloaded). */}
        {role && (
          <span
            title={`${t(role)}: ${broker?.email ?? ''}`}
            style={{
              flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 999, color: '#fff',
              background: 'linear-gradient(135deg, var(--acc), var(--acc-2))',
            }}
          >
            {t(role)}
          </span>
        )}
      </nav>

      <div className="ktc-stagger">{children}</div>

      <AdminBottomNav />

      <footer style={{ marginTop: 40, paddingTop: 14, borderTop: '1px solid var(--glass-brd)', textAlign: 'center', fontSize: 11.5, color: 'hsl(var(--ink-2))', opacity: 0.8 }}>
        {t('KTC Online Portal')} <span title={VERSION_FULL}>{VERSION_LABEL}</span>
      </footer>

      {idleWarning && <IdleWarning />}
      <PushPrompt />
    </div>
  )
}
