import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { usePermissions } from '../lib/usePermissions'
import Notice, { type NoticeTone } from '../components/Notice'

// Admin editor over notification_settings (0205/0208): route each customer-facing
// event to email / SMS / both / off. The send-time dispatch reads this server-side
// (notification_channel definer); this screen only writes via set_notification_channel.
type Row = { event_type: string; channel: string; label: string | null }

const CHANNELS: { value: string; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'both', label: 'Email + SMS' },
  { value: 'off', label: 'Off' },
]

export default function SettingsNotifications() {
  const { t } = useT()
  const { broker } = usePermissions()
  const isAdmin = !!(broker?.is_admin || broker?.is_owner)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: NoticeTone; text: string } | null>(null)

  async function load() {
    setLoadError(null)
    const { data, error } = await supabase
      .from('notification_settings')
      .select('event_type, channel, label')
      .order('event_type')
    if (error) { setLoadError(error.message); setLoading(false); return }
    setRows((data ?? []) as Row[])
    setLoading(false)
  }
  useEffect(() => { if (isAdmin) void load() }, [isAdmin])

  async function setChannel(event_type: string, channel: string) {
    const prev = rows
    setRows((rs) => rs.map((r) => (r.event_type === event_type ? { ...r, channel } : r)))
    setMsg(null)
    const { error } = await supabase.rpc('set_notification_channel', { p_event: event_type, p_channel: channel })
    if (error) { setRows(prev); setMsg({ tone: 'error', text: error.message }); return }
    setMsg({ tone: 'success', text: t('✓ Saved.') })
  }

  if (!isAdmin) return null

  return (
    <div className="ktc-glass" style={{ padding: 18, marginBottom: 18 }}>
      <h1 className="ktc-title">{t('Notifications')}</h1>
      <p className="ktc-sub" style={{ marginBottom: 16 }}>
        {t('Choose how customers are notified for each event. SMS uses the connected gateway.')}
      </p>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }} aria-label={t('Loading…')}>
          {[44, 44, 44].map((h, i) => (
            <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />
          ))}
        </div>
      ) : loadError ? (
        <Notice tone="error" title={t("Couldn't load — tap Retry")}
          action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>
          {loadError}
        </Notice>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.event_type} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>{t(r.label ?? r.event_type)}</span>
              <select className="ktc-input" value={r.channel} onChange={(e) => void setChannel(r.event_type, e.target.value)}
                aria-label={t(r.label ?? r.event_type)} style={{ width: 'auto', minWidth: 150, padding: '7px 10px', fontSize: 13 }}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{t(c.label)}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {msg && <Notice tone={msg.tone} style={{ marginTop: 12 }}>{msg.text}</Notice>}
    </div>
  )
}
