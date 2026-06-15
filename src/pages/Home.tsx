import { Link } from 'react-router-dom'
import { type ReactNode } from 'react'
import Shell from '../components/Shell'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { homeSteps } from '../components/WelcomeTour'
import { usePageTour } from '../components/TourProvider'
import NotificationBar from '../components/NotificationBar'
import { useT } from '../lib/i18n'

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const NewOrderIcon = () => (
  <svg {...iconProps}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M12 11v6M9 14h6" /></svg>
)
const OrdersIcon = () => (
  <svg {...iconProps}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
)
const AccountIcon = () => (
  <svg {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
)
const CalcIcon = () => (
  <svg {...iconProps}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /></svg>
)
const VesselIcon = () => (
  <svg {...iconProps}><path d="M3 18a3 3 0 0 0 2.5 1.5h13A3 3 0 0 0 21 18l-2-6H5l-2 6Z" /><path d="M12 12V4M8 8h8M12 4h.01" /></svg>
)
const cards: { to: string; title: string; desc: string; icon: ReactNode }[] = [
  { to: '/job-order', title: 'New Job Order', desc: 'File for X-ray, DEA or OOG stripping services', icon: <NewOrderIcon /> },
  { to: '/job-orders', title: 'My Job Orders', desc: 'Track statuses, pay, and print approved slips', icon: <OrdersIcon /> },
  { to: '/vessels', title: 'Vessel Schedule', desc: 'Current calls, berths & last free day', icon: <VesselIcon /> },
  { to: '/calculator', title: 'Rate Calculator', desc: 'Estimate charges before you file', icon: <CalcIcon /> },
  { to: '/account', title: 'My Account', desc: 'Profile, email & password', icon: <AccountIcon /> },
]

export default function Home() {
  const { session } = useAuth()
  const { broker } = useBroker()
  const { t } = useT()
  const firstName = (broker?.full_name || session?.user.email || '').split(' ')[0]

  // First visit to Home auto-opens its tour; the ? button in the top rail replays it.
  usePageTour('home', homeSteps)

  return (
    <Shell>
      <NotificationBar />
      <div className="ktc-home-head">
        <span className="ktc-home-eyebrow">{t('Dashboard')}</span>
        <h1 className="ktc-home-greet">
          {firstName ? t('Welcome, {name}', { name: firstName }) : t('Welcome')}
        </h1>
        <p className="ktc-sub" style={{ maxWidth: 460, marginBottom: 0 }}>
          {t('Manage and track your KTC terminal services — anytime, anywhere.')}
        </p>
      </div>

      <div className="ktc-home-grid">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            data-tour={`home-${c.to.slice(1)}`}
            className="ktc-glass ktc-card ktc-home-tile"
          >
            <span className="ktc-home-tile-icon">
              {c.icon}
            </span>
            <span className="ktc-home-tile-body">
              <span className="ktc-home-tile-title">
                {t(c.title)}
                <span aria-hidden className="ktc-home-tile-chev">›</span>
              </span>
              <span className="ktc-label ktc-home-tile-desc">{t(c.desc)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Shell>
  )
}
