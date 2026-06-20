import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import PushPrompt from './PushPrompt'

const IDLE_LOGOUT_MS = 15 * 60 * 1000 // auto sign-out after 15 min of inactivity (warning at 14)

export default function Shell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const { broker, refresh } = useBroker()
  const navigate = useNavigate()
  const { t } = useT()

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
    <div className="ktc-page ktc-page--tabbar">
      <nav className="ktc-nav ktc-nav--app" aria-label="Brand">
        <Link to="/" aria-label="Go to Home" style={{ display: 'inline-flex', flex: '0 0 auto', padding: '0 6px' }}>
          <img className="ktc-nav-logo" src="/ktc-logo.png" alt="KTC Container Terminal Corp" />
        </Link>
        <span className="ktc-nav-spacer" aria-hidden />
        <Clock />
        <NotificationBell />
        <AccountMenu settingsTo="/account" settingsLabel="My Account" />
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

      <footer className="ktc-foot">
        <div className="ktc-foot-links">
          <Link to="/manual" className="ktc-foot-link">{t('User Manual')}</Link>
          <span aria-hidden className="ktc-foot-dot">·</span>
          <Link to="/agreement" className="ktc-foot-link">{t('Customer Agreement')}</Link>
        </div>
        <div className="ktc-foot-meta">
          <span>KTC Online Portal <span title={VERSION_FULL}>{VERSION_LABEL}</span> · © {new Date().getFullYear()} KTC Container Terminal Corp.</span>
        </div>
      </footer>

      {!locked && <BottomNav />}
      {!locked && <PushPrompt />}
      {idleWarning && <IdleWarning />}
    </div>
  )
}
