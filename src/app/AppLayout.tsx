import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import IdleWarning from '../components/IdleWarning'
import StaffNotificationBell from '../components/StaffNotificationBell'
import InstallButton from '../components/InstallButton'
import { useTour } from '../components/TourProvider'
import { useT } from '../lib/i18n'
import { staffHome } from '../lib/types'
import { LockIcon } from '../components/icons'

// Focused "app mode" chrome for the installed staff app — a slim top bar (logo
// + role + bell + Lock) and the screen, nothing else. Single-purpose, big touch
// targets. Reuses the same session guard + idle logout as the portal, but on a
// SHORTER leash because gate devices are often shared and left unattended.
const APP_IDLE_LOGOUT_MS = 15 * 60 * 1000

export default function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { t } = useT()
  const { signOut } = useAuth()
  const { broker } = useBroker()
  const { replayPageTour, hasPageTour } = useTour()
  const navigate = useNavigate()

  useSessionGuard()

  async function lock() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const idleWarning = useIdleLogout(() => {
    sessionStorage.setItem('ktc_idle_logout', String(APP_IDLE_LOGOUT_MS / 60000))
    void lock()
  }, APP_IDLE_LOGOUT_MS, !!broker)

  const role = broker?.is_owner ? 'Owner'
    : broker?.staff_role === 'cashier' ? 'Cashier'
    : broker?.staff_role === 'checker' ? 'Checker'
    : broker?.staff_role === 'operations' ? 'Operations'
    : broker?.staff_role === 'csr' ? 'CSR'
    : broker?.is_admin ? 'Admin' : ''

  return (
    <div className="ktc-page ktc-page--wide" style={{ paddingBottom: 24 }}>
      <nav className="ktc-nav ktc-nav--app" aria-label={t('App')}>
        <Link to="/app" aria-label={t('Go to start page')} style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 4px' }}>
          <img src="/ktc-logo.png" alt="KTC" style={{ height: 30 }} />
        </Link>
        {title && <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t(title)}</span>}
        <span style={{ flex: 1 }} />
        {hasPageTour && (
          <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => replayPageTour()} title={t('Quick tour')}
            aria-label={t('Quick tour')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden className="ktc-nav-help-q">?</span>
          </button>
        )}
        <StaffNotificationBell />
        {role && (
          <span style={{
            flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 999, color: '#fff',
            background: 'linear-gradient(135deg, var(--acc), var(--acc-2))',
          }}>{t(role)}</span>
        )}
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void lock()} title={t('Lock / sign out')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <LockIcon size={15} /> {t('Lock')}
        </button>
      </nav>

      <div className="ktc-stagger">{children}</div>

      <footer style={{ marginTop: 28, textAlign: 'center', fontSize: 11.5, color: 'hsl(var(--ink-2))', opacity: 0.7 }}>
        {/* Self-hides unless the browser offers install + not already standalone —
            so a gate tablet that opened the app in a browser can still install it. */}
        <div style={{ maxWidth: 260, margin: '0 auto 6px' }}><InstallButton /></div>
        {/* Open each role on its own work home, not a Dashboard they can't act on. */}
        <Link to={staffHome(broker)} className="ktc-foot-link">{t('Open full portal')}</Link>
      </footer>

      {idleWarning && <IdleWarning />}
    </div>
  )
}
