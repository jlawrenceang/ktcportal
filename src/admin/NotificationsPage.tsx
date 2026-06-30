import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { BellIcon } from '../components/icons'
import NotificationRow from '../components/NotificationRow'
import { ICON, fmtWhen, routeStaffNotif, type Notif } from '../components/StaffNotificationBell'

// Staff "View all" notification history (/admin/notifications). The bell keeps
// only the latest 20; this lists every staff_notification the caller may see
// (RLS-scoped) newest-first, joining the caller's own read markers to show
// read/unread. Rows + icons + routing are reused from StaffNotificationBell.
const PAGE = 50

export default function NotificationsPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hideRead, setHideRead] = useState(false)

  const load = useCallback(async (lim: number) => {
    const [{ data: notifs }, { data: reads }] = await Promise.all([
      supabase
        .from('staff_notifications')
        .select('id, required_permission, kind, title, job_order_id, release_order_id, ticket_id, created_at')
        .order('created_at', { ascending: false })
        .limit(lim + 1),
      supabase
        .from('staff_notification_reads')
        .select('notification_id'),
    ])
    const rows = (notifs ?? []) as Notif[]
    setHasMore(rows.length > lim)
    setItems(rows.slice(0, lim))
    setReadIds(new Set((reads ?? []).map((r) => r.notification_id as string)))
    setLoading(false)
  }, [])
  useEffect(() => { void load(limit) }, [limit, load])

  function openItem(n: Notif) {
    if (!readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id))
      void supabase.rpc('mark_staff_notifications_read', { p_ids: [n.id] }).then(() => undefined, () => undefined)
    }
    routeStaffNotif(n, navigate)
  }
  function markAll() {
    setReadIds((prev) => {
      const next = new Set(prev)
      items.forEach((n) => next.add(n.id))
      return next
    })
    void supabase.rpc('mark_staff_notifications_read', { p_ids: null }).then(() => undefined, () => undefined)
  }

  const visibleItems = items.filter((x) => !hideRead || !readIds.has(x.id))

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Notifications')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Staff notifications you can see, newest first.')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {items.some((x) => !readIds.has(x.id)) && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={markAll}>{t('Mark all as read')}</button>}
          {items.some((x) => readIds.has(x.id)) && <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setHideRead((v) => !v)}>{hideRead ? t('Show read notifications') : t('Hide read notifications')}</button>}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[52, 52, 52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
          </div>
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
                isRead={readIds.has(n.id)}
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
    </AdminShell>
  )
}
