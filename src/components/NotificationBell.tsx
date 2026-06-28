import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import PushToggle from './PushToggle'
import NotificationRow from './NotificationRow'
import Notice from './Notice'
import { useT } from '../lib/i18n'
import {
  BellIcon, ChatIcon, AlertTriangleIcon, BanIcon, CheckCircleIcon, CreditCardIcon,
  ReceiptIcon, MegaphoneIcon, ClockIcon, SparkleIcon, type IconProps,
} from './icons'

// Persistent notification center in the top nav (every page). Shows an unread
// badge; the dropdown lists recent notifications (read + unread) with the
// unread ones highlighted. Backed by the 0071 triggers + mark_notifications_read.
// The Home dashboard keeps its inline bar for a louder "you have updates" cue.
// The /notifications history page reuses the type, icon map, fmtWhen + routing.
export type Notif = { id: string; job_order_id: string | null; release_order_id: string | null; kind: string; title: string; created_at: string; read_at: string | null }

// Per-kind line icon (shared set) — replaces the old emoji map.
export const ICON: Record<string, (p: IconProps) => ReactNode> = {
  comment: ChatIcon,
  on_hold: AlertTriangleIcon,
  rejected: BanIcon,
  approved: CheckCircleIcon,
  completed: CheckCircleIcon,
  payment_rejected: CreditCardIcon,
  payment_confirmed: CreditCardIcon,
  account_approved: SparkleIcon,
  rps: ReceiptIcon,
  announcement: MegaphoneIcon,
  support_reply: ChatIcon,
  payment_reminder: ClockIcon,
  consignee_approved: CheckCircleIcon,
  consignee_rejected: BanIcon,
  consignee_needs_info: AlertTriangleIcon,
  release_payable: ReceiptIcon,
  release_confirmed: CreditCardIcon,
  release_rejected: CreditCardIcon,
  release_released: CheckCircleIcon,
  release_on_hold: AlertTriangleIcon,
  release_cancelled: BanIcon,
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Single source of routing for a customer notification — shared by the bell and
// the /notifications history page (each handles its own mark-read state first).
export function routeCustomerNotif(n: Pick<Notif, 'kind' | 'job_order_id' | 'release_order_id'>, navigate: NavigateFunction) {
  // Route by kind: support replies → the ticket page; order events → the
  // orders list (auto-opening that order); account/announcement → Home.
  if (n.kind === 'support_reply') { navigate('/support'); return }
  if (n.kind.startsWith('consignee_')) { navigate('/requests'); return }
  if (n.release_order_id) { navigate('/releases'); return }
  if (n.job_order_id) { sessionStorage.setItem('ktc_jo_filed_id', n.job_order_id); navigate('/job-orders'); return }
  navigate('/')
}

export default function NotificationBell() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)

  async function load() {
    const [itemsRes, countRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, job_order_id, release_order_id, kind, title, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ])
    if (itemsRes.error || countRes.error) {
      setLoadError((itemsRes.error ?? countRes.error)!.message)
      return
    }
    setLoadError(null)
    setItems((itemsRes.data ?? []) as Notif[])
    setUnread(countRes.count ?? 0)
  }
  useEffect(() => { void load() }, [])
  // Refresh every 60s on a visible tab (same cadence as the order list).
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
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
      void supabase.rpc('mark_notifications_read', { p_ids: [n.id] }).then(() => undefined, () => undefined)
    }
    routeCustomerNotif(n, navigate)
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
    setUnread(0)
    void supabase.rpc('mark_notifications_read', { p_ids: null }).then(() => undefined, () => undefined)
  }

  // Clear (delete) the already-read notifications, keeping unread ones. Optimistic.
  async function clearRead() {
    setItems((prev) => prev.filter((x) => !x.read_at))
    void supabase.rpc('clear_read_notifications').then(() => undefined, () => undefined)
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
        onClick={() => setOpen((v) => !v)}
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
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, flex: '0 0 auto' }}>
              {unread > 0 && (
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void markAll()}>
                  {t('Mark all read')}
                </button>
              )}
              {items.some((x) => x.read_at) && (
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void clearRead()}>
                  {t('Clear read')}
                </button>
              )}
            </span>
          </div>

          {loadError ? (
            <div style={{ padding: 10 }}>
              <Notice tone="error" title={t("Couldn't load — tap Retry")} action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()}>{t('Retry')}</button>}>{loadError}</Notice>
            </div>
          ) : items.length === 0 ? (
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
                  isRead={!!n.read_at}
                  onClick={() => void openItem(n)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="ktc-link"
            style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 12, padding: '10px 14px', borderTop: '1px solid var(--glass-brd)' }}
            onClick={() => { setOpen(false); navigate('/notifications') }}
          >
            {t('View all')}
          </button>
          <PushToggle variant="bell" />
        </div>
      )}
    </span>
  )
}
