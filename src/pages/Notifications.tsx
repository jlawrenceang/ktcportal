import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { BellIcon } from '../components/icons'
import NotificationRow from '../components/NotificationRow'
import { ICON, fmtWhen, routeCustomerNotif, type Notif } from '../components/NotificationBell'

// Customer "View all" notification history (/notifications). The bell only keeps
// the latest 20; this lists them newest-first with a Show-more so nothing is
// lost. Rows + icons + routing are reused from the bell (NotificationBell.tsx).
const PAGE = 50

export default function Notifications() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hideRead, setHideRead] = useState(false)

  const load = useCallback(async (lim: number) => {
    // Fetch one past the limit to know whether a "Show more" is warranted.
    const { data, error } = await supabase
      .from('notifications')
      .select('id, job_order_id, release_order_id, kind, title, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(lim + 1)
    if (error) { setLoadError(error.message); setLoading(false); return }
    setLoadError(null)
    const rows = (data ?? []) as Notif[]
    setHasMore(rows.length > lim)
    setItems(rows.slice(0, lim))
    setLoading(false)
  }, [])
  useEffect(() => { void load(limit) }, [limit, load])

  function openItem(n: Notif) {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      void supabase.rpc('mark_notifications_read', { p_ids: [n.id] }).then(() => undefined, () => undefined)
    }
    routeCustomerNotif(n, navigate)
  }
  function markAll() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? now })))
    void supabase.rpc('mark_notifications_read', { p_ids: null }).then(() => undefined, () => undefined)
  }
  function clearRead() {
    setItems((prev) => prev.filter((x) => !x.read_at))
    void supabase.rpc('clear_read_notifications').then(() => undefined, () => undefined)
  }

  const visibleItems = items.filter((x) => !hideRead || !x.read_at)

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Notifications')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('All your notifications, newest first.')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {items.some((x) => !x.read_at) && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={markAll}>{t('Mark all as read')}</button>}
          {items.some((x) => x.read_at) && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setHideRead((v) => !v)}>{hideRead ? t('Show read notifications') : t('Hide read notifications')}</button>}
          {items.some((x) => x.read_at) && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={clearRead}>{t('Clear read notifications')}</button>}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[52, 52, 52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
          </div>
        ) : loadError ? (
          <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load(limit)}>{t('Retry')}</button>}>{loadError}</Notice>
        ) : visibleItems.length === 0 ? (
          <p className="ktc-label" style={{ fontSize: 14 }}>{t('No notifications yet.')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 2 }}>
            {visibleItems.map((n) => (
              <NotificationRow
                key={n.id}
                icon={(ICON[n.kind] ?? BellIcon)({ size: 17 })}
                title={n.title}
                when={fmtWhen(n.created_at)}
                isRead={!!n.read_at}
                onClick={() => openItem(n)}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ marginTop: 14 }} onClick={() => setLimit((l) => l + PAGE)}>
            {t('Show more')}
          </button>
        )}
      </div>
    </Shell>
  )
}
