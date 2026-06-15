import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useT } from '../lib/i18n'

// Customer notification bar (Home dashboard). Unread notifications created by
// the 0071 triggers — KTC replies, info-needed, rejections, payment issues,
// approvals. Clicking opens the order; "Mark all read" clears the bar.
type Notif = { id: string; job_order_id: string | null; kind: string; title: string; created_at: string }

const ICON: Record<string, string> = {
  comment: '💬',
  on_hold: '⚠️',
  rejected: '⛔',
  approved: '✅',
  completed: '🎉',
  payment_rejected: '💳',
  payment_confirmed: '💳',
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function NotificationBar() {
  const { t } = useT()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notif[]>([])

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('id, job_order_id, kind, title, created_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(12)
    setItems((data ?? []) as Notif[])
  }
  useEffect(() => { void load() }, [])
  // Refresh every 60s on a visible tab (same pattern as the order list).
  useAutoRefresh(load)

  async function open(n: Notif) {
    setItems((prev) => prev.filter((x) => x.id !== n.id))
    void supabase.rpc('mark_notifications_read', { p_ids: [n.id] })
    if (n.job_order_id) sessionStorage.setItem('ktc_jo_filed_id', n.job_order_id) // auto-opens it if in view
    navigate('/job-orders')
  }

  async function markAll() {
    setItems([])
    void supabase.rpc('mark_notifications_read', { p_ids: null })
  }

  if (items.length === 0) return null

  return (
    <div className="ktc-glass" style={{ padding: '14px 16px', marginBottom: 16, border: '1px solid hsl(var(--line))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>
          🔔 {t('Notifications')} <span className="ktc-chip ktc-chip--accent" style={{ marginLeft: 4 }}>{items.length}</span>
        </span>
        <button type="button" className="ktc-link" style={{ fontSize: 12.5, marginLeft: 'auto' }} onClick={() => void markAll()}>
          {t('Mark all read')}
        </button>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => void open(n)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
              padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', font: 'inherit', color: 'hsl(var(--ink))',
            }}
          >
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1.3, flex: '0 0 auto' }}>{ICON[n.kind] ?? '🔔'}</span>
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span style={{ display: 'block', fontSize: 13, lineHeight: 1.4 }}>{n.title}</span>
              <span className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{fmtWhen(n.created_at)}</span>
            </span>
            <span aria-hidden style={{ color: 'hsl(var(--ink-3))', flex: '0 0 auto', fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
