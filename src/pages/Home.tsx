import Shell from '../components/Shell'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { homeSteps } from '../components/WelcomeTour'
import { usePageTour } from '../components/TourProvider'
import NotificationBar from '../components/NotificationBar'
import BulletinBoard from '../components/BulletinBoard'
import { useT } from '../lib/i18n'

// Home is an at-a-glance OVERVIEW: KTC's bulletin board + your unread
// notifications. Navigation lives in the bottom bar; order counts surface as a
// badge on the Orders tab.
export default function Home() {
  const { session } = useAuth()
  const { broker } = useBroker()
  const { t } = useT()
  const firstName = (broker?.full_name || session?.user.email || '').split(' ')[0]

  // First visit to Home auto-opens its tour; replay from the ⊞ Menu.
  usePageTour('home', homeSteps)

  return (
    <Shell>
      <div className="ktc-home-head">
        <span className="ktc-home-eyebrow">{t('Dashboard')}</span>
        <h1 className="ktc-home-greet">
          {firstName ? t('Welcome, {name}', { name: firstName }) : t('Welcome')}
        </h1>
        <p className="ktc-sub" style={{ maxWidth: 460, marginBottom: 0 }}>
          {t('Here’s what’s happening with your KTC terminal services.')}
        </p>
      </div>

      <BulletinBoard />
      <NotificationBar />
    </Shell>
  )
}
