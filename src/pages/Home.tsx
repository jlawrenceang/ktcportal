import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { homeSteps } from '../components/WelcomeTour'
import { usePageTour } from '../components/TourProvider'
import BulletinBoard from '../components/BulletinBoard'
import { useT } from '../lib/i18n'

// Home is an at-a-glance OVERVIEW: KTC's bulletin board + light order counts.
// Unread notifications live ONLY in the top-bar bell now (the old inline
// NotificationBar "bubble" was redundant with it). Navigation lives in the
// bottom bar; order counts surface as a badge on the Orders tab.
export default function Home() {
  const { session } = useAuth()
  const { broker } = useBroker()
  const { t } = useT()
  const firstName = (broker?.full_name || session?.user.email || '').split(' ')[0]

  // Light at-a-glance counts (own orders via RLS). "Active" = orders actually in
  // the live pipeline — `held` is a DRAFT (a pending account's order, hidden from
  // KTC until the account is verified), so it is NOT counted as active.
  const [stats, setStats] = useState({ active: 0, orderAttention: 0 })
  useEffect(() => {
    void (async () => {
      const [{ count: active }, { count: orderAttention }] = await Promise.all([
        supabase.from('job_orders').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'processing', 'on_hold']),
        supabase.from('job_orders').select('id', { count: 'exact', head: true })
          .or('status.eq.on_hold,and(status.eq.rejected,rejected_recoverable.eq.true),and(payment_status.eq.rejected,status.in.(submitted,processing,completed))'),
      ])
      setStats({ active: active ?? 0, orderAttention: orderAttention ?? 0 })
    })()
  }, [])

  // A pending account that hasn't uploaded a valid ID has ONE open action —
  // verify (upload ID) — which also releases its held draft order(s). Count it
  // as an attention item so the dashboard never says "0" while the ID is missing.
  const needsVerify = broker?.status === 'pending' && !broker?.valid_id_path
  const attention = stats.orderAttention + (needsVerify ? 1 : 0)
  // If verification is the only thing pending, send them straight to it.
  const attentionTo = stats.orderAttention === 0 && needsVerify ? '/verify-id' : '/job-orders?view=action'

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

      <div className="ktc-stat-grid" style={{ marginBottom: 16 }}>
        <Link to="/job-orders" className="ktc-glass ktc-stat">
          <span className="ktc-stat-num">{stats.active}</span>
          <span className="ktc-stat-label">{t('Active orders')}</span>
        </Link>
        <Link to={attentionTo} className={`ktc-glass ktc-stat${attention > 0 ? ' ktc-stat--alert' : ''}`}>
          <span className="ktc-stat-num">{attention}</span>
          <span className="ktc-stat-label">{t('Need your attention')}</span>
        </Link>
      </div>

      <BulletinBoard />
    </Shell>
  )
}
