import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import PushToggle from './PushToggle'
import { useT } from '../lib/i18n'
import { BellIcon, CreditCardIcon, ChatIcon, IdCardIcon, type IconProps } from './icons'

// Staff-side notification center — the mirror of the customer NotificationBell,
// but routed BY PERMISSION (0085). RLS on staff_notifications already filters
// the shared rows to what this staff member's gate allows, so we just read the
// 20 most recent + the caller's own read markers and compute unread locally.
type Notif = {
  id: string
  required_permission: string
  kind: string
  title: string
  job_order_id: string | null
  ticket_id: string | null
  created_at: string
}

const ICON: Record<string, (p: IconProps) => ReactNode> = {
  payment: CreditCardIcon,
  rps_payment: CreditCardIcon,
  support: ChatIcon,
  account: IdCardIcon,
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function StaffNotificationBell() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  async function load() {
    const [{ data: notifs }, { data: reads }] = await Promise.all([
      supabase
        .from('staff_notifications')
        .select('id, required_permission, kind, title, job_order_id, ticket_id, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('staff_notification_reads')
        .select('notification_id'),
    ])
    setItems((notifs ?? []) as Notif[])
    setReadIds(new Set((reads ?? []).map((r) => r.notification_id as string)))
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

  const unread = items.filter((n) => !readIds.has(n.id)).length

  async function openItem(n: Notif) {
    setOpen(false)
    if (!readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id))
      void supabase.rpc('mark_staff_notifications_read', { p_ids: [n.id] }).then(() => undefined, () => undefined)
    }
    // Route by target: payment/RPS events → the orders list (handing the order
    // id over the same way the customer bell does); support → the inbox;
    // account verifications → the approvals desk; anything else → the admin home.
    if (n.job_order_id) { sessionStorage.setItem('ktc_jo_filed_id', n.job_order_id); navigate('/admin/job-orders'); return }
    if (n.ticket_id) { navigate('/admin/support'); return }
    if (n.kind === 'account') { navigate('/admin/approvals'); return }
    navigate('/admin')
  }

  async function markAll() {
    setReadIds((prev) => {
      const next = new Set(prev)
      items.forEach((n) => next.add(n.id))
      return next
    })
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
              {items.map((n) => {
                const isRead = readIds.has(n.id)
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void openItem(n)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                      padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                      background: isRead ? 'transparent' : 'var(--c-w55)',
                      border: '1px solid ' + (isRead ? 'transparent' : 'var(--glass-brd)'),
                      font: 'inherit', color: 'hsl(var(--ink))',
                    }}
                  >
                    <span aria-hidden style={{ flex: '0 0 auto', display: 'inline-flex', marginTop: 1, color: 'hsl(var(--ink-2))' }}>
                      {(ICON[n.kind] ?? BellIcon)({ size: 17 })}
                    </span>
                    <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, fontWeight: isRead ? 400 : 600 }}>{n.title}</span>
                      <span className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{fmtWhen(n.created_at)}</span>
                    </span>
                    {!isRead && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--acc)', flex: '0 0 auto', marginTop: 5 }} />}
                  </button>
                )
              })}
            </div>
          )}
          <PushToggle variant="bell" />
        </div>
      )}
    </span>
  )
}
