import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import PushToggle from './PushToggle'
import { useT } from '../lib/i18n'
import {
  BellIcon, ChatIcon, AlertTriangleIcon, BanIcon, CheckCircleIcon, CreditCardIcon,
  ReceiptIcon, MegaphoneIcon, TicketIcon, ClockIcon, SparkleIcon, type IconProps,
} from './icons'

// Persistent notification center in the top nav (every page). Shows an unread
// badge; the dropdown lists recent notifications (read + unread) with the
// unread ones highlighted. Backed by the 0071 triggers + mark_notifications_read.
// The Home dashboard keeps its inline bar for a louder "you have updates" cue.
type Notif = { id: string; job_order_id: string | null; kind: string; title: string; created_at: string; read_at: string | null }

// Per-kind line icon (shared set) — replaces the old emoji map.
const ICON: Record<string, (p: IconProps) => ReactNode> = {
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
  serving: TicketIcon,
  payment_reminder: ClockIcon,
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NotificationBell() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  async function load() {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, job_order_id, kind, title, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ])
    setItems((data ?? []) as Notif[])
    setUnread(count ?? 0)
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
    // Route by kind: support replies → the ticket page; order events → the
    // orders list (auto-opening that order); account/announcement → Home.
    if (n.kind === 'support_reply') { navigate('/support'); return }
    if (n.job_order_id) { sessionStorage.setItem('ktc_jo_filed_id', n.job_order_id); navigate('/job-orders'); return }
    navigate('/')
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
    setUnread(0)
    void supabase.rpc('mark_notifications_read', { p_ids: null }).then(() => undefined, () => undefined)
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
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openItem(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                    padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                    background: n.read_at ? 'transparent' : 'var(--c-w55)',
                    border: '1px solid ' + (n.read_at ? 'transparent' : 'var(--glass-brd)'),
                    font: 'inherit', color: 'hsl(var(--ink))',
                  }}
                >
                  <span aria-hidden style={{ flex: '0 0 auto', display: 'inline-flex', marginTop: 1, color: 'hsl(var(--ink-2))' }}>
                    {(ICON[n.kind] ?? BellIcon)({ size: 17 })}
                  </span>
                  <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, fontWeight: n.read_at ? 400 : 600 }}>{n.title}</span>
                    <span className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{fmtWhen(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--acc)', flex: '0 0 auto', marginTop: 5 }} />}
                </button>
              ))}
            </div>
          )}
          <PushToggle variant="bell" />
        </div>
      )}
    </span>
  )
}
