import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { homeSteps } from '../components/WelcomeTour'
import { usePageTour } from '../components/TourProvider'
import BulletinBoard from '../components/BulletinBoard'
import Notice from '../components/Notice'
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
  // the live pipeline. Only APPROVED accounts can file (migration 0163), and their
  // orders are created directly as `submitted` — the old `held`/Draft model is retired.
  const [stats, setStats] = useState({ active: 0, orderAttention: 0 })
  // A discarded read error here would silently render 0/0 — looking like "nothing
  // active, nothing needs attention" when the fetch actually failed (RLS/offline).
  const [loadError, setLoadError] = useState<string | null>(null)
  async function loadStats() {
    setLoadError(null)
    const [activeRes, attentionRes] = await Promise.all([
      // Exclude re-X-ray children — they're internal KTC orders hidden from the customer's
      // list (MyJobOrders filters is_rexray=false), so counting them desyncs tile vs list.
      supabase.from('job_orders').select('id', { count: 'exact', head: true }).eq('is_rexray', false).in('status', ['submitted', 'processing', 'on_hold']),
      // Needs-attention (on_hold OR a rejected charge) — server-side via the RPC,
      // since post-cutover it spans job_orders → charges (no single .or() works).
      supabase.rpc('my_attention_count'),
    ])
    const err = activeRes.error || attentionRes.error
    if (err) { setLoadError(err.message); return }
    setStats({ active: activeRes.count ?? 0, orderAttention: (attentionRes.data as number) ?? 0 })
  }
  useEffect(() => {
    void loadStats()
  }, [])

  // A pending account that hasn't uploaded a valid ID has ONE open action —
  // verify (upload ID) — which is what unlocks filing once a KTC admin approves it.
  // Count it as an attention item so the dashboard never says "0" while the ID is missing.
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

      {loadError ? (
        <div style={{ marginBottom: 16 }}>
          <Notice
            tone="error"
            title={t("Couldn't load — tap Retry")}
            action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { void loadStats() }}>{t('Retry')}</button>}
          >
            {loadError}
          </Notice>
        </div>
      ) : (
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
      )}

      <BulletinBoard />
    </Shell>
  )
}
