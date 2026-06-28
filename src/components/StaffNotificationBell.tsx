import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import PushToggle from './PushToggle'
import NotificationRow from './NotificationRow'
import { useT } from '../lib/i18n'
import { BellIcon, CreditCardIcon, ChatIcon, IdCardIcon, BuildingIcon, ReceiptIcon, RefreshIcon, type IconProps } from './icons'

// Staff-side notification center — the mirror of the customer NotificationBell,
// but routed BY PERMISSION (0085). RLS on staff_notifications already filters
// the shared rows to what this staff member's gate allows; we read the 20 most
// recent (+ the caller's own read markers) for the dropdown, but the badge COUNT
// comes from staff_unread_count() (0189) — the latest-20 window under-counted.
// The /admin/notifications history page reuses the type, icon map + routing.
export type Notif = {
  id: string
  required_permission: string
  kind: string
  title: string
  job_order_id: string | null
  release_order_id: string | null
  ticket_id: string | null
  created_at: string
}

export const ICON: Record<string, (p: IconProps) => ReactNode> = {
  payment: CreditCardIcon,
  rps_payment: CreditCardIcon,
  support: ChatIcon,
  account: IdCardIcon,
  release_new: IdCardIcon,
  release_payment: CreditCardIcon,
  consignee: BuildingIcon,
  supplement: ReceiptIcon, // an extra charge tacked onto a JO (0183)
  rexray: RefreshIcon,     // a re-X-ray request (0183) — repeat of the scan
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Single source of routing for a staff notification — shared by the bell and
// the /admin/notifications history page (each handles its own mark-read first).
export function routeStaffNotif(n: Pick<Notif, 'kind' | 'job_order_id' | 'release_order_id' | 'ticket_id'>, navigate: NavigateFunction) {
  // Route by target: payment/RPS events → the orders list (handing the order id
  // over the same way the customer bell does); support → the inbox; account
  // verifications → the approvals desk; anything else → the admin home.
  if (n.job_order_id) { sessionStorage.setItem('ktc_jo_filed_id', n.job_order_id); navigate('/admin/job-orders'); return }
  if (n.release_order_id) { navigate('/admin/releases'); return }
  if (n.ticket_id) { navigate('/admin/support'); return }
  if (n.kind === 'account') { navigate('/admin/approvals'); return }
  // A consignee request has no row id — route to the consignee review desk.
  if (n.kind === 'consignee') { navigate('/admin/consignees'); return }
  navigate('/admin')
}

export default function StaffNotificationBell() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Exact unread badge (0189) — not derived from the latest-20 window, which
  // under-counted once a staffer had more than 20 unread items.
  async function refreshCount() {
    const { data } = await supabase.rpc('staff_unread_count')
    setUnread((data as number | null) ?? 0)
  }

  async function load() {
    const [{ data: notifs }, { data: reads }] = await Promise.all([
      supabase
        .from('staff_notifications')
        .select('id, required_permission, kind, title, job_order_id, release_order_id, ticket_id, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('staff_notification_reads')
        .select('notification_id'),
    ])
    setItems((notifs ?? []) as Notif[])
    setReadIds(new Set((reads ?? []).map((r) => r.notification_id as string)))
    await refreshCount()
  }
  useEffect(() => { void load() }, [])
  // Refresh every 60s on a visible tab (same cadence as the customer bell).
  useAutoRefresh(load)

  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function openItem(n: Notif) {
    setOpen(false)
    if (!readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id))
      setUnread((u) => Math.max(0, u - 1))
      void supabase.rpc('mark_staff_notifications_read', { p_ids: [n.id] }).then(() => undefined, () => undefined)
    }
    routeStaffNotif(n, navigate)
  }

  async function markAll() {
    setReadIds((prev) => {
      const next = new Set(prev)
      items.forEach((n) => next.add(n.id))
      return next
    })
    setUnread(0) // mark_staff_notifications_read(null) clears every unread row server-side
    void supabase.rpc('mark_staff_notifications_read', { p_ids: null }).then(() => undefined, () => undefined)
  }

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
      <button
        type="button"
        className="ktc-nav-bell"
        data-tour="nav-bell"
        aria-label={unread > 0 ? t('Notifications ({n} unread)', { n: unread }) : t('Notifications')}
        aria-expanded={open}
        title={t('Notifications')}
        onClick={() => setOpen((v) => { const next = !v; if (next) void refreshCount(); return next })}
      >
        <BellIcon size={20} />
        {unread > 0 && <span aria-hidden className="ktc-nav-bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div
          className="ktc-glass ktc-notif-panel"
          role="dialog"
          aria-label={t('Notifications')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--glass-brd)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <BellIcon size={15} /> {t('Notifications')}
            </span>
            {unread > 0 && (
              <button type="button" className="ktc-link" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => void markAll()}>
                {t('Mark all read')}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="ktc-label" style={{ fontSize: 12.5, padding: '18px 14px', opacity: 0.75, margin: 0 }}>
              {t('No notifications yet.')}
            </p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  icon={(ICON[n.kind] ?? BellIcon)({ size: 17 })}
                  title={n.title}
                  when={fmtWhen(n.created_at)}
                  isRead={readIds.has(n.id)}
                  onClick={() => void openItem(n)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="ktc-link"
            style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 12, padding: '10px 14px', borderTop: '1px solid var(--glass-brd)' }}
            onClick={() => { setOpen(false); navigate('/admin/notifications') }}
          >
            {t('View all')}
          </button>
          <PushToggle variant="bell" />
        </div>
      )}
    </span>
  )
}
