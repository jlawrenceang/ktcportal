import type { ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { useIdleLogout } from '../lib/useIdleLogout'
import { useSessionGuard } from '../lib/useSessionGuard'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { VERSION_LABEL, VERSION_FULL } from '../version'
import PendingPanel from './PendingPanel'
import BrokerStatusBanner from './BrokerStatusBanner'
import IdleWarning from './IdleWarning'
import { useT } from '../lib/i18n'
import NotificationBell from './NotificationBell'
import AccountMenu from './AccountMenu'
import BottomNav from './BottomNav'
import Clock from './Clock'
import ChatWidget from './chat/ChatWidget'

const IDLE_LOGOUT_MS = 15 * 60 * 1000 // auto sign-out after 15 min of inactivity (warning at 14)

export default function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { signOut } = useAuth()
  const { broker, refresh } = useBroker()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useT()

  // Locked out entirely: rejected / suspended (non-admin) brokers get a message only.
  const locked = !!broker && !hasAdminAccess(broker) && (broker.status === 'rejected' || broker.status === 'suspended')
  // Pending (unapproved) brokers are VERIFY-ONLY: they may upload a valid ID, see
  // their status, read the Customer Agreement, manage account basics, and sign out —
  // every other customer surface is blocked until an admin approves them. The real
  // wall is backend RLS + file_job_order (approved-only, migration 0163); this is UX.
  const pending = !!broker && !hasAdminAccess(broker) && broker.status === 'pending'
  // Routes a pending customer may still open inside the Shell. /verify-id (ID upload)
  // is a standalone non-Shell page and stays reachable on its own; the Agreement is
  // also a public route. Everything else is replaced by the verify-only panel.
  const pendingAllowed = pathname === '/account' || pathname === '/agreement'
  const verifyOnly = pending && !pendingAllowed

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
    <div className={`ktc-page ktc-page--tabbar${wide ? ' ktc-page--wide' : ''}`}>
      <nav className="ktc-nav ktc-nav--app" aria-label="Brand">
        <Link to="/" aria-label="Go to Home" style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 6px' }}>
          <img className="ktc-nav-logo" src="/ktc-logo.png" alt="KTC Container Terminal Corp" />
        </Link>
        <span className="ktc-nav-spacer" aria-hidden />
        <Clock />
        <NotificationBell />
        <AccountMenu settingsTo="/account" settingsLabel="My Account" role="Customer" />
      </nav>

      {locked ? (
        <div className="ktc-rise">
          <PendingPanel broker={broker!} />
        </div>
      ) : verifyOnly ? (
        <div className="ktc-rise">
          <div data-tour="id-banner"><BrokerStatusBanner broker={broker!} onRefresh={pullStatus} refreshCooling={cooling} /></div>
          <div className="ktc-glass" style={{ padding: 18, marginTop: 12 }}>
            <h1 className="ktc-title">{t('Finish verifying your account')}</h1>
            <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {t('Your account is awaiting approval. Upload a valid ID for verification — once a KTC admin approves you, the full portal unlocks. In the meantime you can manage your account and read the Customer Agreement.')}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/verify-id" className="ktc-btn" style={{ textDecoration: 'none' }}>{t('Upload valid ID')}</Link>
              <Link to="/account" className="ktc-link">{t('My Account')}</Link>
              <Link to="/agreement" className="ktc-link">{t('Customer Agreement')}</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="ktc-stagger">
          {pending && <div data-tour="id-banner"><BrokerStatusBanner broker={broker!} onRefresh={pullStatus} refreshCooling={cooling} /></div>}
          {children}
        </div>
      )}

      <footer className="ktc-foot">
        <div className="ktc-foot-links">
          <Link to="/manual" className="ktc-foot-link">{t('User Manual')}</Link>
          <span aria-hidden className="ktc-foot-dot">·</span>
          <Link to="/requests" className="ktc-foot-link">{t('My Requests')}</Link>
        </div>
        <div className="ktc-foot-meta">
          <span>KTC Online Portal <span title={VERSION_FULL}>{VERSION_LABEL}</span> · © {new Date().getFullYear()} KTC Container Terminal Corp.</span>
        </div>
      </footer>

      {/* Bottom tabs link into the (now-blocked) portal — hide them while pending too. */}
      {!locked && !pending && <BottomNav />}
      {/* Lara — customer help assistant; not for the locked or verify-only (pending) screens */}
      {!locked && !pending && <ChatWidget />}
      {idleWarning && <IdleWarning />}
    </div>
  )
}
